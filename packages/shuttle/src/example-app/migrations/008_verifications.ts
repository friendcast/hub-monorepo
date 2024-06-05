import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>) => {
  await db.schema
    .createTable("verifications")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`generate_ulid()`))
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .addColumn("timestamp", "timestamptz", (col) => col.notNull())
    .addColumn("deletedAt", "timestamptz")
    // message data
    .addColumn("messageType", sql`smallint`, (col) => col.notNull())
    .addColumn("fid", "bigint", (col) => col.notNull())
    .addColumn("network", sql`smallint`, (col) => col.notNull())
    .addColumn("hash", "bytea", (col) => col.notNull())
    .addColumn("hashScheme", sql`smallint`, (col) => col.notNull())
    .addColumn("signature", "bytea", (col) => col.notNull())
    .addColumn("signatureScheme", sql`smallint`, (col) => col.notNull())
    .addColumn("signer", "bytea", (col) => col.notNull())
    .addColumn("dataBytes", "bytea")
    // verification data
    .addColumn("signerAddress", "bytea", (col) => col.notNull())
    .addColumn("signerAddressHex", "text", (col) => col.notNull())
    .addColumn("claimSignature", "bytea", (col) => col.notNull())
    .addColumn("claimSignatureHex", "text", (col) => col.notNull())
    .addColumn("blockHash", "bytea", (col) => col.notNull())
    .addColumn("blockHashHex", "text", (col) => col.notNull())
    .addColumn("chainId", "integer", (col) => col.notNull())
    .addColumn("protocol", sql`smallint`, (col) => col.notNull())
    .addUniqueConstraint("verifications_signer_address_fid_unique", ["signerAddress", "fid"])
    // .addForeignKeyConstraint("verifications_fid_foreign", ["fid"], "fids", ["fid"], (cb) => cb.onDelete("cascade"))
    .addPrimaryKeyConstraint("verifications_pkey", ["id"])
    .addForeignKeyConstraint("verifications_hash_foreign", ["hash"], "messages", ["hash"], (cb) =>
      cb.onDelete("cascade"),
    )
    .execute();

  await db.schema
    .createIndex("verifications_fid_timestamp_index")
    .on("verifications")
    .columns(["fid", "timestamp"])
    .execute();

  await db.schema
    .createIndex("verifications_timestamp_index")
    .on("verifications")
    .columns(["timestamp"])
    .where(sql.ref("deleted_at"), "is", null)
    .execute();
}