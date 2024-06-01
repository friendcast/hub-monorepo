import {
  DB,
  getDbClient,
  getHubClient,
  MessageHandler,
  StoreMessageOperation,
  MessageReconciliation,
  RedisClient,
  HubEventProcessor,
  EventStreamHubSubscriber,
  EventStreamConnection,
  HubEventStreamConsumer,
  HubSubscriber,
  MessageState,
} from "../index"; // If you want to use this as a standalone app, replace this import with "@farcaster/shuttle"
import { AppDb, migrateToLatest, Tables } from "./db";
import { bytesToHexString, HubEvent, isCastAddMessage, isCastRemoveMessage, Message, isReactionAddMessage, isReactionRemoveMessage, isLinkAddMessage, isLinkRemoveMessage, isUserDataAddData, isUserDataAddMessage } from "@farcaster/hub-nodejs";
import { log } from "./log";
import { Command } from "@commander-js/extra-typings";
import { readFileSync } from "fs";
import { sql } from "kysely";
import {
  BACKFILL_FIDS,
  CONCURRENCY,
  HUB_HOST,
  HUB_SSL,
  MAX_FID,
  POSTGRES_URL,
  REDIS_URL,
  SHARD_INDEX,
  TOTAL_SHARDS,
} from "./env";
import * as process from "node:process";
import url from "node:url";
import { ok, Result } from "neverthrow";
import { getQueue, getWorker } from "./worker";
import { Queue } from "bullmq";
import { farcasterTimeToDate } from "../utils";
import { GetRootParentData } from "./casts";

const hubId = "shuttle";

export class App implements MessageHandler {
  private readonly db: DB;
  private hubSubscriber: HubSubscriber;
  private streamConsumer: HubEventStreamConsumer;
  public redis: RedisClient;
  private readonly hubId;

  constructor(db: DB, redis: RedisClient, hubSubscriber: HubSubscriber, streamConsumer: HubEventStreamConsumer) {
    this.db = db;
    this.redis = redis;
    this.hubSubscriber = hubSubscriber;
    this.hubId = hubId;
    this.streamConsumer = streamConsumer;
  }

  static create(
    dbUrl: string,
    redisUrl: string,
    hubUrl: string,
    totalShards: number,
    shardIndex: number,
    hubSSL = false,
  ) {
    const db = getDbClient(dbUrl);
    const hub = getHubClient(hubUrl, { ssl: hubSSL });
    const redis = RedisClient.create(redisUrl);
    const eventStreamForWrite = new EventStreamConnection(redis.client);
    const eventStreamForRead = new EventStreamConnection(redis.client);
    const shardKey = totalShards === 0 ? "all" : `${shardIndex}`;
    const hubSubscriber = new EventStreamHubSubscriber(
      hubId,
      hub,
      eventStreamForWrite,
      redis,
      shardKey,
      log,
      null,
      totalShards,
      shardIndex,
    );
    const streamConsumer = new HubEventStreamConsumer(hub, eventStreamForRead, shardKey);

    return new App(db, redis, hubSubscriber, streamConsumer);
  }

