import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>) => {
  await db.schema
    .createIndex("reactions_hash_index")
    .on("reactions")
    .columns(["hash"])
    .execute();

  await db.schema
    .createIndex("casts_hash_index")
    .on("casts")
    .columns(["hash"])
    .execute();

  // add index on casts for timestamp field
  await db.schema
    .createIndex("casts_timestamp_index")
    .on("casts")
    .columns(["timestamp"])
    .where(sql.ref("deleted_at"), "is", null)
    .execute();

  // add index on reactions for timestamp field where delete_at is not null
  await db.schema
    .createIndex("reactions_timestamp_index")
    .on("reactions")
    .columns(["timestamp"])
    .where(sql.ref("deleted_at"), "is", null)
    .execute();

}