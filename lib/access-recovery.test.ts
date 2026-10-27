import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ACCESS_TOKEN_PATTERN,
  accessRedirect,
  consumeAccessLink,
  hashAccessToken,
  issueAccessLink,
  linkCapOpen,
  recoveryMail,
  trustedPublicOrigin,
} from "./access-link.ts";
import { parseBuyerEmail } from "./buyer-email.ts";
import { createDevOutbox, createMailSender, type MailMessage, type MailResult, type MailSender } from "./mail.ts";
import { createDeliveryKey, digitalDeliveryAllowed, hashDeliveryKey, orderAccessCookie } from "./payments/access.ts";
import {
  createRecoveryLimiter,
  parseRecoveryBody,
  recoveryAcknowledgement,
  recoveryLimits,
  requestRecovery,
  type RecoveryCandidate,
  type RecoveryStore,
} from "./recovery.ts";

const now = new Date("2026-10-27T18:00:00.000Z");
const origin = "http://localhost:3001";

function memory(orders: RecoveryCandidate[]) {
  const links = new Map<string, { tokenHash: string; orderId: string; expiresAt: Date; usedAt: Date | null }>();
  const credentials: { orderId: string; keyHash: string }[] = [];
  const lookups: string[] = [];
  const store: RecoveryStore = {
    async findOrders(email) {
      lookups.push(email);
      return orders.filter((order) => order.buyerEmail === email);
    },
    async countActiveLinks(publicId, moment) {
      let count = 0;
      for (const link of links.values()) {
        if (link.orderId === publicId && link.usedAt === null && link.expiresAt.getTime() > moment.getTime()) count += 1;
      }
      return count;
    },
    async saveLink(record) {
      if (links.has(record.tokenHash)) return false;
      links.set(record.tokenHash, { ...record });
      return true;
    },
    async revoke(tokenHashes) {
      for (const tokenHash of tokenHashes) links.delete(tokenHash);
    },
  };
  return { store, links, credentials, lookups };
}

function sender(result: MailResult = "held"): MailSender & { messages: MailMessage[] } {
  const messages: MailMessage[] = [];
  return {
    mode: result === "refused" ? "unconfigured" : "dev-outbox",
    canDispatch: result !== "refused",
    messages,
    async send(message) {
      messages.push(message);
      return result;
    },
  };
}

function order(publicId: string, status: RecoveryCandidate["status"], email: string | null, label: string): RecoveryCandidate {
  return { publicId, status, buyerEmail: email, label };
}

function redeem(record: ReturnType<typeof issueAccessLink>["record"] | null, moment: Date) {
  const decision = consumeAccessLink(record, moment);
  if (!decision.ok) return { decision, credential: null as string | null };
  const deliveryKey = createDeliveryKey();
  return { decision, credential: hashDeliveryKey(deliveryKey), deliveryKey };
}

{
  assert.equal(parseBuyerEmail("  Cliente@Example.com "), "cliente@example.com");
  assert.equal(parseBuyerEmail("no-es-correo"), null);
  assert.equal(parseBuyerEmail("a@b.c"), null);
  assert.equal(parseBuyerEmail("cliente@example.com\nBcc:otro@example.com"), null);
  assert.equal(parseBuyerEmail("cliente @example.com"), null);
  assert.equal(parseRecoveryBody({ email: "Cliente@Example.com", publicId: "x" }).ok, false);
  const parsed = parseRecoveryBody({ email: "Cliente@Example.com" });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.email, "cliente@example.com");
  assert.deepEqual(parseRecoveryBody({}), { ok: false, error: "invalid-body" });
  assert.deepEqual(parseRecoveryBody({ email: "mala" }), { ok: false, error: "invalid-email" });
}

