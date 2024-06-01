import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>) => {
  await db.schema
    .createTable("userData")
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
    // user data
    .addColumn("type", sql`smallint`, (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    // constraint
    .addPrimaryKeyConstraint("user_data_pkey", ["id"])
    .addUniqueConstraint("user_data_hash_unique", ["hash"])
    .execute();

  await db.schema
    .createIndex("user_data_fid_type_unique")
    .on("userData")
    .columns(["fid", "type"])
    .unique()
    .execute();

  await db.schema
    .createIndex("user_data_timestamp_index")
    .on("userData")
    .columns(["timestamp"])
    .execute();
}