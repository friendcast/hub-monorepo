import {
  Message,
  Protocol,
} from "@farcaster/hub-nodejs";
import { AppDb } from "./db";
import { sql } from "kysely";
import base58 from "bs58";

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

// verifications
export type Hex = `0x${string}`;
export type VerificationAddEthAddressBodyJson = {
  address: Hex;
  claimSignature: Hex;
  blockHash: Hex;
  protocol: Protocol;
};

export type VerificationAddSolAddressBodyJson = {
  address: string;
  claimSignature: string;
  blockHash: string;
  protocol: Protocol;
};

export type VerificationRemoveBodyJson = {
  address: Hex;
  protocol: Protocol;
};

export function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Buffer.from(bytes).toString("hex")}`
};


export function GetVerificationData(message: Message, state: string): VerificationAddEthAddressBodyJson | VerificationAddSolAddressBodyJson | VerificationRemoveBodyJson | undefined {
  if (state == "created") {
    const { address, claimSignature, blockHash, protocol } = message.data!.verificationAddAddressBody!;
    switch (protocol) {
      case Protocol.ETHEREUM:
        return {
          address: bytesToHex(address),
          claimSignature: bytesToHex(claimSignature),
          blockHash: bytesToHex(blockHash),
          protocol: Protocol.ETHEREUM,
        } satisfies VerificationAddEthAddressBodyJson;
      case Protocol.SOLANA:
        return {
          address: base58.encode(address),
          claimSignature: bytesToHex(claimSignature),
          blockHash: base58.encode(blockHash),
          protocol: Protocol.SOLANA,
        } satisfies VerificationAddSolAddressBodyJson;
      default:
        throw new Error(`Unsupported protocol ${protocol}`);
    }
  } else if (state === "deleted") {
    const { address, protocol } = message.data!.verificationRemoveBody!;
    return {
      address: bytesToHex(address),
      protocol: protocol,
    } satisfies VerificationRemoveBodyJson;
  }
  return undefined;
}