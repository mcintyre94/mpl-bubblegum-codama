import { getArrayEncoder, getU16Encoder, mergeBytes, ReadonlyUint8Array } from "@solana/kit";
import { getCreatorEncoder, getMetadataArgsEncoder, MetadataArgsArgs } from "./generated";
import { keccak_256 } from '@noble/hashes/sha3';

export function hash(input: Uint8Array | Uint8Array[]): Uint8Array {
    return keccak_256(Array.isArray(input) ? mergeBytes(input) : input);
}

export function hashMetadataData(metadata: MetadataArgsArgs): Uint8Array {
    return hash([
        hash(getMetadataArgsEncoder().encode(metadata) as Uint8Array),
        getU16Encoder().encode(metadata.sellerFeeBasisPoints) as Uint8Array
    ]);
}

export function hashMetadataCreators(
    creators: MetadataArgsArgs['creators']
): Uint8Array {
    return hash(
        getArrayEncoder(getCreatorEncoder(), { size: 'remainder' }).encode(creators) as Uint8Array
    );
}