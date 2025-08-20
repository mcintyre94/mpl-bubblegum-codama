import { MetadataArgsArgs } from '../generated';
import { hashMetadataCreators, hashMetadataData } from '../hash';

export function resolveDataHash({
    args
}: {
    args: { metadata: MetadataArgsArgs }
}): Uint8Array {
    return hashMetadataData(args.metadata);
}

export function resolveCreatorHash({
    args
}: {
    args: { metadata: { creators: MetadataArgsArgs['creators'] } }
}): Uint8Array {
    return hashMetadataCreators(args.metadata.creators);
}
