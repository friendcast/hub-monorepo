import { Kysely, sql, JSONColumnType } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: legacy code, avoid using ignore for new code
export const up = async (db: Kysely<any>) => {
  // Casts -------------------------------------------------------------------------------------
  await db.schema
    .createTable("casts")
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
    .addColumn("hashHex", "text", (col) => col.notNull())
    .addColumn("hashScheme", sql`smallint`, (col) => col.notNull())
    .addColumn("signature", "bytea", (col) => col.notNull())
    .addColumn("signatureScheme", sql`smallint`, (col) => col.notNull())
    .addColumn("signer", "bytea", (col) => col.notNull())
    .addColumn("dataBytes", "bytea")
    // cast data
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("embeds", sql`text[]`, (col) => col.notNull())
    .addColumn("mentions", sql`text[]`, (col) => col.notNull())
    .addColumn("mentionsPositions", sql`integer[]`, (col) => col.notNull())
    .addColumn("parentUrl", "text")
    .addColumn("parentFid", "bigint")
    .addColumn("parentHash", "bytea")
    .addColumn("rootParentHash", "bytea")
    .addColumn("rootParentUrl", "text")
    .addUniqueConstraint("casts_hash_unique", ["hash"])
    .$call((qb) =>
      qb.addPrimaryKeyConstraint("casts_pkey", ["id"]).addUniqueConstraint("casts_hash_unique", ["hash"]),
    )
    .execute();

  await db.schema
    .createIndex("casts_fid_timestamp_index")
    .on("casts")
    .columns(["fid", "timestamp"])
    .where(sql.ref("deleted_at"), "is", null) // Only index active (non-deleted) casts
    .execute();

  await db.schema
    .createIndex("casts_root_parent_hash_index")
    .on("casts")
    .columns(["rootParentHash"])
    .where("rootParentHash", "is not", null)
    .execute();

  await db.schema
    .createIndex("casts_parent_url_index")
    .on("casts")
    .columns(["parentUrl"])
    .where("parentUrl", "is not", null)
    .execute();

  await db.schema
    .createIndex("casts_root_parent_url_index")
    .on("casts")
    .columns(["rootParentUrl"])
    .where("rootParentUrl", "is not", null)
    .execute();
};
