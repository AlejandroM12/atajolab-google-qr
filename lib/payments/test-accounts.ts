const TEST_USER_EMAIL = /^test_user_\d+@testuser\.com$/i;
const TEST_USER_NICKNAME = /^TESTUSER\d+$/;

export type AccountKind = "test-user" | "real" | "unverified";

export type PaymentParties = "verified-test-users" | "verified-real" | "unverified";

export type MercadoPagoAccount = {
  email?: string | null;
  tags?: string[] | null;
  nickname?: string | null;
  testUserFlag?: boolean | null;
};

export function classifyAccount(
  account: MercadoPagoAccount | null,
  linkedPaymentEmail?: string | null,
): AccountKind {
  if (!account) return "unverified";

  const email = account.email?.trim() ?? "";
  const tags = account.tags ?? [];
  const tagged = tags.includes("test_user") || account.testUserFlag === true;
  const officialEmail = TEST_USER_EMAIL.test(email);

  if (tagged && officialEmail) return "test-user";

  const privateProfile = email.length === 0 && tags.length === 0 && account.testUserFlag !== true;
  const linkedEmail = linkedPaymentEmail?.trim() ?? "";
  if (
    privateProfile &&
    TEST_USER_NICKNAME.test(account.nickname?.trim() ?? "") &&
    TEST_USER_EMAIL.test(linkedEmail)
  ) {
    return "test-user";
  }

  if (email.length > 0 && !tagged && !officialEmail) return "real";

  return "unverified";
}

export function classifyParties(payer: AccountKind, collector: AccountKind): PaymentParties {
  if (payer === "test-user" && collector === "test-user") return "verified-test-users";
  if (payer === "real" && collector === "real") return "verified-real";
  return "unverified";
}
