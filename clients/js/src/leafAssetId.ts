import {
    Address,
    getAddressEncoder,
    getProgramDerivedAddress,
    getU64Encoder,
    getUtf8Encoder,
    ProgramDerivedAddress
} from "@solana/kit";
import { MPL_BUBBLEGUM_PROGRAM_ADDRESS } from "./generated";

export type LeafAssetIdSeeds = {
    merkleTree: Address;
    leafIndex: number | bigint;
}

export async function findLeafAssetIdPda(
    seeds: LeafAssetIdSeeds,
    config: { programAddress?: Address | undefined } = {}
): Promise<ProgramDerivedAddress> {
    const {
        programAddress = MPL_BUBBLEGUM_PROGRAM_ADDRESS
    } = config;
    return await getProgramDerivedAddress({
        programAddress,
        seeds: [
            getUtf8Encoder().encode('asset'),
            getAddressEncoder().encode(seeds.merkleTree),
            getU64Encoder().encode(seeds.leafIndex),
        ],
    });
}
