import assert from "node:assert/strict";
import sharp from "sharp";
import { parseOrderDraft } from "@/lib/order-draft";
import { createMemoryRateLimiter } from "@/lib/rate-limit/postgres";
import {
  createMemoryStudioAssetStore,
  createStudioDraftKey,
  hashStudioDraftKey,
  putStudioAssetForDraft,
  STUDIO_ASSET_MAX_PER_DRAFT,
} from "@/lib/studio/assets/index";
import { studioAssetRef } from "@/lib/studio/assets/refs";
import {
  clearStudioDraftCookie,
  issueStudioDraftSession,
  readStudioDraftKey,
  studioClientKeyFromRequest,
  studioDraftCookie,
  studioRequestTrusted,
  STUDIO_DRAFT_COOKIE,
} from "@/lib/studio/draft-session";
import { createStudioOrderIdempotencyKey } from "@/lib/studio/order-idempotency";
import { prepareStudioOrderDocument } from "@/lib/studio/prepare-order";
import {
  createStudioTestRateLimiter,
  limitStudioDraftSession,
  limitStudioOrderCreate,
  limitStudioUpload,
  setStudioRateLimiterForTests,
  STUDIO_DRAFT_LIMIT,
  STUDIO_UPLOAD_IP_LIMIT,
} from "@/lib/studio/rate-limits";
import { updateElement } from "@/lib/studio/document";
import { createDocument } from "@/lib/studio/templates";
import type { DesignDocumentV8 } from "@/lib/studio/types";
import { studioCleanupAuthorized } from "@/lib/studio/assets/cleanup-job";

const REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop";

function withQr(document: DesignDocumentV8, value: string): DesignDocumentV8 {
  const qr = document.elements.find((element) => element.type === "qr");
  assert.ok(qr);
  return updateElement(document, qr.id, { value });
}

function withImage(document: DesignDocumentV8, id: string, src: string): DesignDocumentV8 {
  return {
    ...document,
    elements: [
      ...document.elements.filter((element) => element.type !== "image"),
      {
        id,
        role: null,
        type: "image",
        x: 12,
        y: 40,
        width: 28,
        height: 28,
        rotation: 0,
        src,
        alt: "logo",
      },
    ],
  };
}

async function pngOpaque(): Promise<Buffer> {
  return sharp({
    create: { width: 48, height: 32, channels: 3, background: { r: 20, g: 90, b: 80 } },
  })
    .png()
    .toBuffer();
}

{
  const issued = issueStudioDraftSession(null);
  assert.equal(issued.created, true);
  assert.equal(issued.setCookie, true);
  assert.match(studioDraftCookie(issued.draftKey, false), new RegExp(`^${STUDIO_DRAFT_COOKIE}=`));
  assert.match(studioDraftCookie(issued.draftKey, false), /HttpOnly/);
  assert.match(studioDraftCookie(issued.draftKey, false), /SameSite=Lax/);
  assert.match(studioDraftCookie(issued.draftKey, true), /Secure/);
  assert.equal(readStudioDraftKey(studioDraftCookie(issued.draftKey, false)), issued.draftKey);
  assert.equal(readStudioDraftKey(`${STUDIO_DRAFT_COOKIE}=tampered`), null);
  assert.equal(readStudioDraftKey(null), null);
  assert.match(clearStudioDraftCookie(false), /Max-Age=0/);

  const reused = issueStudioDraftSession(issued.draftKey);
  assert.equal(reused.created, false);
  assert.equal(reused.setCookie, false);
  assert.equal(reused.draftKey, issued.draftKey);

  // Client-chosen / malformed keys must not mint a session identity.
  assert.equal(issueStudioDraftSession("not-a-valid-draft-key!!!!!!!!!!!").created, true);
  assert.notEqual(
    issueStudioDraftSession("not-a-valid-draft-key!!!!!!!!!!!").draftKey,
    "not-a-valid-draft-key!!!!!!!!!!!",
  );
}

