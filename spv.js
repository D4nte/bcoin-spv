"use strict";

const bcoin = require("bcoin");
const Logger = require("blgr");

const logger = new Logger({
  level: "info"
});

const NETWORK = "testnet";

bcoin.set(NETWORK);

const node = new bcoin.SPVNode({
  network: NETWORK,
  logger,
  memory: true
});

// We do not need the RPC interface
node.rpc = null;

const walletdb = new bcoin.wallet.WalletDB({
  network: NETWORK,
  memory: false,
  location: `./bcoin-db/${NETWORK}/`,
  logger: logger
});

(async () => {
  await node.ensure();
  await node.open();
  await walletdb.open();
  await node.connect();

  const wallet = await walletdb.create({ logger: logger });
  wallet.logger = logger;
  const walletAddress = new bcoin.Address(
    "tb1qffzwg0n8rvuu88xa6rsal34f2kt7yauc964yyu",
    "testnet"
  );
  console.log("Created wallet with address %s", walletAddress);

  // Add our address to the SPV filter.
  node.pool.watchAddress(walletAddress);

  // Start the blockchain sync.
  node.startSync();

  // Get ready to receive transactions!
  node.on("tx", tx => {
    console.log("Received TX:\n", tx);

    walletdb.addTX(tx);
    console.log("TX added to wallet DB!");
  });

  node.on("block", async block => {
    console.log("Received Block:\n", block);

    await walletdb.addBlock(block);
    console.log("Block added to wallet DB!");
    console.log("Balance:", await wallet.getBalance());

    if (block.txs.length > 0) {
      block.txs.forEach(tx => {
        walletdb.addTX(tx);
        console.log("TX added to wallet DB!");
      });
    }
  });

  wallet.on("balance", balance => {
    console.log("Balance updated:\n", balance.toJSON());
  });

  const netAddr = await node.pool.hosts.addNode("35.189.30.79:18333");
  const peer = node.pool.createOutbound(netAddr);
  node.pool.peers.add(peer);

  await new Promise(r => setTimeout(r, 1000));
  console.log("Balance:", await wallet.getBalance());
})().catch(err => {
  console.error(err.stack);
  process.exit(1);
});
