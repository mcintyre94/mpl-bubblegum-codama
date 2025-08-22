import { Instruction, Rpc, TransactionMessage, TransactionSigner } from "@solana/kit";
import { CreateTreeConfigAsyncInput, CreateTreeConfigInput, getCreateTreeConfigInstruction, getCreateTreeConfigInstructionAsync } from "./generated";
import { getMerkleTreeSize, SPL_ACCOUNT_COMPRESSION_PROGRAM_ADDRESS } from "@mcintyre94/spl-account-compression";
import { getMinimumBalanceForRentExemption } from "./getMinimumBalanceForRentExemption";
import { getCreateAccountInstruction } from "@solana-program/system";

export async function getCreateTreeInstructions(
    input: Omit<CreateTreeConfigAsyncInput, 'merkleTree'> & {
        merkleTree: TransactionSigner,
        merkleTreeSize?: number;
        canopyDepth?: number;
    }
): Promise<Instruction[]> {
    const space =
        input.merkleTreeSize ??
        getMerkleTreeSize(input.maxDepth, input.maxBufferSize, input.canopyDepth);
    const lamports = getMinimumBalanceForRentExemption(space);

    const programAddress = input.compressionProgram ?? SPL_ACCOUNT_COMPRESSION_PROGRAM_ADDRESS;

    return [
        getCreateAccountInstruction({
            payer: input.payer ?? input.treeCreator,
            newAccount: input.merkleTree,
            space,
            lamports,
            programAddress,
        }),
        await getCreateTreeConfigInstructionAsync({
            ...input,
            merkleTree: input.merkleTree.address,
        })
    ]

}