{
  // Default trust=off: forgeable headers collapse to the shared untrusted bucket.
  const offEnv = { RATE_LIMIT_TRUST_PROXY: "" };
  const spoofed = studioClientKeyFromRequest(
    new Request("http://localhost/api/studio/draft", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "cf-ray": "aaaaaaaaaaaaaaaa-EZE",
        "x-forwarded-for": "198.51.100.1, 203.0.113.10",
        "x-real-ip": "198.51.100.55",
      },
    }),
    offEnv,
  );
  assert.equal(spoofed, "untrusted");

  const cfEnv = { RATE_LIMIT_TRUST_PROXY: "cloudflare" };
  const viaCf = studioClientKeyFromRequest(
    new Request("http://localhost/api/studio/draft", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "cf-ray": "aaaaaaaaaaaaaaaa-EZE",
        "x-forwarded-for": "198.51.100.1, 203.0.113.10",
      },
    }),
    cfEnv,
  );
  const viaCfAgain = studioClientKeyFromRequest(
    new Request("http://localhost/api/studio/draft", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "cf-ray": "bbbbbbbbbbbbbbbb-EZE",
      },
    }),
    cfEnv,
  );
  assert.equal(viaCf, viaCfAgain);
  assert.equal(viaCf.length, 32);
  assert.equal(viaCf.includes("203.0.113.10"), false);

  const spoofedXff = studioClientKeyFromRequest(
    new Request("http://localhost/api/studio/draft", {
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.10" },
    }),
    cfEnv,
  );
  assert.equal(spoofedXff, "untrusted");

  const viaRealIp = studioClientKeyFromRequest(
    new Request("http://localhost/api/studio/draft", {
      headers: { "x-real-ip": "198.51.100.55" },
    }),
    cfEnv,
  );
  assert.equal(viaRealIp, "untrusted");
}

{
  const request = new Request("http://localhost:3001/api/studio/draft", {
    method: "POST",
    headers: { origin: "http://localhost:3001", host: "localhost:3001" },
  });
  assert.equal(studioRequestTrusted(request, { APP_URL: "http://localhost:3001" }), true);
  assert.equal(
    studioRequestTrusted(
      new Request("http://localhost:3001/api/studio/draft", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "localhost:3001" },
      }),
      { APP_URL: "http://localhost:3001" },
    ),
    false,
  );
  assert.equal(
    studioRequestTrusted(
      new Request("http://localhost:3001/api/studio/draft", { method: "POST", headers: { host: "localhost:3001" } }),
      { APP_URL: "http://localhost:3001" },
    ),
    false,
  );
}

{
  assert.equal(studioCleanupAuthorized(null, { STUDIO_CLEANUP_SECRET: "abcdefghijklmnopqrstuvwxyz" }), false);
  assert.equal(
    studioCleanupAuthorized("Bearer abcdefghijklmnopqrstuvwxyz", {
      STUDIO_CLEANUP_SECRET: "abcdefghijklmnopqrstuvwxyz",
    }),
    true,
  );
  assert.equal(
    studioCleanupAuthorized("Bearer wrong-secret-value!!!!!!", {
      STUDIO_CLEANUP_SECRET: "abcdefghijklmnopqrstuvwxyz",
    }),
    false,
  );
  assert.equal(studioCleanupAuthorized("Bearer short", { STUDIO_CLEANUP_SECRET: "short" }), false);
}

{
  const limiter = createStudioTestRateLimiter();
  setStudioRateLimiterForTests(limiter);
  for (let index = 0; index < STUDIO_DRAFT_LIMIT.limit; index += 1) {
    assert.equal((await limitStudioDraftSession("client-a", limiter)).ok, true);
  }
  assert.equal((await limitStudioDraftSession("client-a", limiter)).ok, false);
  assert.equal((await limitStudioDraftSession("client-b", limiter)).ok, true);

  const uploadLimiter = createMemoryRateLimiter();
  const draftHash = hashStudioDraftKey(createStudioDraftKey());
  for (let index = 0; index < STUDIO_UPLOAD_IP_LIMIT.limit; index += 1) {
    assert.equal((await limitStudioUpload("ip-1", draftHash, uploadLimiter)).ok, true);
  }
  assert.equal((await limitStudioUpload("ip-1", draftHash, uploadLimiter)).ok, false);

  const orderLimiter = createMemoryRateLimiter();
  assert.equal((await limitStudioOrderCreate("ip-2", draftHash, orderLimiter)).ok, true);
  setStudioRateLimiterForTests(null);
}

{
  const draftKey = createStudioDraftKey();
  const body = {
    version: 8,
    email: "cliente@example.com",
    document: withQr(createDocument("corporativo"), REVIEW_URL),
    idempotencyKey: createStudioOrderIdempotencyKey(),
  };
  assert.equal(parseOrderDraft(body, { studioDraftKey: draftKey }).ok, true);
  assert.equal(parseOrderDraft(body).ok, false);
  assert.equal(parseOrderDraft({ ...body, draftKey }, { studioDraftKey: draftKey }).ok, false);
}

