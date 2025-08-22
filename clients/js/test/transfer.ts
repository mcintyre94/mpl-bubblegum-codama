import {
    Address,
    airdropFactory,
    appendTransactionMessageInstructions,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    generateKeyPairSigner,
    getAddressDecoder,
    Instruction,
    KeyPairSigner,
    lamports,
    none,
    pipe,
    ProgramDerivedAddress,
    Rpc,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    SolanaRpcApi,
    TransactionMessage,
    TransactionMessageWithBlockhashLifetime,
    TransactionMessageWithFeePayerSigner,
    TransactionSigner,
} from "@solana/kit";
import { fetchMerkleTree, getCurrentRoot } from "@mcintyre94/spl-account-compression";
import test from "ava";
import {
    DecompressibleState,
    findLeafAssetIdPda,
    findTreeConfigPda,
    getCreateTreeInstructions,
    getMintV1InstructionAsync,
    getSetDecompressibleStateInstruction,
    getTransferInstructionAsync,
    hashLeaf,
    hashMetadataCreators,
    hashMetadataData,
    MetadataArgsArgs,
    MintV1AsyncInput
} from "../src";

import { publicKey } from "@metaplex-foundation/umi";
import { createUmi as baseCreateUmi } from "@metaplex-foundation/umi-bundle-tests";
import { mplBubblegum, hashLeaf as mHashLeaf } from "@metaplex-foundation/mpl-bubblegum";

async function createUmi() {
    return (await baseCreateUmi()).use(mplBubblegum())
}

const addressDecoder = getAddressDecoder();

type TestContext = {
    rpc: Rpc<SolanaRpcApi>;
    confirmTransaction: ReturnType<typeof sendAndConfirmTransactionFactory>;
    // airdrop: ReturnType<typeof airdropFactory>;
    fundedPayer: TransactionSigner;
};

async function createSignerWithSol(
    airdrop: ReturnType<typeof airdropFactory> //TestContext["airdrop"]
): Promise<KeyPairSigner> {
    const signer = await generateKeyPairSigner();
    await airdrop({
        recipientAddress: signer.address,
        lamports: lamports(1_000_000_000n), // 1 SOL
        commitment: "confirmed",
    });
    return signer;
}

async function createLocalhostTestContext(): Promise<TestContext> {
    const rpc = createSolanaRpc("http://localhost:8899");
    const rpcSubscriptions = createSolanaRpcSubscriptions("ws://localhost:8900");
    const confirmTransaction = sendAndConfirmTransactionFactory({
        rpc,
        rpcSubscriptions,
    });
    const airdrop = airdropFactory({ rpc, rpcSubscriptions });
    const fundedPayer = await createSignerWithSol(airdrop);
    return { rpc, confirmTransaction, fundedPayer };
}

type SendableTransactionMessage = TransactionMessage &
    TransactionMessageWithBlockhashLifetime &
    TransactionMessageWithFeePayerSigner;

async function createTransaction(
    { rpc, fundedPayer }: Pick<TestContext, "rpc" | "fundedPayer">,
    instructions: Instruction[]
): Promise<SendableTransactionMessage> {
    const { value: blockhash } = await rpc.getLatestBlockhash().send();

    const transaction = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(fundedPayer, tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) => appendTransactionMessageInstructions(instructions, tx)
    );

    return transaction;
}

async function sendTransaction(
    { confirmTransaction }: Pick<TestContext, "confirmTransaction">,
    transaction: SendableTransactionMessage
) {
    const signedTransaction = await signTransactionMessageWithSigners(
        transaction
    );

    return await confirmTransaction(signedTransaction, {
        commitment: "confirmed",
        skipPreflight: true, // Skip preflight to make testing program errors easier
    });
}

async function createAndSendTransaction(
    { rpc, confirmTransaction, fundedPayer }: Pick<TestContext, "rpc" | "confirmTransaction" | "fundedPayer">,
    instructions: Instruction[]
) {
    const transaction = await createTransaction({ rpc, fundedPayer }, instructions);
    return await sendTransaction({ confirmTransaction }, transaction);
}

