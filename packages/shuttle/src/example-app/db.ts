import {
  ColumnType, FileMigrationProvider, Generated, GeneratedAlways, Kysely, MigrationInfo, Migrator,
  SelectQueryBuilder,
  DeleteQueryBuilder,
  UpdateQueryBuilder,
  InsertQueryBuilder,
  NoResultErrorConstructor,
  QueryNode,
} from "kysely";
import { Logger } from "./log";
import { err, ok, Result } from "neverthrow";
import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "node:url";
import { DrainOuterGeneric, SimplifySingleResult } from "kysely/dist/cjs/util/type-utils.js";
import { format as formatSql } from "sql-formatter";
import {
  // HashScheme,
  MessageType,
  ReactionType,
  // SignatureScheme,
  UserDataType,
  // UserNameType,
  CastId
} from "@farcaster/hub-nodejs";
import { HubTables } from "@farcaster/hub-shuttle";
import { Fid, CastIdJson, EmbedJson } from "../shuttle";

const createMigrator = async (db: Kysely<HubTables>, log: Logger) => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(currentDir, "migrations"),
    }),
  });

  return migrator;
};

export const migrateToLatest = async (db: Kysely<HubTables>, log: Logger): Promise<Result<void, unknown>> => {
  const migrator = await createMigrator(db, log);

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      log.info(`Migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      log.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    log.error("Failed to apply all database migrations");
    log.error(error);
    return err(error);
  }

  log.info("Migrations up to date");
  return ok(undefined);
};

export type CastRow = {
  id: Generated<string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
  deletedAt: Date | null;
  messageType: MessageType;
  fid: Fid;
  timestamp: Date;
  network: Number;
  hash: Uint8Array;
  hashHex: string;
  hashScheme: Number;
  signature: Uint8Array;
  signatureScheme: Number;
  signer: Uint8Array;
  dataBytes: Uint8Array | null;
  text: string;
  embeds: EmbedJson[];
  mentions: Number[];
  mentionsPositions: Number[];
  parentUrl: string | null;
  parentFid: Number | null;
  parentHash: Uint8Array | null;
  parentHashHex: string | null;
  rootParentHash: Uint8Array | null;
  rootParentHashHex: string | null;
  rootParentUrl: string | null;
};

export type ReactionsRow = {
  id: Generated<string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
  deletedAt: Date | null;
  messageType: MessageType;
  fid: Fid;
  timestamp: Date;
  network: Number;
  hash: Uint8Array;
  hashScheme: Number;
  signature: Uint8Array;
  signatureScheme: Number;
  signer: Uint8Array;
  dataBytes: Uint8Array | null;
  type: ReactionType,
  targetCastFid: Number | null;
  targetCastHash: Uint8Array | null;
  targetCastHashHex: string | null;
  targetUrl: string | null;
}

export type LinksRow = {
  id: Generated<string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
  deletedAt: Date | null;
  messageType: MessageType;
  fid: Fid;
  timestamp: Date;
  network: Number;
  hash: Uint8Array;
  hashScheme: Number;
  signature: Uint8Array;
  signatureScheme: Number;
  signer: Uint8Array;
  dataBytes: Uint8Array | null;
  targetFid: Fid | null;
  displayTimestamp: Date | null;
  type: string;
};

export type UserDataRow = {
  id: Generated<string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
  deletedAt: Date | null;
  messageType: MessageType;
  fid: Fid;
  timestamp: Date;
  network: Number;
  hash: Uint8Array;
  hashScheme: Number;
  signature: Uint8Array;
  signatureScheme: Number;
  signer: Uint8Array;
  dataBytes: Uint8Array | null;
  type: UserDataType;
  value: string;
};

export interface Tables extends HubTables {
  casts: CastRow;
  reactions: ReactionsRow;
  links: LinksRow;
  userData: UserDataRow;
}

export type AppDb = Kysely<Tables>;