{
  const issued = issueAccessLink("order-a", now);
  assert.equal(ACCESS_TOKEN_PATTERN.test(issued.token), true);
  assert.equal(issued.record.tokenHash, hashAccessToken(issued.token));
  assert.equal(JSON.stringify(issued.record).includes(issued.token), false);
  assert.equal(issued.record.usedAt, null);
  const other = issueAccessLink("order-a", now);
  assert.notEqual(other.token, issued.token);

  const first = redeem(issued.record, now);
  assert.equal(first.decision.ok, true);
  if (!first.decision.ok) throw new Error("redeem");
  assert.equal(first.decision.record.orderId, "order-a");
  assert.ok(first.decision.record.usedAt);
  const second = consumeAccessLink(first.decision.record, new Date(now.getTime() + 1000));
  assert.deepEqual(second, { ok: false, reason: "used" });
  assert.equal(issued.record.usedAt, null);

  const publicOrigin = "https://sizes-delight-escape-corporations.trycloudflare.com";
  const internalRequest = "https://localhost:3001/acceso/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const orderPath = "/pedido/aaaaaaaaaaaaaaaaaaaaaaaa";
  assert.equal(new URL(internalRequest).origin, "https://localhost:3001");
  assert.equal(accessRedirect(publicOrigin, orderPath), `${publicOrigin}${orderPath}`);
  assert.equal(accessRedirect(publicOrigin, "/recuperar?estado=enlace"), `${publicOrigin}/recuperar?estado=enlace`);
  assert.equal(accessRedirect(publicOrigin, orderPath).includes("localhost"), false);
  assert.equal(accessRedirect(undefined, orderPath), orderPath);
  assert.equal(accessRedirect("notaurl", orderPath), orderPath);
  assert.equal(accessRedirect("https://user:pass@public.example", orderPath), orderPath);
  assert.equal(accessRedirect(publicOrigin, "https://evil.example/phish"), `${publicOrigin}/recuperar?estado=enlace`);
  assert.equal(accessRedirect(publicOrigin, "//evil.example"), `${publicOrigin}/recuperar?estado=enlace`);
  const proxyLink = issueAccessLink("order-proxy", now);
  const opened = consumeAccessLink(proxyLink.record, now);
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("redeem");
  const reused = consumeAccessLink(opened.record, new Date(now.getTime() + 1000));
  assert.deepEqual(reused, { ok: false, reason: "used" });
  assert.equal(accessRedirect(publicOrigin, "/recuperar?estado=enlace"), `${publicOrigin}/recuperar?estado=enlace`);
  const secure = trustedPublicOrigin(publicOrigin)?.protocol === "https:";
  const cookie = orderAccessCookie("aaaaaaaaaaaaaaaaaaaaaaaa", "b".repeat(43), secure);
  assert.equal(cookie.includes("Secure"), true);
  assert.equal(cookie.includes("HttpOnly"), true);
  assert.equal(cookie.includes("SameSite=Lax"), true);
  assert.equal(cookie.includes("Domain="), false);
  assert.equal(orderAccessCookie("aaaaaaaaaaaaaaaaaaaaaaaa", "b".repeat(43), false).includes("Secure"), false);

  const original = createDeliveryKey();
  const originalHash = hashDeliveryKey(original);
  assert.equal(
    digitalDeliveryAllowed({
      downloadsEnabled: true,
      status: "PAID",
      key: original,
      storedHash: originalHash,
      extraHashes: first.credential ? [first.credential] : [],
    }),
    true,
  );
  assert.equal(
    digitalDeliveryAllowed({
      downloadsEnabled: true,
      status: "PAID",
      key: first.deliveryKey,
      storedHash: originalHash,
      extraHashes: first.credential ? [first.credential] : [],
    }),
    true,
  );
  assert.equal(
    digitalDeliveryAllowed({
      downloadsEnabled: true,
      status: "PAID",
      key: first.deliveryKey,
      storedHash: hashDeliveryKey(createDeliveryKey()),
    }),
    false,
  );
  assert.equal(
    digitalDeliveryAllowed({
      downloadsEnabled: true,
      status: "PENDING",
      key: original,
      storedHash: originalHash,
    }),
    false,
  );
}

