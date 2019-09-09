'use strict';

const bcoin = require('bcoin');
const Client = require("bitcoin-core");
const Logger = require('blgr');

const logger = new Logger({
  level: 'debug'
});

bcoin.set('regtest');

const BITCOIN_AUTH = {
  protocol: "http",
  username: "bitcoin",
  password: "54pLR_f7-G6is32LP-7nbhzZSbJs_2zSATtZV_r05yg=",
  host: "localhost",
  port: "18443",
};

const bitcoinClient = new Client(BITCOIN_AUTH);

const node = new bcoin.SPVNode({
  network:'regtest',
  logger,
  memory: true
});

const walletdb = new bcoin.wallet.WalletDB({ memory: true, logger: logger });

(async () => {
  await node.open();
  await walletdb.open();
  await node.connect();

  const wallet = await walletdb.create({logger: logger});
  const walletAddress = await wallet.receiveAddress();
  console.log('Created wallet with address %s', walletAddress);

  // Add our address to the SPV filter.
  node.pool.watchAddress(walletAddress);

  // Start the blockchain sync.
  node.startSync();

  // Get ready to receive transactions!
  node.on('tx', (tx) => {
    console.log('Received TX:\n', tx);

    walletdb.addTX(tx);
    console.log('TX added to wallet DB!');
  });

  node.on('block', async (block) => {
    console.log('Received Block:\n', block);

    await walletdb.addBlock(block);
    console.log('Block added to wallet DB!');
    console.log("Balance:", await wallet.getBalance());

    if (block.txs.length > 0) {
      block.txs.forEach((tx) => {
        walletdb.addTX(tx);
        console.log('TX added to wallet DB!');
      })
    }
  });

  wallet.on('balance', (balance) => {
    console.log('Balance updated:\n', balance.toJSON());
  });

  const netAddr = await node.pool.hosts.addNode('127.0.0.1:18444');
  const peer = node.pool.createOutbound(netAddr);
  node.pool.peers.add(peer);

  console.log("Peers:", await bitcoinClient.getPeerInfo());

  await bitcoinClient.generate(101);
  const tx = await bitcoinClient.sendToAddress(walletAddress.toString(), 0.9);
  console.log("Transaction:", tx);
  await bitcoinClient.generate(1);
  await new Promise(r => setTimeout(r, 1000));
  await bitcoinClient.generate(1);
  console.log("Balance:", await wallet.getBalance());

})().catch((err) => {
  console.error(err.stack);
  process.exit(1);
});