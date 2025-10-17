import { BigNumber } from '@ethersproject/bignumber';
import * as fs from 'fs';
import pkg from 'casper-js-sdk';
const { HttpHandler, RpcClient, InitiatorAddr, Timestamp, Duration, PricingMode, TransactionTarget, TransactionEntryPoint, TransactionScheduling, Args, PublicKey, PaymentLimitedMode, Transaction, TransactionV1Payload, TransactionV1, CLValue, TransactionEntryPointEnum, PrivateKey, KeyAlgorithm, InfoGetTransactionResult, TransactionHash, ContractCallBuilder, Key, KeyTypeID } = pkg;

// Load the private key.
const pemFilePath = '<PATH_TO_YOUR_SECRET_KEY.pem>';
const fileContent = fs.readFileSync(pemFilePath, 'utf8');
const privateKey = PrivateKey.fromPem(fileContent, KeyAlgorithm.ED25519);

// Create RPC client.
const rpcHandler = new HttpHandler('https://node.testnet.casper.network/rpc');
const rpcClient = new RpcClient(rpcHandler);

// Create a new, example SR_ID argument value.
// You'll have to put keccak256 hash here.
function new_sr_id(value: number): CLValue {
    let arr = new Array<number>(32).fill(0);
    arr[0] = value;
    return CLValue.newCLByteArray(Uint8Array.from(arr));
}

// Extract the sr_id argument value from a transaction.
function extract_sr_id(transaction: InfoGetTransactionResult): string {
    let arg = transaction.transaction.args.getByName('sr_id');
    if (arg == undefined) {
        throw new Error("sr_id argument not found in transaction");
    }

    return arg.byteArray!.toString();
}

// --------- Native Transfer Example ---------

// Create a native transfer transaction.
function build_native_transfer(
    publicKey: PublicKey,
    recipient: PublicKey,
    amount: BigNumber | string,
    sr_id: CLValue
): Transaction {
    // Define pricing mode.
    const pricingMode = new PricingMode();
    const paymentLimited = new PaymentLimitedMode();
    paymentLimited.standardPayment = true;
    paymentLimited.paymentAmount = 100_000_000;
    paymentLimited.gasPriceTolerance = 1;
    pricingMode.paymentLimited = paymentLimited;

    // Args
    const runtimeArgs = Args.fromMap({});
    runtimeArgs.insert('target', CLValue.newCLPublicKey(recipient));
    runtimeArgs.insert('amount', CLValue.newCLUInt512(amount));
    runtimeArgs.insert('sr_id', sr_id);

    // Build transaction payload.
    const transactionPayload = TransactionV1Payload.build({
      initiatorAddr: new InitiatorAddr(publicKey),
      timestamp: new Timestamp(new Date()),
      ttl: new Duration(1800000),
      chainName: 'casper-test',
      pricingMode: pricingMode,
      args: runtimeArgs,
      transactionTarget: new TransactionTarget({}),
      entryPoint: new TransactionEntryPoint(
         TransactionEntryPointEnum.Transfer
      ),
      scheduling: new TransactionScheduling({})
    });

    const transactionV1 = TransactionV1.makeTransactionV1(transactionPayload);
    return Transaction.fromTransactionV1(transactionV1);
}

// Sends example native transfer with a given SR_ID.
async function send_native_transfer(sr_id: CLValue): Promise<TransactionHash> {
    const transaction = build_native_transfer(
        privateKey.publicKey,
        PublicKey.fromHex('0202f5a92ab6da536e7b1a351406f3744224bec85d7acbab1497b65de48a1a707b64'),
        '4200000000',
        sr_id
    )

    transaction.sign(privateKey);
    console.log('[x] Transaction Hash:', transaction.hash.toHex());
    await rpcClient.putTransaction(transaction);
    const transactionResult = await rpcClient.waitForTransaction(transaction, 100000);

    // Additioanally check for success.
    let is_success = transactionResult.executionInfo?.executionResult.errorMessage == undefined;
    if (!is_success) {
        throw new Error("Transaction was not successful");
    }
    
    return transaction.hash;
}

// Run full native transfer example.
// 1. Create new native transfer.
// 2. Extract SR_ID argument from the successful transaction.
async function run_native_transfer_example() {
    console.log('[x] Running native transfer example');
    console.log('[x] Public key:', privateKey.publicKey.toHex());
    let native_tx_hash = (await send_native_transfer(new_sr_id(15))).toHex();
    const native_tx = await rpcClient.getTransactionByTransactionHash(native_tx_hash);
    let extracted_sr_id = extract_sr_id(native_tx);
    console.log("[x] Extracted sr_id argument value:", extracted_sr_id);
    console.log('[x] Native transfer example finished\n');
}

// --------- CEP-18 Transfer Example ---------

// Sends example CEP-18 transfer with a given SR_ID.
async function send_cep18_transfer(sr_id: CLValue): Promise<TransactionHash> {
     let txBuilder = new ContractCallBuilder()
        .byPackageHash("b72183e301022030195350876ce3226d0067aee1eb3695a5252ee2b85eabe741")
        .entryPoint('transfer')
        .from(privateKey.publicKey)
        .chainName('casper-test')
        .payment(2500000000)
        .ttl(1800000)
        .runtimeArgs(
            Args.fromMap({
                recipient: CLValue.newCLKey(
                    Key.createByType(
                        "account-hash-040fe59024a78372bc1225cfd5ed258eacdbbc7c5d09d35767777dc10c5d14ca",
                        KeyTypeID.Account
                    )
                ),
                amount: CLValue.newCLUInt256(1000),
                sr_id: sr_id
            })
        );

    let transaction = txBuilder.build();
    transaction.sign(privateKey);
    console.log('[x] Transaction Hash:', transaction.hash.toHex());
    await rpcClient.putTransaction(transaction);
    const transactionResult = await rpcClient.waitForTransaction(transaction, 100000);

    // Additioanally check for success.
    let is_success = transactionResult.executionInfo?.executionResult.errorMessage == undefined;
    if (!is_success) {
        throw new Error("Transaction was not successful");
    }
    
    return transaction.hash;
}

// Run full CEP-18 transfer example.
// 1. Create new CEP-18 transfer.
// 2. Extract SR_ID argument from the successful transaction.
async function run_cep18_transfer_example() {
    console.log('[x] Running CEP-18 transfer example');
    console.log('[x] Public key:', privateKey.publicKey.toHex());
    let sr_id = new_sr_id(63);
    let cep18_tx_hash = (await send_cep18_transfer(sr_id)).toHex();
    const cep18_tx = await rpcClient.getTransactionByTransactionHash(cep18_tx_hash);
    let extracted_sr_id = extract_sr_id(cep18_tx);
    console.log("[x] Extracted sr_id argument value:", extracted_sr_id);
    console.log('[x] CEP-18 transfer example finished\n');
}

// --------- Main ---------
async function main() {
    await run_native_transfer_example().catch(console.error);
    await run_cep18_transfer_example().catch(console.error);
}

main();