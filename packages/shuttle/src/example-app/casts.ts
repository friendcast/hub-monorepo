import { CastIdJson } from "../index";
import { AppDb } from "./db";
import { sql } from "kysely";

export async function GetRootParentData(parentCastHash: Uint8Array, db: AppDb): Promise<[Uint8Array | null, string | null]> {
  let rootParentHash: Uint8Array | null = null;
  let rootParentUrl: string | null = null;
  // this will get parent cast root parent data if this cast is a reply
  // todo-rahul: what to do when a cast is put in a channel? how to get the root parent url then?
  const parentCast = await db
    .selectFrom("casts")
    .select(["fid", "rootParentHash", "rootParentUrl"])
    .where(sql`hash = ${parentCastHash}`)
    .executeTakeFirst();

  // note: we are not checking if parent fid exists in fids table
  // note: we are also not throwing error if parent cast doens't exist in db since we are only indexing live data
  // todo-rahul: check how to handle this
  // if (!parentCast) {
  //   throw new HubEventProcessingBlockedError(`Parent cast ${bytesToHex(parentCastId.hash)} has not yet been seen`, {
  //     blockedOnHash: parentCastId.hash,
  //   });
  // }

  if (parentCast) {
    rootParentHash = parentCast.rootParentHash;
    rootParentUrl = parentCast.rootParentUrl;
  }
  return [rootParentHash, rootParentUrl];
}