import { config } from './index';
const Arweave = require('arweave');
const arweave = Arweave.init({
  host: 'arweave.net', // Arweave Gateway
  port: 443,
  protocol: 'https',
  timeout: 600000,
});

// The ArDrive Profit Sharing Community Contract
const token_contract_id : string = "-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ";

interface AstatineItem {
  address: string,
  dataAmount: number,
  weight: number,
}

const token_allocation_function = () : string[] => {
  let weightedList : AstatineItem[];
  let walletsToReward : string[] = []
  let x = 0;

  // Get all ArDrive data transactions in last 24 hours
  weightedList = get_24_hour_ardrive_transactions();

  // Only pull the top 20 addresses for rewards
  while (x <= 20) {
    walletsToReward[x] = weightedList[x].address
  }
  return walletsToReward;
}

function dataCompare(a: any, b: any) {
  let comparison = 0;
  if (a.dataAmount > b.dataAmount) {
    comparison = 1;
  } else if (a.dataAmount < b.dataAmount) {
    comparison = -1;
  }
  return comparison * -1;
}

function query_for_data_uploads(firstPage: number, cursor: string) {
    try {
    const query = {
      query: `query {
      transactions(
        sort: HEIGHT_DESC
        tags: { name: "App-Name", values: ["ArDrive-Desktop", "ArDrive-Web"] }
        first: ${firstPage}
        after: "${cursor}"
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            owner {
              address
            }
            data {
              size
            }
            block {
              timestamp
            }
          }
        }
      }
    }`,
    };
    // Call the Arweave Graphql Endpoint
    const response = arweave.api
      .request()
      .post('https://arweave.net/graphql', query);
    const { data } = response.data;
    const { transactions } = data;
    return transactions
  } catch (err) {
    console.log (err)
    console.log ("uh oh cant query")
  }
}

function get_24_hour_ardrive_transactions() : AstatineItem[] {
  let completed : Boolean = false;
  let weightedList : AstatineItem[] = [];
  let firstPage : number = 2147483647; // Max size of query for GQL
  let cursor : string = "";
  let timeStamp = new Date();
  let yesterday = new Date(timeStamp);
  yesterday.setDate(yesterday.getDate() -1)

  while (!completed) {
    // Create the query to search for all ardrive transactions.
    let transactions = query_for_data_uploads(firstPage, cursor)
    const { edges } = transactions;
    edges.forEach((edge: any) => {
      cursor = edge.cursor;
      const { node } = edge;
      const { data } = node;
      const { owner } = node;
      const { block } = node;
      let timeStamp = new Date(block.timestamp * 1000)
      // We only want results from last 24 hours, defined by milliseconds since epoch
      if (yesterday.getTime() <= timeStamp.getTime()) {
        // We only want data transactions
        if (data.size > 0) {
          // Does this wallet address exist in our array?
          let objIndex = weightedList.findIndex((obj => obj.address === owner.address));
          if (objIndex >= 0) {
          // If it exists, then we increment the existing data amount
            console.log ("Existing wallet found %s with %s data", weightedList[objIndex].address, weightedList[objIndex].dataAmount);
            console.log ("Adding ", data.size)
            weightedList[objIndex].dataAmount += data.size 
          } 
          else {
            // Else we add a new user into our Astatine List
            console.log ("Adding new wallet ", owner.address)
            let arDriveUser : AstatineItem = {
              address: owner.address,
              dataAmount: data.size,
              weight: 0,
            }
            weightedList.push(arDriveUser);
          }
        }
      }
      else {
        // The blocks are too old, and we dont care about them
        completed = true;
      }
    })
  }

  // lets sort the list based on data amount
  weightedList.sort(dataCompare)
  return weightedList;
}

const config: config = {
  emission_period: 1209600, // E
  time_interval: 86400, // I
  initial_emit_amount: 140, // A
  decay_const: 0, // k
  token_contract_id,
  token_allocations: token_allocation_function(),
};

export default config;
