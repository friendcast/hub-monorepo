import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>) => {
  await db.schema
    .createTable("links")
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
    // links data
    .addColumn("targetFid", "bigint", (col) => col.notNull())
    .addColumn("displayTimestamp", "timestamptz")
    .addColumn("type", "text", (col) => col.notNull())
    // we havent indexed fids yet
    // .addForeignKeyConstraint("links_fid_foreign", ["fid"], "fids", ["fid"], (cb) => cb.onDelete("cascade"))
    // .addForeignKeyConstraint("links_target_fid_foreign", ["targetFid"], "fids", ["fid"], (cb) => cb.onDelete("cascade"))
    .addPrimaryKeyConstraint("links_pkey", ["id"])
    .addUniqueConstraint("links_hash_unique", ["hash"])
    .execute();

  // While as of time of writing (Sept 2023) targetFid is always not null, there is a potential
  // future where it could be null, depending on the link type.
  // We therefore need `nulls not distinct` so that null is treated like a normal value (requires PG 15+)
  // Requires raw SQL until https://github.com/kysely-org/kysely/issues/711 is implemented.
  await sql`CREATE UNIQUE INDEX links_fid_target_fid_type_unique ON links (fid, target_fid, type) NULLS NOT DISTINCT`.execute(
    db,
  );
}