{
  const issued = issueAccessLink("order-a", now);
  const expired = consumeAccessLink(issued.record, new Date(issued.record.expiresAt.getTime()));
  assert.deepEqual(expired, { ok: false, reason: "expired" });
  assert.equal(issued.record.usedAt, null);
  assert.equal(linkCapOpen(2), true);
  assert.equal(linkCapOpen(3), false);
}

{
  const buyer = "cliente@example.com";
  const orders = [
    order("paid-a", "PAID", buyer, "Panadería Sur"),
    order("pending-a", "PENDING", buyer, "Pendiente"),
    order("paid-b", "PAID", "otro@example.com", "Otro local"),
    order("old", "PAID", null, "Pedido anterior"),
  ];
  const box = memory(orders);
  const outbox = sender();
  const hit = await requestRecovery({
    email: "Cliente@Example.com",
    now,
    origin,
    limited: false,
    store: box.store,
    sender: outbox,
  });
  const miss = await requestRecovery({
    email: "nadie@example.com",
    now,
    origin,
    limited: false,
    store: memory([]).store,
    sender: sender(),
  });
  const pendingOnly = await requestRecovery({
    email: buyer,
    now,
    origin,
    limited: false,
    store: memory([order("pending-a", "PENDING", buyer, "Pendiente")]).store,
    sender: sender(),
  });
  assert.deepEqual(hit, recoveryAcknowledgement());
  assert.deepEqual(miss, hit);
  assert.deepEqual(pendingOnly, hit);
  assert.equal("orders" in hit, false);
  assert.equal(outbox.messages.length, 1);
  const message = outbox.messages[0];
  assert.ok(message);
  assert.equal(message.to, buyer);
  assert.equal(message.text.includes("Panadería Sur"), true);
  assert.equal(message.text.includes("Pendiente"), false);
  assert.equal(message.text.includes("Otro local"), false);
  assert.equal(message.text.includes("Pedido anterior"), false);
  assert.equal(message.text.includes("/acceso/"), true);
  assert.equal(box.links.size, 1);
  const stored = [...box.links.values()][0];
  assert.equal(stored?.orderId, "paid-a");
  assert.equal(stored?.usedAt, null);
  assert.equal(message.text.includes(stored?.tokenHash ?? "hash"), false);
  const token = message.text.match(/\/acceso\/([A-Za-z0-9_-]{43})/)?.[1] ?? "";
  assert.equal(hashAccessToken(token), stored?.tokenHash);
  const opened = consumeAccessLink(stored ?? null, now);
  assert.equal(opened.ok, true);
  if (opened.ok) assert.equal(opened.record.orderId, "paid-a");
}

{
  const buyer = "cliente@example.com";
  const orders = [order("paid-a", "PAID", buyer, "Panadería Sur")];
  const silent = memory(orders);
  const blocked = sender("refused");
  const response = await requestRecovery({
    email: buyer,
    now,
    origin,
    limited: false,
    store: silent.store,
    sender: blocked,
  });
  assert.deepEqual(response, recoveryAcknowledgement());
  assert.equal(blocked.messages.length, 0);
  assert.equal(silent.links.size, 0);
  assert.deepEqual(silent.lookups, [buyer]);
}

{
  const buyer = "cliente@example.com";
  const dropping = sender("held");
  dropping.send = async (message) => {
    dropping.messages.push(message);
    return "refused";
  };
  const box = memory([order("paid-a", "PAID", buyer, "Panadería Sur")]);
  await requestRecovery({
    email: buyer,
    now,
    origin,
    limited: false,
    store: box.store,
    sender: dropping,
  });
  assert.equal(box.links.size, 0);
  assert.equal(dropping.messages.length, 1);
}

{
  const buyer = "cliente@example.com";
  const box = memory([order("paid-a", "PAID", buyer, "Panadería Sur")]);
  const outbox = sender();
  const response = await requestRecovery({
    email: buyer,
    now,
    origin,
    limited: true,
    store: box.store,
    sender: outbox,
  });
  assert.deepEqual(response, recoveryAcknowledgement());
  assert.equal(outbox.messages.length, 0);
  assert.equal(box.links.size, 0);
  assert.deepEqual(box.lookups, [buyer]);
}

