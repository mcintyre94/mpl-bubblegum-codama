import { rootNodeFromAnchor, type AnchorIdl, rootNodeFromAnchorWithoutDefaultVisitor } from "@codama/nodes-from-anchor";
import { assertIsNode, bottomUpTransformerVisitor, createFromRoot, definedTypeLinkNode, definedTypeNode, programNode, structFieldTypeNode, structTypeNode, updateProgramsVisitor } from "codama";
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

// Render tree.
writeFileSync(
    path.join("trees", "codama.json"),
    JSON.stringify(JSON.parse(codama.getJson()), null, 2)
);
