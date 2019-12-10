"use strict";

const bcoin = require("bcoin");
const Logger = require("blgr");

const networkStr = "testnet";

const logger = new Logger({
  level: "debug",
  color: true
});

bcoin.set(networkStr);

let walletPlugin = bcoin.wallet.plugin;
const node = new bcoin.SPVNode({
  network: networkStr,
  file: true,
  argv: true,
  env: true,
  logFile: true,
  logConsole: true,
  logger: logger,
  db: "leveldb",
  memory: false,
  persistent: true,
  workers: true,
  listen: true,
  loader: require,
  config: { wallet: { witness: true } }
});

// We do not need the RPC interface
node.rpc = null;

const pool = new bcoin.Pool({
  chain: node.chain,
  spv: true,
  maxPeers: 8
});

node.pool = pool;

const walletdb = new bcoin.wallet.WalletDB({
  memory: false,
  location: "/Users/bonomat/.bcoin/" + networkStr + "/wallet",
  spv: true,
  witness: true,
  network: networkStr,
  logger: logger
});

(async () => {
  // Validate the prefix directory (probably ~/.bcoin)
  await node.ensure();

  await node.open();
  await walletdb.open();
  await node.connect();
  let wallet = await walletdb.ensure({
    debug_logger: logger,
    network: networkStr,
    master:
      "tprv8ZgxMBicQKsPe88gN4spNLbFefuiMfgEMYrJJxAdAQNr8VAMmnRGYexSRmifZqmhh444Qzh1D9npLdcM7uPXDHwEVVUqC2EcGniPsRnCqpk",
    witness: true,
    id: "primary"
  });

  const account = await wallet.getAccount(0);

  for (let i = 0; i < 10; i++) {
    let address = await account.deriveReceive(i).getAddress();
    console.log("derived address: " + address);
    pool.watchAddress(address);
    pool.watchAddress(await account.deriveChange(i).getAddress());
  }

  const walletAddress = await wallet.receiveAddress();
  console.log("Created wallet with address %s", walletAddress);
  // Add our address to the SPV filter.
  node.pool.watchAddress(walletAddress);

  // Get ready to receive transactions!
  node.on("tx", tx => {
    walletdb.addTX(tx);
    console.log("TX added to wallet DB!");
  });

  node.on("block", async block => {
    console.log("Received Block");

    await walletdb.addBlock(block);
    if (block.txs.length > 0) {
      block.txs.forEach(tx => {
        walletdb.addTX(tx);
        console.log("TX added to wallet DB!");
      });
    }
  });

  wallet.on("balance", async balance => {
    console.log("Balance updated:\n", balance.toJSON());
  });

  // Start the blockchain sync.
  node.startSync();
  await walletdb.syncNode();
  //
  await wallet.open();

  await new Promise(r => setTimeout(r, 5000));

  console.log("Balance: ", await wallet.getBalance());
  console.log("Wallet Tip", await walletdb.getTip());

  const tx = await wallet.send({
    witness: true,
    outputs: [
      {
        address: "bcrt1q26asezw6wmr26ps6slfpyn5fppxep0lwsmzsdd",
        value: 10000
      }
    ]
  });
  await node.pool.broadcast(tx);

  console.log("Bcoin tx hash:", tx.txid());
  console.log("Balance:", await wallet.getBalance());
})().catch(err => {
  console.error(err.stack);
  process.exit(1);
});
