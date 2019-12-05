"use strict";

const bcoin = require("bcoin");
const {NodeClient, Network} = require('bcoin');
const Client = require("bitcoin-core");

const networkStr = "regtest";

const BITCOIN_AUTH = {
  protocol: "http",
  username: "bitcoin",
  password: "54pLR_f7-G6is32LP-7nbhzZSbJs_2zSATtZV_r05yg=",
  host: "localhost",
  port: "18443"
};

const bitcoinClient = new Client(BITCOIN_AUTH);


const Logger = require("blgr");

const info_logger = new Logger({
  level: "info",
  color: true
});
const debug_logger = new Logger({
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
  logger: debug_logger,
  db: 'leveldb',
  memory: false,
  persistent: true,
  workers: true,
  listen: true,
  loader: require,
  config: {wallet: {witness: true}},
  // plugins: [
  //   walletPlugin
  // ]
});

// We do not need the RPC interface
node.rpc = null;


const pool = new bcoin.Pool({
  chain: node.chain,
  spv: true,
  maxPeers: 8
});

node.pool = pool;


// let walletdb;

// Temporary hack
// if (!node.config.bool('no-wallet') && !node.has('walletdb')) {
//   console.log("what's that?");
//   walletdb = node.use(walletPlugin).wdb;
// }

const walletdb = new bcoin.wallet.WalletDB({
  memory: false,
  location: "/Users/bonomat/.bcoin/"+networkStr+ "/wallet",
  spv: true,
  witness: true,
  network: networkStr,
  logger: debug_logger,
});


(async () => {

  // Validate the prefix directory (probably ~/.bcoin)
  await node.ensure();

  await node.open();
  await walletdb.open();
  await node.connect();

  // local regtest node
  const netAddr = await node.pool.hosts.addNode("127.0.0.1:18444");
  const peer = node.pool.createOutbound(netAddr);
  node.pool.peers.add(peer);

  // const wallet = await walletdb.create({ info_logger: info_logger });
  let wallet; /*= new bcoin.wallet.Wallet(walletdb, {
    debug_logger,
    network: networkStr,
    master: "tprv8ZgxMBicQKsPe88gN4spNLbFefuiMfgEMYrJJxAdAQNr8VAMmnRGYexSRmifZqmhh444Qzh1D9npLdcM7uPXDHwEVVUqC2EcGniPsRnCqpk",
    witness: true,
    id: "primary"
  });
*/
  wallet = await walletdb.ensure({
    debug_logger,
    network: networkStr,
    master: "tprv8ZgxMBicQKsPe88gN4spNLbFefuiMfgEMYrJJxAdAQNr8VAMmnRGYexSRmifZqmhh444Qzh1D9npLdcM7uPXDHwEVVUqC2EcGniPsRnCqpk",
    witness: true,
    id: "primary"
  });

  // const wallet2 = await walletdb.create({
  //   logger: debug_logger,
  //   network: networkStr,
  //   master: "tprv8ZgxMBicQKsPe88gN4spNLbFefuiMfgEMYrJJxAdAQNr8VAMmnRGYexSRmifZqmhh444Qzh1D9npLdcM7uPXDHwEVVUqC2EcGniPsRnCqpk",
  //   witness: true
  // });

  const account = await wallet.getAccount(0);

  for (let i = 0; i < 10; i++) {
    let address = await account.deriveReceive(i).getAddress();
    console.log("derived address: " + address);
    pool.watchAddress(address);
    pool.watchAddress(await account.deriveChange(i).getAddress());
  }

  const walletAddress = await wallet.receiveAddress();
  console.log("Created wallet with address %s", walletAddress);
  console.log("It should be : bcrt1q0glg2h5mr9wscetzu3k79dtey6sljqdm2mnzx6");
  // Add our address to the SPV filter.
  node.pool.watchAddress(walletAddress);

  // Get ready to receive transactions!
  node.on("tx", tx => {
    walletdb.addTX(tx);
    console.log("TX added to wallet DB!");
  });

  node.on("block", async block => {
    // console.log("Received Block:\n", block.rhash);
    console.log("Received Block:\n");

    await walletdb.addBlock(block);
    // console.log("Block added to wallet DB!");
    // console.log("Balance:", await wallet.getBalance());

    if (block.txs.length > 0) {
      block.txs.forEach(tx => {
        walletdb.addTX(tx);
        console.log("TX added to wallet DB!");
      });
    }
    console.log("----------inbanace walletdb balance" + JSON.stringify(await wallet.getBalance()));
  });

  node.on("tip", async entry => {
    console.log("----------tip Found tip:\n", entry);

    console.log("----------tip walletdb state" + JSON.stringify(await walletdb.getState()));

    console.log("----------tip walletdb tip" + JSON.stringify(await walletdb.getTip()));
  });

  wallet.on("balance", async balance => {
    console.log("Balance updated:\n", balance.toJSON());
    console.log("----------inbanace walletdb state" + JSON.stringify(await walletdb.getState()));

    console.log("----------inbanace walletdb tip" + JSON.stringify(await walletdb.getTip()));
    console.log("----------inbanace walletdb balance" + JSON.stringify(await wallet.getBalance()));

  });

  // Start the blockchain sync.
  node.startSync();

  await walletdb.syncNode();
  // await walletdb.syncState();
  // await walletdb.syncChain();
  //
  await wallet.open();
  console.log("----------Sleeping for 5 sec");

  await new Promise(r => setTimeout(r, 5000));

  // await node.scan(1610000);
  // await walletdb.scan(1610000);

  console.log("----------walletdb state" + JSON.stringify(await walletdb.getState()));

  console.log("----------walletdb tip" + JSON.stringify(await walletdb.getTip()));
  console.log("----------wallet balance: ", await wallet.getBalance());
  console.log("----------Getting the tip", await walletdb.getTip());
  // const tip = await client.getTip();
  // console.log("----------" + tip);
  // const result = await client.reset(1600000);
  console.log("----------wallet balance: ", await wallet.getBalance());
  console.log("----------wallet balance 0: ", await wallet.getBalance(0));
  console.log("----------wallet getCredits: ", await wallet.getCredits());
  console.log("----------wallet getHistory: ", await wallet.getHistory());


  // const block = await walletdb.getBlock(1600000);
  // console.log(block);
  // await walletdb.setTip(block);

  // await bitcoinClient.generate(101);
  await new Promise(r => setTimeout(r, 5000));

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
        value: 10000
      }
    ]
  });
  await node.pool.broadcast(tx);
  const rawtx = await bitcoinClient.getRawTransaction(tx.txid());
  console.log("rawtx:", rawtx);

  console.log("Bcoin tx hash:", tx.txid());
  console.log("Balance:", await wallet.getBalance());

})().catch(err => {
  console.error(err.stack);
  process.exit(1);
});