  async handleMessageMerge(
    message: Message,
    txn: DB,
    operation: StoreMessageOperation,
    state: MessageState,
    isNew: boolean,
    wasMissed: boolean,
  ): Promise<void> {
    if (!isNew) {
      // Message was already in the db, no-op
      return;
    }

    // Example of how to materialize casts into a separate table. Insert casts into a separate table, and mark them as deleted when removed
    // Note that since we're relying on "state", this can sometimes be invoked twice. e.g. when a CastRemove is merged, this call will be invoked 2 twice:
    // castAdd, operation=delete, state=deleted (the cast that the remove is removing)
    // castRemove, operation=merge, state=deleted (the actual remove message)
    const messageDesc = wasMissed ? `missed message (${operation})` : `message (${operation})`;
    const isCastMessage = isCastAddMessage(message) || isCastRemoveMessage(message);
    const isReactionMessage = isReactionAddMessage(message) || isReactionRemoveMessage(message);
    const isLinkMessage = isLinkAddMessage(message) || isLinkRemoveMessage(message);
    const isUserDataMessage = isUserDataAddMessage(message);
    const appDB = txn as unknown as AppDb; // Need this to make typescript happy, not clean way to "inherit" table types
    if (isCastMessage) {
      log.info(`init cast: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
      try {
        if (state === "created") {
          let rootParentHash: Uint8Array | null = null;
          let rootParentUrl: string | null = null;
          if (message.data.castAddBody?.parentCastId) {
            let [rootParentHash, rootParentUrl] = await GetRootParentData(message.data.castAddBody?.parentCastId.hash, appDB);
            log.info("parent cast root details", rootParentHash, rootParentUrl)
          }
          await appDB
            .insertInto("casts")
            .values({
              // message data
              messageType: message.data.type,
              fid: message.data.fid,
              timestamp: farcasterTimeToDate(message.data.timestamp) || new Date(),
              network: message.data.network,
              hash: message.hash,
              hashHex: bytesToHexString(message.hash)._unsafeUnwrap(),
              hashScheme: message.hashScheme,
              signature: message.signature,
              signatureScheme: message.signatureScheme,
              signer: message.signer,
              dataBytes: message.dataBytes ? message.dataBytes : null,
              // cast data below
              text: message.data.castAddBody?.text || "",
              embeds: message.data.castAddBody?.embeds,
              mentions: message.data.castAddBody?.mentions,
              mentionsPositions: message.data.castAddBody?.mentionsPositions,
              parentUrl: message.data.castAddBody?.parentUrl || null,
              parentFid: message.data.castAddBody?.parentCastId?.fid || null,
              parentHash: message.data.castAddBody?.parentCastId?.hash || null,
              rootParentHash: rootParentHash || message.data.castAddBody?.parentCastId?.hash || null,
              rootParentUrl: rootParentUrl || message.data.castAddBody?.parentUrl || null,
            })
            .execute();
        } else if (state === "deleted") {
          await appDB
            .updateTable("casts")
            .set({ deletedAt: farcasterTimeToDate(message.data.timestamp) || new Date() })
            .where(sql`hash = ${message.hash}`)
            .execute();
        }
        log.info(`proc cast: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
      } catch (e) {
        log.error(`Failed to process cast: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
        log.error(e);
      }
    } else if (isReactionMessage) {
      log.info(`init reaction: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
      try {
        if (state === "created") {
          await appDB
            .insertInto("reactions")
            .values({
              // message data
              messageType: message.data.type,
              fid: message.data.fid,
              timestamp: farcasterTimeToDate(message.data.timestamp) || new Date(),
              network: message.data.network,
              hash: message.hash,
              hashScheme: message.hashScheme,
              signature: message.signature,
              signatureScheme: message.signatureScheme,
              signer: message.signer,
              dataBytes: message.dataBytes ? message.dataBytes : null,
              // reactions data below
              type: message.data.reactionBody?.type,
              targetCastFid: message.data.reactionBody?.targetCastId?.fid || null,
              targetCastHash: message.data.reactionBody?.targetCastId?.hash || null,
              targetCastHashHex: message.data.reactionBody?.targetCastId?.hash ? bytesToHexString(message.data.reactionBody?.targetCastId?.hash)._unsafeUnwrap() : null,
              targetUrl: message.data.reactionBody?.targetUrl || null,
            })
            .execute();
        } else if (state === "deleted") {
          // todo-rahul: confirm on the logic to remove a reaction
          await appDB
            .updateTable("reactions")
            .set({ deletedAt: farcasterTimeToDate(message.data.timestamp) || new Date() })
            .where(sql`hash = ${message.hash}`)
            .execute();
        }
        log.info(`proc reaction: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
      } catch (e) {
        log.error(`Failed to process reaction: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
        log.error(e);
      }
    } else if (isLinkMessage) {
      try {
        log.info(`init link: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
        if (state === "created") {
          try {
            await appDB
              .insertInto("links")
              .values({
                // message data
                messageType: message.data.type,
                fid: message.data.fid,
                timestamp: farcasterTimeToDate(message.data.timestamp) || new Date(),
                network: message.data.network,
                hash: message.hash,
                hashScheme: message.hashScheme,
                signature: message.signature,
                signatureScheme: message.signatureScheme,
                signer: message.signer,
                dataBytes: message.dataBytes ? message.dataBytes : null,
                // links data below
                targetFid: message.data.linkBody?.targetFid || null,
                displayTimestamp: farcasterTimeToDate(message.data.linkBody?.displayTimestamp) || null,
                type: message.data.linkBody?.type || "",
              })
              .onConflict((oc) =>
                oc
                  .columns(["fid", "targetFid", "type"])
                  .doUpdateSet({
                    hash: message.hash,
                    timestamp: farcasterTimeToDate(message.data.timestamp) || new Date(),
                    displayTimestamp: farcasterTimeToDate(message.data.linkBody?.displayTimestamp),
                  })
                  .where(({ eb, ref, or, and }) =>
                    or([
                      // CRDT conflict rule 1: discard message with lower timestamp
                      eb("links.timestamp", "<", ref("excluded.timestamp")),
                      // CRDT conflict rule 2: does not apply since these are always two ReactionAdd messages
                      // CRDT conflict rule 3: if timestamps and message type are identical, discard message with lower hash
                      and([
                        eb("links.timestamp", "=", ref("excluded.timestamp")),
                        eb("links.hash", "<", ref("excluded.hash")),
                      ]),
                    ]),
                  ),
              )
              .execute();
          } catch (e) {
            log.error(`Failed to insert link: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
            log.error(e);
          }
        } else if (state === "deleted") {
          // todo-rahul: confirm on the logic to remove a link
          try {
            await appDB
              .updateTable("links")
              .where("fid", "=", message.data.fid)
              .where("type", "=", message.data.linkBody?.type)
              .$call((qb) => (message.data.linkBody?.targetFid ? qb.where("targetFid", "=", message.data.linkBody?.targetFid) : qb))
              .set({ updatedAt: new Date(), deletedAt: new Date() })
              .execute();
          } catch (e) {
            log.error(`Failed to delete link: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()
              } (type ${message.data?.type})`);
            log.error(e);
          }
        }
      } catch (e) {
        log.error(`Failed to process link: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
        log.error(e);
      }
      log.info(`proc link: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
    } else if (isUserDataMessage) {
      log.info(`init user data: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
      try {
        await appDB
          .insertInto("userData")
          .values({
            // message data
            messageType: message.data.type,
            fid: message.data.fid,
            timestamp: farcasterTimeToDate(message.data.timestamp) || new Date(),
            network: message.data.network,
            hash: message.hash,
            hashScheme: message.hashScheme,
            signature: message.signature,
            signatureScheme: message.signatureScheme,
            signer: message.signer,
            dataBytes: message.dataBytes ? message.dataBytes : null,
            // user data
            type: message.data.userDataBody?.type,
            value: message.data.userDataBody?.value,
          })
          .onConflict((oc) =>
            oc
              .columns(["fid", "type"])
              .doUpdateSet(({ ref }) => ({
                hash: ref("excluded.hash"),
                timestamp: ref("excluded.timestamp"),
                value: ref("excluded.value"),
                updatedAt: new Date(),
              }))
              .where(({ or, eb, ref }) =>
                // Only update if a value has actually changed
                or([
                  eb("excluded.hash", "!=", ref("userData.hash")),
                  eb("excluded.timestamp", "!=", ref("userData.timestamp")),
                  eb("excluded.value", "!=", ref("userData.value")),
                  eb("excluded.updatedAt", "!=", ref("userData.updatedAt")),
                ]),
              ),
          )
          .execute();
      } catch (e) {
        log.error(`Failed to process user data: ${state} ${messageDesc} ${bytesToHexString(message.hash)._unsafeUnwrap()} (type ${message.data?.type})`);
        log.error(e);
      }
    }
  }

  async start() {
    await this.ensureMigrations();
    // Hub subscriber listens to events from the hub and writes them to a redis stream. This allows for scaling by
    // splitting events to multiple streams
    await this.hubSubscriber.start();

    // Sleep 10 seconds to give the subscriber a chance to create the stream for the first time.
    await new Promise((resolve) => setTimeout(resolve, 10_000));

    log.info("Starting stream consumer");
    // Stream consumer reads from the redis stream and inserts them into postgres
    await this.streamConsumer.start(async (event) => {
      void this.processHubEvent(event);
      return ok({ skipped: false });
    });
  }

  async reconcileFids(fids: number[]) {
    // biome-ignore lint/style/noNonNullAssertion: client is always initialized
    const reconciler = new MessageReconciliation(this.hubSubscriber.hubClient!, this.db, log);
    for (const fid of fids) {
      await reconciler.reconcileMessagesForFid(fid, async (message, missingInDb, prunedInDb, revokedInDb) => {
        if (missingInDb) {
          await HubEventProcessor.handleMissingMessage(this.db, message, this);
        } else if (prunedInDb || revokedInDb) {
          const messageDesc = prunedInDb ? "pruned" : revokedInDb ? "revoked" : "existing";
          log.info(`Reconciled ${messageDesc} message ${bytesToHexString(message.hash)._unsafeUnwrap()} `);
        }
      });
    }
  }

  async backfillFids(fids: number[], backfillQueue: Queue) {
    const startedAt = Date.now();
    if (fids.length === 0) {
      const maxFidResult = await this.hubSubscriber.hubClient.getFids({ pageSize: 1, reverse: true });
      if (maxFidResult.isErr()) {
        log.error("Failed to get max fid", maxFidResult.error);
        throw maxFidResult.error;
      }
      const maxFid = MAX_FID ? parseInt(MAX_FID) : maxFidResult.value.fids[0];
      if (!maxFid) {
        log.error("Max fid was undefined");
        throw new Error("Max fid was undefined");
      }
      log.info(`Queuing up fids upto: ${maxFid} `);
      // create an array of arrays in batches of 100 upto maxFid
      const batchSize = 10;
      const fids = Array.from({ length: Math.ceil(maxFid / batchSize) }, (_, i) => i * batchSize).map((fid) => fid + 1);
      for (const start of fids) {
        const subset = Array.from({ length: batchSize }, (_, i) => start + i);
        await backfillQueue.add("reconcile", { fids: subset });
      }
    } else {
      await backfillQueue.add("reconcile", { fids });
    }
    await backfillQueue.add("completionMarker", { startedAt });
    log.info("Backfill jobs queued");
  }

  private async processHubEvent(hubEvent: HubEvent) {
    await HubEventProcessor.processHubEvent(this.db, hubEvent, this);
  }

  async ensureMigrations() {
    const result = await migrateToLatest(this.db, log);
    if (result.isErr()) {
      log.error("Failed to migrate database", result.error);
      throw result.error;
    }
  }

  async stop() {
    this.hubSubscriber.stop();
    const lastEventId = await this.redis.getLastProcessedEvent(this.hubId);
    log.info(`Stopped at eventId: ${lastEventId} `);
  }
}

//If the module is being run directly, start the shuttle
if (import.meta.url.endsWith(url.pathToFileURL(process.argv[1] || "").toString())) {
  async function start() {
    log.info(`Creating app connecting to: ${POSTGRES_URL}, ${REDIS_URL}, ${HUB_HOST} `);
    const app = App.create(POSTGRES_URL, REDIS_URL, HUB_HOST, TOTAL_SHARDS, SHARD_INDEX, HUB_SSL);
    log.info("Starting shuttle");
    await app.start();
  }

  async function backfill() {
    log.info(`Creating app connecting to: ${POSTGRES_URL}, ${REDIS_URL}, ${HUB_HOST} `);
    const app = App.create(POSTGRES_URL, REDIS_URL, HUB_HOST, TOTAL_SHARDS, SHARD_INDEX, HUB_SSL);
    const fids = BACKFILL_FIDS ? BACKFILL_FIDS.split(",").map((fid) => parseInt(fid)) : [];
    log.info(`Backfilling fids: ${fids} `);
    const backfillQueue = getQueue(app.redis.client);
    await app.backfillFids(fids, backfillQueue);

    // Start the worker after initiating a backfill
    const worker = getWorker(app, app.redis.client, log, CONCURRENCY);
    await worker.run();
    return;
  }

  async function worker() {
    log.info(`Starting worker connecting to: ${POSTGRES_URL}, ${REDIS_URL}, ${HUB_HOST} `);
    const app = App.create(POSTGRES_URL, REDIS_URL, HUB_HOST, TOTAL_SHARDS, SHARD_INDEX, HUB_SSL);
    const worker = getWorker(app, app.redis.client, log, CONCURRENCY);
    await worker.run();
  }

  // for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  //   process.on(signal, async () => {
  //     log.info(`Received ${ signal }. Shutting down...`);
  //     (async () => {
  //       await sleep(10_000);
  //       log.info(`Shutdown took longer than 10s to complete.Forcibly terminating.`);
  //       process.exit(1);
  //     })();
  //     await app?.stop();
  //     process.exit(1);
  //   });
  // }

  const program = new Command()
    .name("shuttle")
    .description("Synchronizes a Farcaster Hub with a Postgres database")
    .version(JSON.parse(readFileSync("./package.json").toString()).version);

  program.command("start").description("Starts the shuttle").action(start);
  program.command("backfill").description("Queue up backfill for the worker").action(backfill);
  program.command("worker").description("Starts the backfill worker").action(worker);

  program.parse(process.argv);
}
