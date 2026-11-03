/**
 * Inspect StudioAsset schema on the local Postgres. Refuses non-local DATABASE_URL.
 */
const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)(:\d+)?\//i.test(databaseUrl)) {
  throw new Error("studio-assets-schema-check refuses non-local DATABASE_URL");
}

const { prisma } = await import("../lib/db.ts");

const orders = await prisma.order.count();
const assets = await prisma.studioAsset.count();
const indexes = await prisma.$queryRawUnsafe(
  "SELECT indexname FROM pg_indexes WHERE tablename = 'StudioAsset' ORDER BY indexname",
);
const cons = await prisma.$queryRawUnsafe(
  `SELECT conname, pg_get_constraintdef(oid) AS def
   FROM pg_constraint
   WHERE conrelid = '"StudioAsset"'::regclass
   ORDER BY conname`,
);
const columns = await prisma.$queryRawUnsafe(
  `SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'StudioAsset'
   ORDER BY ordinal_position`,
);
console.log(JSON.stringify({ orders, assets, indexes, cons, columns }, null, 2));
await prisma.$disconnect();
