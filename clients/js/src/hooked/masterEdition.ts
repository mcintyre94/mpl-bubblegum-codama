// Copied from https://github.com/mcintyre94/mpl-token-metadata-codama/blob/d44e50e25c171031344bf06b7848ac61856345ec/client-js/src/generated/pdas/masterEdition.ts#L22

import {
    getAddressEncoder,
    getProgramDerivedAddress,
    getUtf8Encoder,
    type Address,
    type ProgramDerivedAddress,
} from '@solana/kit';

export type MasterEditionSeeds = {
    /** The address of the mint account */
    mint: Address;
};

export async function findMasterEditionPda(
    seeds: MasterEditionSeeds,
    config: { programAddress?: Address | undefined } = {}
): Promise<ProgramDerivedAddress> {
    const {
        programAddress = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s' as Address<'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'>,
    } = config;
    return await getProgramDerivedAddress({
        programAddress,
        seeds: [
            getUtf8Encoder().encode('metadata'),
            getAddressEncoder().encode(programAddress),
            getAddressEncoder().encode(seeds.mint),
            getUtf8Encoder().encode('edition'),
        ],
    });
}