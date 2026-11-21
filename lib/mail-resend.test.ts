import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMailSender } from "./mail.ts";
import { createResendSender, MAIL_ATTACHMENT_BUDGET_BYTES, readResendConfig, type ResendFetch } from "./mail-resend.ts";
import { recoveryAcknowledgement, requestRecovery, type RecoveryCandidate, type RecoveryStore } from "./recovery.ts";

const apiKey = `re_${"a".repeat(8)}_${"b".repeat(24)}`;
const from = "pedidos@comercio.test";
const namedFrom = "AtajoLab <pedidos@mail.atajolab.dev>";
const buyer = "cliente@example.com";
const origin = "http://localhost:3001";
const now = new Date("2026-10-27T18:00:00.000Z");

type Call = {
  url: string;
  method: string;
  authorization: string | null;
  body: unknown;
};

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeResend(options: {
  emailStatus?: number;
  emailBody?: unknown;
  failOn?: "emails";
}): { calls: Call[]; fetchImpl: ResendFetch } {
  const calls: Call[] = [];
  const fetchImpl: ResendFetch = async (url, init) => {
    const headers = new Headers(init.headers);
    calls.push({
      url,
      method: init.method ?? "GET",
      authorization: headers.get("authorization"),
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    });
    if (url.includes("/domains")) return response(401, { name: "restricted_api_key" });
    if (options.failOn === "emails") throw new Error("red caída");
    return response(options.emailStatus ?? 200, options.emailBody ?? { id: "email_1" });
  };
  return { calls, fetchImpl };
}

function memory(orders: RecoveryCandidate[]) {
  const links = new Map<string, { tokenHash: string; orderId: string; expiresAt: Date; usedAt: Date | null }>();
  const store: RecoveryStore = {
    async findOrders(email) {
      return orders.filter((order) => order.buyerEmail === email);
    },
    async countActiveLinks() {
      return 0;
    },
    async saveLink(record) {
      links.set(record.tokenHash, { ...record });
      return true;
    },
    async revoke(tokenHashes) {
      for (const tokenHash of tokenHashes) links.delete(tokenHash);
    },
  };
  return { store, links };
}

{
  assert.equal(readResendConfig({ NODE_ENV: "production" }), null);
  assert.equal(readResendConfig({ NODE_ENV: "production", RESEND_API_KEY: "re_", EMAIL_FROM: from }), null);
  assert.equal(readResendConfig({ NODE_ENV: "production", RESEND_API_KEY: "secret_re_abc", EMAIL_FROM: from }), null);
  assert.equal(readResendConfig({ NODE_ENV: "production", RESEND_API_KEY: apiKey, EMAIL_FROM: "no-es-correo" }), null);
  assert.equal(
    readResendConfig({ NODE_ENV: "production", RESEND_API_KEY: apiKey, EMAIL_FROM: "onboarding@resend.dev" }),
    null,
  );
  assert.equal(
    readResendConfig({ NODE_ENV: "production", RESEND_API_KEY: apiKey, EMAIL_FROM: "Resend <onboarding@resend.dev>" }),
    null,
  );
  assert.deepEqual(readResendConfig({ NODE_ENV: "production", RESEND_API_KEY: ` ${apiKey} `, EMAIL_FROM: from }), {
    apiKey,
    from,
  });
  assert.deepEqual(readResendConfig({ NODE_ENV: "production", RESEND_API_KEY: "re_short", EMAIL_FROM: from }), {
    apiKey: "re_short",
    from,
  });
  assert.deepEqual(
    readResendConfig({ NODE_ENV: "production", RESEND_API_KEY: apiKey, EMAIL_FROM: ` ${namedFrom} ` }),
    { apiKey, from: "AtajoLab <pedidos@mail.atajolab.dev>" },
  );
  assert.equal(
    readResendConfig({ NODE_ENV: "production", RESEND_API_KEY: apiKey, EMAIL_FROM: "AtajoLab <no-es-correo>" }),
    null,
  );
}

