import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>) => {
  await db.schema
    .createIndex("cast_hash_hex")
    .on("casts")
    .columns(["hashHex"])
    .where(sql.ref("deleted_at"), "is", null) // Only index active (non-deleted) casts
    .execute();

  await db.schema
    .createIndex("target_cast_hash_hex")
    .on("reactions")
    .columns(["targetCastHashHex"])
    .where(sql.ref("deleted_at"), "is", null) // Only index active (non-deleted) casts
    .execute();
}