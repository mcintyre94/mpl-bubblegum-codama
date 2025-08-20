import { MPL_BUBBLEGUM_PROGRAM_ADDRESS } from '../generated';
import { Address, getAddressEncoder, getProgramDerivedAddress, ProgramDerivedAddress } from '@solana/kit';

type MintAuthoritySeeds = {
    mint: Address;
}

export async function findMintAuthorityPda(
    seeds: MintAuthoritySeeds,
    config: { programAddress?: Address | undefined } = {}
): Promise<ProgramDerivedAddress> {
    const {
        programAddress = MPL_BUBBLEGUM_PROGRAM_ADDRESS
    } = config;
    return await getProgramDerivedAddress({
        programAddress,
        seeds: [
            getAddressEncoder().encode(seeds.mint)
        ]
    })
}