{
  const buyer = "cliente@example.com";
  const box = memory([order("paid-a", "PAID", buyer, "Panadería\nhttps://evil.example Sur")]);
  const outbox = sender();
  await requestRecovery({ email: buyer, now, origin, limited: false, store: box.store, sender: outbox });
  const text = outbox.messages[0]?.text ?? "";
  assert.equal(text.includes("\nhttps://evil.example"), false);
  assert.equal(text.split("http://localhost:3001/acceso/").length, 2);
}

{
  const buyer = "cliente@example.com";
  const box = memory([order("paid-a", "PAID", buyer, "Panadería Sur")]);
  box.store.countActiveLinks = async () => 3;
  const outbox = sender();
  const response = await requestRecovery({
    email: buyer,
    now,
    origin,
    limited: false,
    store: box.store,
    sender: outbox,
  });
  assert.deepEqual(response, recoveryAcknowledgement());
  assert.equal(outbox.messages.length, 0);
  assert.equal(box.links.size, 0);
}

{
  const broken = memory([order("paid-a", "PAID", "cliente@example.com", "Panadería Sur")]);
  const outbox = sender();
  const response = await requestRecovery({
    email: "cliente@example.com",
    now,
    origin: "notaurl",
    limited: false,
    store: broken.store,
    sender: outbox,
  });
  assert.deepEqual(response, recoveryAcknowledgement());
  assert.equal(outbox.messages.length, 0);
  assert.equal(broken.links.size, 0);
  assert.equal(recoveryMail(origin, []), null);
}

{
  const limiter = createRecoveryLimiter(() => now.getTime());
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(limiter.allow("203.0.113.8"), true);
  assert.equal(limiter.allow("203.0.113.8"), false);
  assert.equal(limiter.allow("203.0.113.9"), true);
}

{
  const limiter = createRecoveryLimiter(() => now.getTime());
  const email = "cliente@example.com";
  for (let attempt = 0; attempt < recoveryLimits.perEmail; attempt += 1) {
    assert.equal(limiter.allow(`198.51.100.${attempt}`, email), true);
  }
  assert.equal(limiter.allow("198.51.100.20", email), false);
  assert.equal(limiter.allow("198.51.100.20", "otro@example.com"), true);
}

{
  const limiter = createRecoveryLimiter(() => now.getTime());
  for (let attempt = 0; attempt < recoveryLimits.global; attempt += 1) {
    assert.equal(limiter.allow(`cliente-${attempt}`, `persona${attempt}@example.com`), true);
  }
  assert.equal(limiter.allow("cliente-extra", "nueva@example.com"), false);
}

{
  const directory = await mkdtemp(path.join(tmpdir(), "atajolab-mail-"));
  try {
    const outbox = createDevOutbox(directory);
    const result = await outbox.send({
      to: "cliente@example.com",
      subject: "Acceso",
      text: "http://localhost:3001/acceso/token-de-prueba",
    });
    assert.equal(result, "held");
    assert.equal(outbox.mode, "dev-outbox");
    const stored = await readFile(path.join(directory, "mail-outbox.jsonl"), "utf8");
    assert.equal(stored.includes("token-de-prueba"), true);
    assert.equal(stored.includes('"sent"'), false);
    const dev = createMailSender({ NODE_ENV: "development" }, directory);
    assert.equal(dev.mode, "dev-outbox");
    assert.equal(dev.canDispatch, true);
    const idle = createMailSender({ NODE_ENV: "development", EMAIL_PROVIDER: "resend" }, directory);
    assert.equal(idle.mode, "unconfigured");
    assert.equal(await idle.send({ to: "cliente@example.com", subject: "Acceso", text: "secreto" }), "refused");
    const reread = await readFile(path.join(directory, "mail-outbox.jsonl"), "utf8");
    assert.equal(reread.includes("secreto"), false);
    assert.equal(createMailSender({ NODE_ENV: "production" }, directory).canDispatch, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

console.log("access recovery checks passed");
