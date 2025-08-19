import { type AnchorIdl, rootNodeFromAnchorWithoutDefaultVisitor } from "@codama/nodes-from-anchor";
import { assertIsNode, bottomUpTransformerVisitor, constantPdaSeedNodeFromString, createFromRoot, deduplicateIdenticalDefinedTypesVisitor, definedTypeLinkNode, definedTypeNode, flattenInstructionDataArgumentsVisitor, getCommonInstructionAccountDefaultRules, numberTypeNode, pdaSeedValueNode, programNode, publicKeyTypeNode, type RootNode, rootNodeVisitor, setFixedAccountSizesVisitor, setInstructionAccountDefaultValuesVisitor, structFieldTypeNode, structTypeNode, transformU8ArraysToBytesVisitor, unwrapInstructionArgsDefinedTypesVisitor, updateAccountsVisitor, updateDefinedTypesVisitor, updateProgramsVisitor, variablePdaSeedNode, visit, type Visitor } from "codama";
import bubblegumIdl from "./idls/bubblegum.json" with { type: "json" };
import { writeFileSync } from "node:fs";
import path from "node:path";

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

// Render tree.
writeFileSync(
    path.join("trees", "codama.json"),
    JSON.stringify(JSON.parse(codama.getJson()), null, 2)
);