{
  const directory = await mkdtemp(path.join(tmpdir(), "atajolab-resend-"));
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const sent = fakeResend({});
    const sender = createMailSender(
      { NODE_ENV: "production", EMAIL_PROVIDER: "resend", RESEND_API_KEY: apiKey, EMAIL_FROM: from },
      directory,
      sent.fetchImpl,
    );
    assert.equal(sender.mode, "resend");
    const box = memory([
      { publicId: "paid-a", status: "PAID", buyerEmail: buyer, label: "Panadería Sur" },
      { publicId: "paid-b", status: "PAID", buyerEmail: "otro@example.com", label: "Otro local" },
      { publicId: "pending-a", status: "PENDING", buyerEmail: buyer, label: "Pendiente" },
    ]);
    const acknowledgement = await requestRecovery({
      email: "Cliente@Example.com",
      now,
      origin,
      limited: false,
      store: box.store,
      sender,
    });
    assert.deepEqual(acknowledgement, recoveryAcknowledgement());
    assert.equal(JSON.stringify(acknowledgement).includes("/acceso/"), false);
    assert.equal(JSON.stringify(acknowledgement).includes(apiKey), false);
    const post = sent.calls.find((call) => call.url.endsWith("/emails"));
    assert.ok(post);
    assert.equal(post.method, "POST");
    assert.equal(post.authorization, `Bearer ${apiKey}`);
    assert.equal(sent.calls.some((call) => call.url.includes("/domains")), false);
    assert.deepEqual((post.body as { to: string[]; from: string }).to, [buyer]);
    assert.equal((post.body as { from: string }).from, from);
    assert.equal(String((post.body as { text: string }).text).includes("Otro local"), false);
    assert.equal(String((post.body as { text: string }).text).includes("Pendiente"), false);
    assert.equal(box.links.size, 1);
    const outbox = await readFile(path.join(directory, "mail-outbox.jsonl"), "utf8").catch(() => "");
    assert.equal(outbox.includes("/acceso/"), false);

    const named = fakeResend({});
    const namedSender = createMailSender(
      { NODE_ENV: "production", EMAIL_PROVIDER: "resend", RESEND_API_KEY: apiKey, EMAIL_FROM: namedFrom },
      directory,
      named.fetchImpl,
    );
    const namedBox = memory([{ publicId: "paid-a", status: "PAID", buyerEmail: buyer, label: "Panadería Sur" }]);
    const namedReply = await requestRecovery({
      email: buyer,
      now,
      origin,
      limited: false,
      store: namedBox.store,
      sender: namedSender,
    });
    assert.deepEqual(namedReply, acknowledgement);
    assert.equal(named.calls.some((call) => call.url.includes("/domains")), false);
    const namedPost = named.calls.find((call) => call.url.endsWith("/emails"));
    assert.equal(namedPost?.method, "POST");
    assert.equal((namedPost?.body as { from: string }).from, "AtajoLab <pedidos@mail.atajolab.dev>");
    assert.equal(namedBox.links.size, 1);

    const rejected = fakeResend({
      emailStatus: 403,
      emailBody: { name: "validation_error", message: "domain is not verified" },
    });
    const blocked = createResendSender(
      { apiKey, from: "AtajoLab <pedidos@mail.atajolab.dev>" },
      rejected.fetchImpl,
    );
    const pendingBox = memory([{ publicId: "paid-a", status: "PAID", buyerEmail: buyer, label: "Panadería Sur" }]);
    const pendingReply = await requestRecovery({
      email: buyer,
      now,
      origin,
      limited: false,
      store: pendingBox.store,
      sender: blocked,
    });
    assert.deepEqual(pendingReply, acknowledgement);
    assert.equal(JSON.stringify(pendingReply).includes("/acceso/"), false);
    assert.equal(rejected.calls.some((call) => call.url.includes("/domains")), false);
    assert.equal(rejected.calls.some((call) => call.url.endsWith("/emails")), true);
    assert.equal(pendingBox.links.size, 0);

    const echoed = `http://localhost:3001/acceso/${"b".repeat(43)}`;
    const failed = fakeResend({ emailStatus: 422, emailBody: { message: echoed } });
    const failedSender = createResendSender({ apiKey, from }, failed.fetchImpl);
    const failedBox = memory([{ publicId: "paid-a", status: "PAID", buyerEmail: buyer, label: "Panadería Sur" }]);
    const failedReply = await requestRecovery({
      email: buyer,
      now,
      origin,
      limited: false,
      store: failedBox.store,
      sender: failedSender,
    });
    assert.deepEqual(failedReply, acknowledgement);
    assert.equal(JSON.stringify(failedReply).includes(echoed), false);
    assert.equal(failedBox.links.size, 0);

    const down = fakeResend({ failOn: "emails" });
    assert.equal(
      await createResendSender({ apiKey, from }, down.fetchImpl).send({
        to: buyer,
        subject: "Acceso",
        text: echoed,
      }),
      "retryable",
    );
    assert.equal(
      await createResendSender({ apiKey, from }, fakeResend({ emailStatus: 503 }).fetchImpl).send({
        to: buyer,
        subject: "Acceso",
        text: echoed,
      }),
      "retryable",
    );
    assert.equal(
      await createResendSender({ apiKey, from }, fakeResend({ emailStatus: 429 }).fetchImpl).send({
        to: buyer,
        subject: "Acceso",
        text: echoed,
      }),
      "retryable",
    );
    assert.equal(
      await createResendSender({ apiKey, from }, fakeResend({}).fetchImpl).send({
        to: `${buyer}\nBcc:otro@example.com`,
        subject: "Acceso",
        text: "hola",
      }),
      "refused",
    );
    assert.equal(
      await createResendSender({ apiKey, from }, fakeResend({ emailStatus: 401 }).fetchImpl).send({
        to: buyer,
        subject: "Acceso",
        text: echoed,
      }),
      "refused",
    );

    const missing = createMailSender(
      { NODE_ENV: "production", EMAIL_PROVIDER: "resend", EMAIL_FROM: from },
      directory,
      fakeResend({}).fetchImpl,
    );
    assert.equal(missing.mode, "unconfigured");
    assert.equal(missing.canDispatch, false);
    assert.equal(await missing.send({ to: buyer, subject: "Acceso", text: echoed }), "refused");

    const sandbox = createMailSender(
      { NODE_ENV: "production", EMAIL_PROVIDER: "resend", RESEND_API_KEY: apiKey, EMAIL_FROM: "onboarding@resend.dev" },
      directory,
      fakeResend({}).fetchImpl,
    );
    assert.equal(sandbox.canDispatch, false);

    const local = createMailSender(
      { NODE_ENV: "development", RESEND_API_KEY: apiKey, EMAIL_FROM: from },
      directory,
      fakeResend({}).fetchImpl,
    );
    assert.equal(local.mode, "dev-outbox");
    assert.equal(logged.some((entry) => JSON.stringify(entry).includes(apiKey)), false);
    assert.equal(logged.some((entry) => JSON.stringify(entry).includes(echoed)), false);
  } finally {
    console.error = original;
    await rm(directory, { recursive: true, force: true });
  }
}