{
  const store = createMemoryStudioAssetStore();
  const draftHash = hashStudioDraftKey(createStudioDraftKey());
  for (let index = 0; index < STUDIO_ASSET_MAX_PER_DRAFT; index += 1) {
    const variant = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 3,
        background: { r: (index * 17) % 255, g: 40, b: (index * 11) % 255 },
      },
    })
      .png()
      .toBuffer();
    const put = await putStudioAssetForDraft({ store, draftKeyHash: draftHash, bytes: variant });
    assert.equal(put.ok, true, `quota seed ${index}`);
  }
  const over = await putStudioAssetForDraft({
    store,
    draftKeyHash: draftHash,
    bytes: await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 10, b: 10 } },
    })
      .png()
      .toBuffer(),
  });
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.error, "draft-quota");
}

{
  const bytes = await pngOpaque();
  const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  const document = withImage(withQr(createDocument("corporativo"), REVIEW_URL), "logo", dataUrl);
  const uploads: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/studio/draft")) {
      return new Response(JSON.stringify({ ok: true, created: true }), { status: 201 });
    }
    if (url.endsWith("/api/studio/assets")) {
      uploads.push(url);
      const id = createStudioDraftKey().slice(0, 24);
      return new Response(
        JSON.stringify({
          id,
          width: 48,
          height: 32,
          mime: "image/png",
          byteLength: bytes.length,
          reused: uploads.length > 1,
        }),
        { status: uploads.length > 1 ? 200 : 201 },
      );
    }
    return new Response(JSON.stringify({ error: "not-found" }), { status: 404 });
  }) as typeof fetch;

  const prepared = await prepareStudioOrderDocument({
    document,
    fetchImpl,
    dataUrlToBlob: (src) => {
      const match = /^data:image\/png;base64,(.+)$/i.exec(src);
      assert.ok(match);
      return new Blob([Buffer.from(match[1]!, "base64")], { type: "image/png" });
    },
  });
  assert.equal(prepared.ok, true);
  if (prepared.ok) {
    assert.equal(document.elements.some((element) => element.type === "image" && element.src === dataUrl), true);
    assert.equal(
      prepared.commercialDocument.elements.some(
        (element) => element.type === "image" && Boolean(element.src.startsWith("asset:")),
      ),
      true,
    );
    assert.ok(prepared.assetIds.length >= 1);
  }

  const failing = await prepareStudioOrderDocument({
    document,
    fetchImpl: (async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/studio/draft")) {
        return new Response(JSON.stringify({ ok: true, created: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unsupported-type" }), { status: 400 });
    }) as typeof fetch,
    dataUrlToBlob: () => new Blob([bytes], { type: "image/png" }),
  });
  assert.equal(failing.ok, false);

  // Retry succeeds after a transient failure.
  let attempts = 0;
  const flaky = await prepareStudioOrderDocument({
    document,
    fetchImpl: (async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/studio/draft")) {
        return new Response(JSON.stringify({ ok: true, created: false }), { status: 200 });
      }
      attempts += 1;
      if (attempts < 2) {
        return new Response(JSON.stringify({ error: "upload-failed" }), { status: 500 });
      }
      return new Response(
        JSON.stringify({
          id: "abcdefghijklmnopqrstuvwx",
          width: 48,
          height: 32,
          mime: "image/png",
          byteLength: bytes.length,
          reused: false,
        }),
        { status: 201 },
      );
    }) as typeof fetch,
    dataUrlToBlob: () => new Blob([bytes], { type: "image/png" }),
  });
  assert.equal(flaky.ok, true);
  assert.ok(attempts >= 2);

  const alreadyRef = withImage(
    withQr(createDocument("creativo"), REVIEW_URL),
    "logo",
    studioAssetRef("abcdefghijklmnopqrstuvwx"),
  );
  const noUpload = await prepareStudioOrderDocument({
    document: alreadyRef,
    fetchImpl: (async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/studio/draft")) {
        return new Response(JSON.stringify({ ok: true, created: false }), { status: 200 });
      }
      throw new Error("should-not-upload");
    }) as typeof fetch,
  });
  assert.equal(noUpload.ok, true);
}

console.log("secure-upload tests ok");
