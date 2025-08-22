import { Address, getAddressEncoder, getArrayEncoder, getU16Encoder, getU64Encoder, getU8Encoder, mergeBytes, ReadonlyUint8Array } from "@solana/kit";
import { getCreatorEncoder, getMetadataArgsEncoder, MetadataArgsArgs } from "./generated";
import { keccak_256 } from '@noble/hashes/sha3';
import { findLeafAssetIdPda } from "./leafAssetId";

export function hash(input: Uint8Array | Uint8Array[]): Uint8Array {
    return keccak_256(Array.isArray(input) ? mergeBytes(input) : input);
}

export function hashMetadata(metadata: MetadataArgsArgs): Uint8Array {
    return mergeBytes([
        hashMetadataData(metadata),
        hashMetadataCreators(metadata.creators),
    ]);
}

type HashLeafInput = {
    merkleTree: Address;
    owner: Address;
    delegate?: Address;
    leafIndex: number | bigint;
    metadata: MetadataArgsArgs;
    nftVersion?: number;
}

export async function hashLeaf(
    input: HashLeafInput,
): Promise<Uint8Array> {
    const delegate = input.delegate ?? input.owner;
    const nftVersion = input.nftVersion ?? 1;
    const [leafAssetId] = await findLeafAssetIdPda({
        merkleTree: input.merkleTree,
        leafIndex: input.leafIndex,
    });

    return hash([
        getU8Encoder().encode(nftVersion) as Uint8Array,
        getAddressEncoder().encode(leafAssetId) as Uint8Array,
        getAddressEncoder().encode(input.owner) as Uint8Array,
        getAddressEncoder().encode(delegate) as Uint8Array,
        getU64Encoder().encode(input.leafIndex) as Uint8Array,
        hashMetadata(input.metadata),
    ]);
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