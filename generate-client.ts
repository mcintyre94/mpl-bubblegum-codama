import { type AnchorIdl, rootNodeFromAnchorWithoutDefaultVisitor } from "@codama/nodes-from-anchor";
import {
    accountValueNode,
    assertIsNode,
    bottomUpTransformerVisitor,
    conditionalValueNode,
    constantPdaSeedNodeFromString,
    createFromRoot,
    deduplicateIdenticalDefinedTypesVisitor,
    definedTypeLinkNode,
    definedTypeNode,
    flattenInstructionDataArgumentsVisitor,
    getCommonInstructionAccountDefaultRules,
    identityValueNode,
    type InstructionAccountDefaultRule,
    instructionAccountNode,
    instructionArgumentNode,
    numberTypeNode,
    pdaSeedValueNode,
    pdaValueNode,
    programIdValueNode,
    programLinkNode,
    programNode,
    publicKeyTypeNode,
    publicKeyValueNode,
    type RootNode,
    rootNodeVisitor,
    setFixedAccountSizesVisitor,
    setInstructionAccountDefaultValuesVisitor,
    structFieldTypeNode,
    structTypeNode,
    transformU8ArraysToBytesVisitor,
    unwrapInstructionArgsDefinedTypesVisitor,
    updateAccountsVisitor,
    updateDefinedTypesVisitor,
    updateProgramsVisitor,
    variablePdaSeedNode,
    visit,
    type Visitor
} from "codama";
import bubblegumIdl from "./idls/bubblegum.json" with { type: "json" };
import { writeFileSync } from "node:fs";
import path from "node:path";
import renderVisitor from "@codama/renderers-js";

// Copied from https://github.com/codama-idl/codama/blob/efd160bec1aa8c6873135ba30aec78b621f2decb/packages/nodes-from-anchor/src/defaultVisitor.ts
// Will be imported from Codama after https://github.com/codama-idl/codama/pull/780
function defaultVisitor() {
    return rootNodeVisitor(currentRoot => {
        let root: RootNode = currentRoot;
        const updateRoot = (visitor: Visitor<Node | null, 'rootNode'>) => {
            const newRoot = visit(root, visitor);
            // @ts-expect-error ignore for now
            assertIsNode(newRoot, 'rootNode');
            root = newRoot;
        };

        // Defined types.
        // @ts-expect-error ignore for now
        updateRoot(deduplicateIdenticalDefinedTypesVisitor());

        // Accounts.
        // @ts-expect-error ignore for now
        updateRoot(setFixedAccountSizesVisitor());

        // Instructions.
        // @ts-expect-error ignore for now
        updateRoot(setInstructionAccountDefaultValuesVisitor(getCommonInstructionAccountDefaultRules()));
        // @ts-expect-error ignore for now
        updateRoot(unwrapInstructionArgsDefinedTypesVisitor());
        // @ts-expect-error ignore for now
        updateRoot(flattenInstructionDataArgumentsVisitor());

        // Extras.
        // @ts-expect-error ignore for now
        updateRoot(transformU8ArraysToBytesVisitor());

        return root;
    });
}

// Instantiate Codama without default visitor
const codama = createFromRoot(
    rootNodeFromAnchorWithoutDefaultVisitor(bubblegumIdl as AnchorIdl)
);

// Update programs.
codama.update(
    updateProgramsVisitor({
        bubblegum: { name: "mplBubblegum" },
    })
)

// Add wrapper defined type with a link to UpdateArgs. This is to avoid the
// type being inlined in the instruction.
codama.update(
    bottomUpTransformerVisitor([
        {
            select: '[programNode]mplBubblegum',
            transform: (node) => {
                assertIsNode(node, "programNode");
                return programNode({
                    ...node,
                    definedTypes: [
                        ...node.definedTypes,
                        // wrapper type
                        definedTypeNode({
                            name: "UpdateArgsWrapper",
                            type: structTypeNode([
                                structFieldTypeNode({
                                    name: "wrapped",
                                    type: definedTypeLinkNode("UpdateArgs"),
                                })
                            ])
                        })
                    ]
                })
            }
        }
    ])
);

// Apply the DefaultVisitor.
codama.update(defaultVisitor());

// Delete the unnecessary UpdateArgsWrapper type.
codama.update(
    updateDefinedTypesVisitor({
        UpdateArgsWrapper: { delete: true }
    })
);