// TODO: might need to add `input` param to pass custom args to `getCreateTreeInstructions`
async function createTree(
    testContext: TestContext,
    treeCreator: TransactionSigner
): Promise<Address> {
    const merkleTree = await generateKeyPairSigner();
    const baseCreateTreeInstructions = await getCreateTreeInstructions({
        merkleTree,
        maxDepth: 14,
        maxBufferSize: 64,
        treeCreator,
    })
    const [treeConfigAddress] = await findTreeConfigPda({ merkleTree: merkleTree.address })
    const setDecompressibleStateInstruction = getSetDecompressibleStateInstruction({
        treeConfig: treeConfigAddress,
        treeCreator,
        decompressableState: DecompressibleState.Enabled,
    });

    await createAndSendTransaction(
        testContext,
        [
            ...baseCreateTreeInstructions,
            setDecompressibleStateInstruction
        ]
    )

    return merkleTree.address;
}

type MintResponse = {
    metadata: MetadataArgsArgs;
    assetId: ProgramDerivedAddress;
    leaf: Address;
    leafIndex: number;
}

async function mint(
    { rpc, confirmTransaction, fundedPayer }: Pick<TestContext, 'rpc' | 'confirmTransaction' | 'fundedPayer'>,
    input: Omit<MintV1AsyncInput, 'metadata' | 'leafOwner'> & {
        leafOwner: Address;
        leafIndex?: number | bigint;
        metadata?: Partial<MintV1AsyncInput['metadata']>;
    }
): Promise<MintResponse> {
    const { leafOwner, merkleTree } = input;
    let { leafIndex } = input;
    if (!leafIndex) {
        const fetchedTree = await fetchMerkleTree(rpc, input.merkleTree);
        leafIndex = fetchedTree.data.tree.activeIndex;
    }
    const metadata: MetadataArgsArgs = {
        name: 'My NFT',
        uri: 'https://example.com/my-nft.json',
        sellerFeeBasisPoints: 500, // 5%
        collection: none(),
        creators: [],
        ...input.metadata,
    };

    const mintInstruction = await getMintV1InstructionAsync({
        ...input,
        metadata,
        leafOwner,
    })

    await createAndSendTransaction({ rpc, confirmTransaction, fundedPayer }, [mintInstruction])

    const assetId = await findLeafAssetIdPda({
        merkleTree,
        leafIndex,
    });

    const leaf = await hashLeaf({
        merkleTree,
        owner: leafOwner,
        delegate: input.leafDelegate ?? leafOwner,
        leafIndex,
        metadata,
    })

    return {
        metadata,
        assetId,
        leafIndex: Number(leafIndex),
        leaf: addressDecoder.decode(leaf)
    }
}

test('it can transfer a compressed NFT', async (t) => {
    // Given a tree with a minted NFT owned by leafOwnerA.
    const testContext = await createLocalhostTestContext()
    const { rpc } = testContext;

    const leafOwnerA = testContext.fundedPayer;
    const merkleTree = await createTree(testContext, leafOwnerA);
    const { metadata, leafIndex } = await mint(testContext, {
        merkleTree,
        leafOwner: leafOwnerA.address,
        treeCreatorOrDelegate: leafOwnerA,
    });

    // When leafOwnerA transfers the NFT to leafOwnerB.
    const leafOwnerB = await generateKeyPairSigner();
    let merkleTreeAccount = await fetchMerkleTree(rpc, merkleTree);

    const transferInstruction = await getTransferInstructionAsync({
        leafOwner: leafOwnerA,
        newLeafOwner: leafOwnerB.address,
        merkleTree,
        root: getCurrentRoot(merkleTreeAccount.data.tree),
        dataHash: hashMetadataData(metadata),
        creatorHash: hashMetadataCreators(metadata.creators),
        nonce: leafIndex,
        index: leafIndex,
        proof: [],
    });
    await createAndSendTransaction(testContext, [transferInstruction]);

    // Then the leaf was updated in the merkle tree.
    const updatedLeaf = await hashLeaf({
        merkleTree,
        owner: leafOwnerB.address,
        leafIndex,
        metadata,
    });

    merkleTreeAccount = await fetchMerkleTree(rpc, merkleTree);
    t.is(merkleTreeAccount.data.tree.rightMostPath.leaf, addressDecoder.decode(updatedLeaf));
});