// HTML, attachments and reply-to travel to Resend as the API expects; the size budget is enforced.
{
  const { calls, fetchImpl } = fakeResend({});
  const resend = createResendSender({ apiKey, from }, fetchImpl);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const outcome = await resend.send({
    to: buyer,
    subject: "Tu compra",
    text: "texto",
    html: "<p>hola</p>",
    replyTo: "ayuda@comercio.test",
    attachments: [{ filename: "diseno.png", content: png, contentType: "image/png" }],
  });
  assert.equal(outcome, "sent");
  const body = calls[0]?.body as {
    html: string;
    text: string;
    reply_to: string;
    attachments: { filename: string; content: string; content_type: string }[];
  };
  assert.equal(body.html, "<p>hola</p>");
  assert.equal(body.text, "texto");
  assert.equal(body.reply_to, "ayuda@comercio.test");
  assert.equal(body.attachments[0]?.filename, "diseno.png");
  assert.equal(body.attachments[0]?.content_type, "image/png");
  assert.deepEqual(Buffer.from(body.attachments[0]!.content, "base64"), png);

  const tooBig = await resend.send({
    to: buyer,
    subject: "Tu compra",
    text: "texto",
    attachments: [{ filename: "enorme.png", content: Buffer.alloc(MAIL_ATTACHMENT_BUDGET_BYTES + 1), contentType: "image/png" }],
  });
  assert.equal(tooBig, "refused");
  assert.equal(calls.length, 1, "an oversize message is not even sent");

  // The provider rejecting the payload (413/422) is permanent; a 5xx is worth another try.
  assert.equal(
    await createResendSender({ apiKey, from }, fakeResend({ emailStatus: 413 }).fetchImpl).send({ to: buyer, subject: "x", text: "y" }),
    "refused",
  );
  assert.equal(
    await createResendSender({ apiKey, from }, fakeResend({ emailStatus: 503 }).fetchImpl).send({ to: buyer, subject: "x", text: "y" }),
    "retryable",
  );
}

// The local outbox keeps the attachments as files so a message can be inspected end to end.
{
  const directory = await mkdtemp(path.join(tmpdir(), "mail-attach-"));
  try {
    const local = createMailSender({ NODE_ENV: "development" }, directory);
    const content = Buffer.from("pdf-bytes");
    assert.equal(
      await local.send({
        to: buyer,
        subject: "s",
        text: "t",
        html: "<b>h</b>",
        attachments: [{ filename: "a b.pdf", content, contentType: "application/pdf" }],
      }),
      "held",
    );
    const line = JSON.parse((await readFile(path.join(directory, "mail-outbox.jsonl"), "utf8")).trim()) as {
      attachments: { filename: string; bytes: number; file: string }[];
      html: string;
    };
    assert.equal(line.html, "<b>h</b>");
    assert.equal(line.attachments[0]?.bytes, content.length);
    assert.deepEqual(await readFile(path.join(directory, line.attachments[0]!.file)), content);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

console.log("resend mail checks passed");