// Update accounts.
codama.update(
    updateAccountsVisitor({
        treeConfig: {
            seeds: [variablePdaSeedNode("merkleTree", publicKeyTypeNode())],
            size: 96
        },
        voucher: {
            seeds: [
                constantPdaSeedNodeFromString("utf8", "voucher"),
                variablePdaSeedNode("merkleTree", publicKeyTypeNode()),
                variablePdaSeedNode("nonce", numberTypeNode("u64"))
            ]
        }
    })
)

// Update types.
codama.update(
    updateDefinedTypesVisitor({
        // Remove unnecessary types.
        InstructionName: { delete: true },
    })
)

// Custom tree updates.
codama.update(
    bottomUpTransformerVisitor([
        {
            // Rename `treeAuthority` instruction account to `treeConfig`.
            select: '[instructionAccountNode]treeAuthority',
            transform: (node) => {
                assertIsNode(node, "instructionAccountNode");
                return instructionAccountNode({
                    ...node,
                    name: "treeConfig",
                });
            }
        },
        {
            // Rename `treeDelegate` instruction account to `treeCreatorOrDelegate`.
            select: '[instructionAccountNode]treeDelegate',
            transform: (node) => {
                assertIsNode(node, "instructionAccountNode");
                return instructionAccountNode({
                    ...node,
                    name: "treeCreatorOrDelegate",
                });
            }
        },
        {
            // Rename `editionAccount` instruction account to `collectionEdition`.
            select: '[instructionAccountNode]editionAccount',
            transform: (node) => {
                assertIsNode(node, "instructionAccountNode");
                return instructionAccountNode({
                    ...node,
                    name: 'collectionEdition',
                })
            }
        },
        {
            // Rename `message` arg to `metadata`.
            // Note: this uses structFieldTypeNode in metaplex repo, I think that's a mistake
            // message is always an instructionArgumentNode
            select: '[instructionArgumentNode]message',
            transform: (node) => {
                assertIsNode(node, "instructionArgumentNode");
                return instructionArgumentNode({
                    ...node,
                    name: "metadata",
                })
            }
        },
        {
            // Update `collectionAuthorityRecordPda` account as `optional`.
            select: '[instructionAccountNode]collectionAuthorityRecordPda',
            transform: (node) => {
                assertIsNode(node, "instructionAccountNode");
                return instructionAccountNode({
                    ...node,
                    isOptional: true,
                });
            }
        }
    ])
)

// The CPI call to Token Metadata has been deprecated in these
// V1 insructions.
const deprecatedTmIxes = [
    "mintToCollectionV1",
    "setAndVerifyCollection",
    "unverifyCollection",
    "updateMetadata",
    "verifyCollection",
];
let deprecatedIxUpdaters: InstructionAccountDefaultRule[] = [];
for (let ix of deprecatedTmIxes) {
    deprecatedIxUpdaters.push(
        {
            account: "tokenMetadataProgram",
            instruction: ix,
            defaultValue: publicKeyValueNode("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY")
        })
}

// Use spl-noop and spl-account-compression as defaults for all
// V1 instructions.
const v1Ixs = [
    "burn",
    "cancel_redeem",
    "compress",
    "create_tree",
    "decompressV1",
    "delegate",
    "mintToCollectionV1",
    "mintV1",
    "redeem",
    "setAndVerifyCollection",
    "transfer",
    "unverifyCollection",
    "unverifyCreator",
    "updateMetadata",
    "verifyCollection",
    "verifyCreator",
];
let v1IxUpdaters: InstructionAccountDefaultRule[] = [];
for (let ix of v1Ixs) {
    v1IxUpdaters.push(
        {
            account: "logWrapper",
            ignoreIfOptional: true,
            instruction: ix,
            defaultValue: programLinkNode("splNoop")
        })
    v1IxUpdaters.push(
        {
            account: "compressionProgram",
            ignoreIfOptional: true,
            instruction: ix,
            defaultValue: programLinkNode("splAccountCompression"),
        })
}

// Use mpl-noop and mpl-account-compression as defaults for all
// V2 instructions.
const v2Ixs = [
    "burnV2",
    "createTreeV2",
    "delegateAndFreezeV2",
    "delegateV2",
    "freezeV2",
    "mintV2",
    "setCollectionV2",
    "setNonTransferableV2",
    "thawAndRevokeV2",
    "thawV2",
    "transferV2",
    "unverifyCreatorV2",
    "updateAssetDataV2",
    "updateMetadataV2",
    "verifyCreatorV2",
];
let v2IxUpdaters: InstructionAccountDefaultRule[] = [];
for (let ix of v2Ixs) {
    v2IxUpdaters.push(
        {
            account: "logWrapper",
            ignoreIfOptional: true,
            instruction: ix,
            defaultValue: programLinkNode("mplNoop")
        })
    v2IxUpdaters.push(
        {
            account: "compressionProgram",
            ignoreIfOptional: true,
            instruction: ix,
            defaultValue: programLinkNode("mplAccountCompression"),
        })
}

