import { type AnchorIdl, rootNodeFromAnchorWithoutDefaultVisitor, defaultVisitor } from "@codama/nodes-from-anchor";
import {
    accountLinkNode,
    accountNode,
    accountValueNode,
    argumentValueNode,
    assertIsNode,
    booleanValueNode,
    bottomUpTransformerVisitor,
    conditionalValueNode,
    constantPdaSeedNodeFromString,
    createFromRoot,
    definedTypeLinkNode,
    definedTypeNode,
    enumValueNode,
    identityValueNode,
    type InstructionAccountDefaultRule,
    instructionAccountNode,
    instructionArgumentNode,
    type InstructionArgumentUpdates,
    instructionByteDeltaNode,
    noneValueNode,
    numberTypeNode,
    pdaSeedValueNode,
    pdaValueNode,
    programIdValueNode,
    programLinkNode,
    programNode,
    publicKeyTypeNode,
    publicKeyValueNode,
    resolverValueNode,
    setInstructionAccountDefaultValuesVisitor,
    setStructDefaultValuesVisitor,
    someValueNode,
    stringValueNode,
    structFieldTypeNode,
    structTypeNode,
    updateAccountsVisitor,
    updateDefinedTypesVisitor,
    updateInstructionsVisitor,
    updateProgramsVisitor,
    variablePdaSeedNode
} from "codama";
import bubblegumIdl from "./idls/bubblegum.json" with { type: "json" };
import { writeFileSync } from "node:fs";
import path from "node:path";

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

// Update instructions.
const hashUpdates: InstructionArgumentUpdates = {
    dataHash: {
        defaultValue: resolverValueNode("resolveDataHash", {
            dependsOn: [
                argumentValueNode("metadata")
            ]
        })
    },
    creatorHash: {
        defaultValue: resolverValueNode("resolveCreatorHash", {
            dependsOn: [
                argumentValueNode("metadata")
            ]
        })
    }
}

codama.update(
    updateInstructionsVisitor({
        createTree: {
            name: "createTreeConfig",
            byteDeltas: [
                instructionByteDeltaNode(accountLinkNode("treeConfig"))
            ]
        },
        mintToCollectionV1: {
            arguments: {
                metadataArgs: { name: "metadata" }
            }
        },
        transfer: {
            accounts: {
                leafOwner: { isSigner: "either" },
                leafDelegate: { isSigner: "either" },
            },
        },
        burn: {
            accounts: {
                leafOwner: { isSigner: "either" },
                leafDelegate: { isSigner: "either" },
            },
        },
        redeem: {
            accounts: {
                voucher: {
                    defaultValue: pdaValueNode("voucher", [
                        pdaSeedValueNode("merkleTree", accountValueNode("merkleTree")),
                        pdaSeedValueNode("nonce", argumentValueNode("nonce"))
                    ])
                },
            },
        },
        decompressV1: {
            accounts: {
                metadata: {
                    name: "metadataAccount",
                    defaultValue: pdaValueNode("metadata", [
                        pdaSeedValueNode("mint", accountValueNode("mint"))
                    ]),
                },
                masterEdition: {
                    defaultValue: pdaValueNode("masterEdition", [
                        pdaSeedValueNode("mint", accountValueNode("mint"))
                    ]),
                },
                tokenAccount: {
                    defaultValue: pdaValueNode("associatedToken", [
                        pdaSeedValueNode("mint", accountValueNode("mint")),
                        pdaSeedValueNode("tokenProgram", accountValueNode("tokenProgram")),
                        pdaSeedValueNode("owner", argumentValueNode("tokenOwner")),
                    ])
                },
                mintAuthority: {
                    defaultValue: pdaValueNode("mintAuthority", [
                        pdaSeedValueNode("mint", accountValueNode("mint"))
                    ])
                },
            },
        },
        setAndVerifyCollection: {
            accounts: {
                treeCreatorOrDelegate: { isSigner: "either" },
            },
            arguments: {
                ...hashUpdates,
                collection: {
                    defaultValue: accountValueNode("collectionMint")
                }
            }
        },
        verifyCollection: { arguments: { ...hashUpdates } },
        unverifyCollection: { arguments: { ...hashUpdates } },
        verifyCreator: { arguments: { ...hashUpdates } },
        unverifyCreator: { arguments: { ...hashUpdates } },
        // Remove deprecated instructions.
        setDecompressableState: { delete: true },
        // Remove unnecessary spl_account_compression instructions.
        append: { delete: true },
        closeEmptyTree: { delete: true },
        compress: { delete: true },
        initEmptyMerkleTree: { delete: true },
        insertOrAppend: { delete: true },
        noopInstruction: { delete: true },
        replaceLeaf: { delete: true },
        transferAuthority: { delete: true },
        // V2 instructions
        burnV2: {
            arguments: {
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
            }
        },
        collectV2: {
            accounts: {
                destination: {
                    defaultValue: publicKeyValueNode("2dgJVPC5fjLTBTmMvKDRig9JJUGK2Fgwr3EHShFxckhv")
                }
            }
        },
        createTreeV2: {
            name: "createTreeConfigV2",
            byteDeltas: [
                instructionByteDeltaNode(accountLinkNode("treeConfig"))
            ]
        },
        delegateAndFreezeV2: {
            arguments: {
                collectionHash: { defaultValue: noneValueNode() },
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() }
            }
        },
        delegateV2: {
            arguments: {
                collectionHash: { defaultValue: noneValueNode() },
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
            }
        },
        freezeV2: {
            arguments: {
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
            }
        },
        mintV2: {
            arguments: {
                metadataArgs: { name: "metadata" },
                assetData: { defaultValue: noneValueNode() },
                assetDataSchema: { defaultValue: noneValueNode() }
            },
        },
        setCollectionV2: {
            arguments: {
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
            }
        },
        setNonTransferableV2: {
            arguments: {
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
            }
        },
        thawAndRevokeV2: {
            arguments: {
                collectionHash: { defaultValue: noneValueNode() },
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
            }
        },
        thawV2: {
            arguments: {
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() }
            }
        },
        transferV2: {
            arguments: {
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
            }
        },
        unverifyCreatorV2: {
            arguments: {
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
            }
        },
        updateAssetDataV2: {
            arguments: {
                previousAssetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
                newAssetData: { defaultValue: noneValueNode() },
                newAssetDataSchema: { defaultValue: noneValueNode() }
            }
        },
        updateMetadataV2: {
            arguments: {
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
            }
        },
        verifyCreatorV2: {
            arguments: {
                assetDataHash: { defaultValue: noneValueNode() },
                flags: { defaultValue: noneValueNode() },
            }
        }
    })
)

