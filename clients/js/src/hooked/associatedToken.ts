// Copied from https://github.com/solana-program/token/blob/cf136e7c82526a58859abfc2baaadcdbeb0f751c/clients/js/src/generated/pdas/associatedToken.ts#L25

import {
    getAddressEncoder,
    getProgramDerivedAddress,
    type Address,
    type ProgramDerivedAddress,
} from '@solana/kit';

export type AssociatedTokenSeeds = {
    /** The wallet address of the associated token account. */
    owner: Address;
    /** The address of the token program to use. */
    tokenProgram: Address;
    /** The mint address of the associated token account. */
    mint: Address;
};

export async function findAssociatedTokenPda(
    seeds: AssociatedTokenSeeds,
    config: { programAddress?: Address | undefined } = {}
): Promise<ProgramDerivedAddress> {
    const {
        programAddress = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as Address<'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'>,
    } = config;
    return await getProgramDerivedAddress({
        programAddress,
        seeds: [
            getAddressEncoder().encode(seeds.owner),
            getAddressEncoder().encode(seeds.tokenProgram),
            getAddressEncoder().encode(seeds.mint),
        ],
    });
}