import { Kysely, sql } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: legacy code, avoid using ignore for new code
export const up = async (db: Kysely<any>) => {
  // Casts -------------------------------------------------------------------------------------
  await db.schema
    .createTable("verifications")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`generate_ulid()`))
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .addColumn("deletedAt", "timestamptz")
    // message data
    .addColumn("messageType", sql`smallint`, (col) => col.notNull())
    .addColumn("fid", "bigint", (col) => col.notNull())
    .addColumn("timestamp", "timestamptz", (col) => col.notNull())
    .addColumn("network", sql`smallint`, (col) => col.notNull())
    .addColumn("hash", "bytea", (col) => col.notNull())
    .addColumn("hashScheme", sql`smallint`, (col) => col.notNull())
    .addColumn("signature", "bytea", (col) => col.notNull())
    .addColumn("signatureScheme", sql`smallint`, (col) => col.notNull())
    .addColumn("signer", "bytea", (col) => col.notNull())
    // verification data
    .addColumn("claim", "jsonb", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("verifications_fid_timestamp_index")
    .on("verifications")
    .columns(["fid", "timestamp"])
    .where(sql.ref("deleted_at"), "is", null) // Only index active (non-deleted) verifications
    .execute();
};