// Set default values for structs.
codama.update(
    setStructDefaultValuesVisitor({
        createTreeConfigInstructionData: {
            public: noneValueNode()
        },
        createTreeConfigV2InstructionData: {
            public: noneValueNode()
        },
        metadataArgs: {
            symbol: stringValueNode(""),
            primarySaleHappened: booleanValueNode(false),
            isMutable: booleanValueNode(true),
            editionNonce: noneValueNode(),
            tokenStandard: someValueNode(enumValueNode("TokenStandard", "NonFungible")),
            uses: noneValueNode(),
            tokenProgramVersion: enumValueNode("TokenProgramVersion", "Original"),
        },
        metadataArgsV2: {
            symbol: stringValueNode(""),
            primarySaleHappened: booleanValueNode(false),
            isMutable: booleanValueNode(true),
            tokenStandard: someValueNode(enumValueNode("TokenStandard", "NonFungible")),
        },
        updateArgs: {
            name: noneValueNode(),
            symbol: noneValueNode(),
            uri: noneValueNode(),
            creators: noneValueNode(),
            sellerFeeBasisPoints: noneValueNode(),
            primarySaleHappened: noneValueNode(),
            isMutable: noneValueNode(),
        },
    })
)

// Custom tree updates.
// codama.update(
//     bottomUpTransformerVisitor([
//         {
//             // Add nodes to the splAccountCompression program.
//             select: '[programNode]splAccountCompression',
//             transform: (node) => {
//                 assertIsNode(node, "programNode");
//                 return programNode({
//                     ...node,
//                     accounts: [
//                         ...node.accounts,
//                         accountNode({
//                             name: "merkleTree",
//                             data: definedTypeLinkNode()

//                     ]
//                 })
//             }

//         }
//     ])
// )

// kinobi.update(
//     new k.TransformNodesVisitor([
//         {
//             // Add nodes to the splAccountCompression program.
//             selector: { kind: "programNode", name: "splAccountCompression" },
//             transformer: (node) => {
//                 k.assertProgramNode(node);
//                 return k.programNode({
//                     ...node,
//                     accounts: [
//                         ...node.accounts,
//                         k.accountNode({
//                             name: "merkleTree",
//                             data: k.accountDataNode({
//                                 name: "merkleTreeAccountData",
//                                 link: k.linkTypeNode("merkleTreeAccountData", {
//                                     importFrom: "hooked",
//                                 }),
//                                 struct: k.structTypeNode([
//                                     k.structFieldTypeNode({
//                                         name: "discriminator",
//                                         child: k.linkTypeNode("compressionAccountType"),
//                                     }),
//                                     k.structFieldTypeNode({
//                                         name: "treeHeader",
//                                         child: k.linkTypeNode("concurrentMerkleTreeHeaderData"),
//                                     }),
//                                     k.structFieldTypeNode({
//                                         name: "serializedTree",
//                                         child: k.bytesTypeNode(k.remainderSize()),
//                                     }),
//                                 ]),
//                             }),
//                         }),
//                     ],
//                 });
//             },
//         },

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
// associatedToken: hooked (copy from https://github.com/solana-program/token/blob/cf136e7c82526a58859abfc2baaadcdbeb0f751c/clients/js/src/generated/pdas/associatedToken.ts#L25)
// mintAuthority: hooked (migrate from https://github.com/metaplex-foundation/mpl-bubblegum/blob/905535c5601c013fe961a9e8c8aa43033a276429/clients/js/src/hooked/mintAuthority.ts#L5)