// We skip defaulting leaf delegate only for `freezeV2` and `thawV2` where
// we want the delegate to be made explicit by the caller.
const allLeafDelegateIxs = [...v1Ixs, ...v2Ixs];
const skipLeafDelegateDefaultFor = new Set([
    "freezeV2",
    "thawV2",
]);

const leafDelegateUpdaters: InstructionAccountDefaultRule[] = allLeafDelegateIxs
    .filter((ix) => !skipLeafDelegateDefaultFor.has(ix))
    .map((ix) => ({
        instruction: ix,
        account: "leafDelegate",
        ignoreIfOptional: true,
        defaultValue: accountValueNode("leafOwner")
    }));


// Set default account values across multiple instructions.
codama.update(
    setInstructionAccountDefaultValuesVisitor([
        {
            account: "associatedTokenProgram",
            ignoreIfOptional: true,
            defaultValue: programLinkNode("splAssociatedToken"),
        },
        {
            account: "mplCoreProgram",
            ignoreIfOptional: true,
            defaultValue: programLinkNode("mplCore")
        },
        {
            account: "treeCreator",
            ignoreIfOptional: true,
            defaultValue: identityValueNode(),
        },
        {
            account: "treeCreatorOrDelegate",
            ignoreIfOptional: true,
            defaultValue: identityValueNode(),
        },
        {
            account: "treeConfig",
            ignoreIfOptional: true,
            defaultValue: pdaValueNode("treeConfig"),
        },
        {
            account: "bubblegumSigner",
            ignoreIfOptional: true,
            defaultValue: programIdValueNode(),
        },
        {
            account: "collectionMetadata",
            ignoreIfOptional: true,
            defaultValue: pdaValueNode("metadata", [
                pdaSeedValueNode("mint", accountValueNode("collectionMint"))
            ]),
        },
        {
            account: "collectionEdition",
            ignoreIfOptional: true,
            defaultValue: pdaValueNode("masterEdition", [
                pdaSeedValueNode("mint", accountValueNode("collectionMint"))
            ]),
        },
        {
            account: "collectionAuthorityRecordPda",
            ignoreIfOptional: true,
            defaultValue: programIdValueNode(),
        },
        {
            account: "collectionAuthority",
            ignoreIfOptional: true,
            defaultValue: identityValueNode(),
        },
        {
            account: "mplCoreCpiSigner",
            defaultValue: conditionalValueNode({
                condition: accountValueNode("coreCollection"),
                ifTrue: publicKeyValueNode("CbNY3JiXdXNE9tPNEk1aRZVEkWdj2v7kfJLNQwZZgpXk", "mplCoreSigner"),
            }),
        },
        // `setCollectionV2` always requires the MPL Core signer so it's not a conditional
        // default based on `coreCollection`.
        {
            account: "mplCoreCpiSigner",
            instruction: "setCollectionV2",
            defaultValue: publicKeyValueNode("CbNY3JiXdXNE9tPNEk1aRZVEkWdj2v7kfJLNQwZZgpXk", "mplCoreSigner"),
        },
        ...deprecatedIxUpdaters,
        ...v1IxUpdaters,
        ...v2IxUpdaters,
        ...leafDelegateUpdaters,
    ])
)

// Render tree.
writeFileSync(
    path.join("trees", "codama.json"),
    JSON.stringify(JSON.parse(codama.getJson()), null, 2)
);

// Render Javascript client.
// Program link overrides
// splNoop: "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
// splAccountCompression: "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
// mplNoop: "mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3"
// mplAccountCompression: "mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW"
// splAssociatedToken: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
// mplCore: "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
// bubblegum: "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"

// PDA overrides
// metadata: hooked (copy from https://github.com/mcintyre94/mpl-token-metadata-codama/blob/d44e50e25c171031344bf06b7848ac61856345ec/client-js/src/generated/pdas/metadata.ts#L22)
// masterEdition: hooked (copy from https://github.dev/mcintyre94/mpl-token-metadata-codama/blob/d44e50e25c171031344bf06b7848ac61856345ec/client-js/src/generated/pdas/masterEdition.ts#L22)