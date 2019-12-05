"use strict";

const bcoin = require("bcoin");
const Client = require("bitcoin-core");
const Logger = require("blgr");

const logger = new Logger({
    level: "info",
    color: true
});

bcoin.set("regtest");

const BITCOIN_AUTH = {
    protocol: "http",
    username: "bitcoin",
    password: "54pLR_f7-G6is32LP-7nbhzZSbJs_2zSATtZV_r05yg=",
    host: "localhost",
    port: "18443"
};

const bitcoinClient = new Client(BITCOIN_AUTH);

const node = new bcoin.SPVNode({
    network: "regtest",
    logger,
    // memory: false,
    db: 'leveldb'
});

// We do not need the RPC interface
node.rpc = null;

const walletdb = new bcoin.wallet.WalletDB({
    memory: false,
    location: "./bcoin-db/",
    logger: logger
});

(async () => {

    // Validate the prefix directory (probably ~/.bcoin)
    await node.ensure();

    await node.open();
    await walletdb.open();
    await node.connect();

    const wallet = await walletdb.create({ logger: logger });
    wallet.logger = logger;
    const walletAddress = await wallet.receiveAddress();
    console.log("Created wallet with address %s", walletAddress);

    // Add our address to the SPV filter.
    node.pool.watchAddress(walletAddress);

    // Get ready to receive transactions!
    node.on("tx", tx => {
        // console.log("Received TX:\n", tx);
        // console.log("Received TX:\n");

        walletdb.addTX(tx);
        // console.log("TX added to wallet DB!");
    });

    node.on("block", async block => {
        // console.log("Received Block:\n", block);
        // console.log("Received Block:\n");

        await walletdb.addBlock(block);
        // console.log("Block added to wallet DB!");
        console.log("Balance:", await wallet.getBalance());

        if (block.txs.length > 0) {
            block.txs.forEach(tx => {
                walletdb.addTX(tx);
                // console.log("TX added to wallet DB!");
            });
        }
    });

    wallet.on("balance", balance => {
        console.log("Balance updated:\n", balance.toJSON());
    });

    // Start the blockchain sync.
    node.startSync();

    const netAddr = await node.pool.hosts.addNode("127.0.0.1:18444");
    const peer = node.pool.createOutbound(netAddr);
    node.pool.peers.add(peer);

    console.log("Peers:", await bitcoinClient.getPeerInfo());

    await bitcoinClient.generate(1);
    const fundingTxId = await bitcoinClient.sendToAddress(
        walletAddress.toString(),
        0.9
    );
    console.log("Transaction:", fundingTxId);
    await bitcoinClient.generate(1);
    const rawFundingTx = await bitcoinClient.getRawTransaction(fundingTxId);
    console.log("rawFundingTx:", rawFundingTx);
    await new Promise(r => setTimeout(r, 1000));
    await bitcoinClient.generate(1);
    console.log("Balance:", await wallet.getBalance());

    const tx = await wallet.send({
        witness: true,
        outputs: [
            {
                address:
                    "bcrt1qp6xfd6qnun0v8ztd0jne8yve0cf2uyxaxn4mmd0akvd7ccyy49msg56d4u",
                value: 15000
            }
        ]
    });
    await node.pool.broadcast(tx);
    console.log("Bcoin tx hash:", tx.txid());
    await new Promise(r => setTimeout(r, 10000));

    const rawtx = await bitcoinClient.getRawTransaction(tx.txid());
    console.log("rawtx:", rawtx);

    console.log("wallet balance: ", await wallet.getBalance())
})().catch(err => {
    console.error(err.stack);
    process.exit(1);
});
