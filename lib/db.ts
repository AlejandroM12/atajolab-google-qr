import { PrismaClient } from "@prisma/client";
import { assertDatabaseTarget } from "@/lib/db-guard";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const client = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
}

/**
 * Never let a developer machine write to the production database by accident.
 * The check runs on first use, not on import: Prisma loads `.env` when it is
 * imported, and unit tests import modules that reference the client without
 * ever querying. See lib/db-guard.ts.
 */
let checked = false;

export const prisma = new Proxy(client, {
  get(target, property, receiver) {
    if (!checked) {
      assertDatabaseTarget();
      checked = true;
    }
    const value = Reflect.get(target, property, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as PrismaClient;
