import Transaction from 'arweave/node/lib/transaction';
import config, { AstatineItem } from './config';

const Arweave = require('arweave');
const fs = require('fs');

export interface config {
  emission_period: number;
  time_interval: number;
  initial_emit_amount: number;
  decay_const: number;
  token_contract_id: string;
  token_allocations: string[] | Promise<AstatineItem[]>;
}

interface AstatineTx {
  id: string;
  tx: Transaction;
  target: string;
  qty: number;
  dataUploaded: number;
}

interface AstatineTxOutput {
  id: string;
  target: string;
  qty: number;
  dataUploaded: number;
}

interface status {
  time_init: number;
  balance: number;
  distributions: { run: number; time: number; expend: number; transactions: AstatineTxOutput[] }[];
}

// Get the key file, stored in a Github secret
const keyfile = JSON.parse(process.env.KEYFILE);

/**
 * math Σ function
 */
const sigma = (start: number, end: number, exp: (x: number) => number) => {
  let result = 0;
  for (let n = start; n <= end; ++n) result += exp(n);
  return result;
};

/**
 * round to the nearest interval
 */
const floorTo = (num: number, int: number) => Math.floor(num / int / 1000) * int;

/**
 * set of distribution curves
 */
const dist = {
  linear: (x: number) => Math.floor(config.initial_emit_amount - (x * config.time_interval * config.initial_emit_amount) / config.emission_period),
  exponential: (x: number) => Math.floor(config.initial_emit_amount * Math.E ** (-config.decay_const * x * config.time_interval)),
  flat: () => Math.floor(config.initial_emit_amount)
};

let dist_curve: string = isNaN(config.decay_const) ? 'linear' : 'exponential';
if (config.decay_const === 0) {
  dist_curve = 'flat'
}
const dist_total: number = sigma(0, config.emission_period / config.time_interval, dist[dist_curve]);

console.log({ config: { dist_curve, dist_total, ...config } });

// save init time & balance on first run
if (!fs.existsSync('status.json')) {
  const init_status: status = {
    time_init: Date.now(),
    balance: dist_total,
    distributions: [],
  };

  fs.writeFileSync('status.json', JSON.stringify(init_status, null, 2));
}

let status: status = JSON.parse(fs.readFileSync('status.json').toString());

console.log('previous status:', status);

// initialise arweave
const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
});

/**
 * Generate all transactions necessary to emit.
 */
async function primeCannon(amount: number, addresses: any, time: number) {
  let weightTotal = 0;
  if (addresses[0]?.weight) {
    // There is a weight variable added, so calculate total weight
    for (let i = 0; i < addresses.length; i++) {
      weightTotal += addresses[i]?.weight;
    }
  }

  let allTransactions : AstatineTx[] = [];
  for (let i = 0; i < addresses.length; i++) {
    let transaction : AstatineTx = {
      id: '',
      tx: null,
      target: '',
      qty: 0,
      dataUploaded: 0,
    }
    transaction.target = addresses[i].address ?? addresses[i]
    transaction.qty = addresses[i].weight ? Math.floor((amount * addresses[i].weight) / weightTotal) : Math.floor(amount / addresses.length)
    transaction.dataUploaded = addresses[i].weight
    const tags = {
      Cannon: 'ArDrive Usage Rewards',
      Function: dist_curve,
      Completion: (time / config.emission_period) * 100,
      Contract: config.token_contract_id,
      'App-Name': 'SmartWeaveAction',
      'App-Version': '0.3.0',
      Input: JSON.stringify({
        function: 'transfer',
        target: transaction.target,
        qty: transaction.qty
      }),
    };

    const tx: Transaction = await arweave.createTransaction(
      {
        target: transaction.target,
        data: Math.random().toString().slice(-4),
      },
      keyfile
    );

    for (const [key, value] of Object.entries(tags)) {
      tx.addTag(key, value.toString());
    }

    await arweave.transactions.sign(tx, keyfile);
    transaction.id = tx.id
    transaction.tx = tx
    allTransactions.push(transaction);
  }

  return allTransactions;
}

/**
 * Send all of the transactions to the corresponding addresses.
 */
async function emit(allTransactions: AstatineTx[]) {
  let sentTransactions : AstatineTx[] = [];
  for (let i = 0; i < allTransactions.length; i++) {
    if (allTransactions[i].qty !== 0) {
      // COMMENT THIS LINE TO NOT SEND TOKENS
      await arweave.transactions.post(allTransactions[i].tx);
      sentTransactions.push(allTransactions[i]);
    }
  }
  return sentTransactions;
}

// start distribution
(async () => {
  const time = floorTo(Date.now() - status.time_init, config.time_interval);

  // get the number of token to distribute
  // const expend = dist[dist_curve](time / config.time_interval);

  // Manually set the amount to expend
  const expend = 800;

  // create a transaction if conditions meet
  if (time <= config.emission_period && expend > 0 && status.balance > 0) {
    console.log({ time, expend, balance: status.balance });

    // create transactions to send
    let transactions = await primeCannon(expend, await config.token_allocations, time);

    // send the transactions
    let sentTransactions = await emit(transactions);

    // Copy the sent transactions to an output file
    let sentTransactionOutput : AstatineTxOutput[] = []
    sentTransactions.forEach((transaction: AstatineTx) => {
      sentTransactionOutput.push({
        id: transaction.id,
        target: transaction.target,
        qty: transaction.qty,
        dataUploaded: transaction.dataUploaded,
      })
    })

    status.distributions.push({
      run: status.distributions.length + 1,
      time,
      expend,
      transactions: sentTransactionOutput,
    });

    status.balance -= expend;
    fs.writeFileSync('status.json', JSON.stringify(status, null, 2));

    console.log('Current Status:', status);
  } else {
    console.log('Unmet Conditions', { time, expend, balance: status.balance });
  }
})();
