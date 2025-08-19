import { rootNodeFromAnchor, type AnchorIdl, rootNodeFromAnchorWithoutDefaultVisitor } from "@codama/nodes-from-anchor";
import { createFromRoot, updateProgramsVisitor } from "codama";
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

// Render tree.
writeFileSync(
    path.join("trees", "codama.json"),
    JSON.stringify(JSON.parse(codama.getJson()), null, 2)
);
