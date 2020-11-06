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

export interface AstatineItem {
  address: string,
  weight: number,
}

const token_allocation_function = async() : Promise<AstatineItem[]> => {
  let weightedList : AstatineItem[];

  // Get all ArDrive data transactions in last 24 hours
  weightedList = await get_24_hour_ardrive_transactions();

  // Only return the first 20
  return weightedList.slice(0, 99);
}

function dataCompare(a: any, b: any) {
  let comparison = 0;
  if (a.weight > b.weight) {
    comparison = 1;
  } else if (a.weight < b.weight) {
    comparison = -1;
  }
  return comparison * -1;
}

async function query_for_data_uploads(firstPage: number, cursor: string) {
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
    const response = await arweave.api
      .request()
      .post('https://arweave.net/graphql', query);
    const { data } = response.data;
    const { transactions } = data;
    return transactions;
  } catch (err) {
    console.log (err)
    console.log ("uh oh cant query")
  }
}

async function get_24_hour_ardrive_transactions() : Promise<AstatineItem[]> {
  let completed : Boolean = false;
  let weightedList : AstatineItem[] = [];
  let firstPage : number = 2147483647; // Max size of query for GQL
  let cursor : string = "";
  let timeStamp = new Date();
  let yesterday = new Date(timeStamp);
  yesterday.setDate(yesterday.getDate() - 1);

  while (!completed) {
    // Create the query to search for all ardrive transactions.
    let transactions = await query_for_data_uploads(firstPage, cursor);
    const { edges } = transactions;
    edges.forEach((edge: any) => {
      cursor = edge.cursor;
      const { node } = edge;
      const { data } = node;
      const { owner } = node;
      const { block } = node;
      if (block !== null) {
        let timeStamp = new Date(block.timestamp * 1000);
        // We only want results from last 24 hours, defined by milliseconds since epoch
        if (yesterday.getTime() <= timeStamp.getTime()) {
          // We only want data transactions
          if (data.size > 0) {
            // Does this wallet address exist in our array?
            let objIndex = weightedList.findIndex((obj => obj.address === owner.address));
            if (objIndex >= 0) {
            // If it exists, then we increment the existing data amount
              console.log ("Existing wallet found %s with %s data", weightedList[objIndex].address, weightedList[objIndex].weight);
              console.log("Adding ", data.size);
              weightedList[objIndex].weight += data.size;
            } 
            else {
              // Else we add a new user into our Astatine List
              console.log("Adding new wallet ", owner.address);
              let arDriveUser: AstatineItem = {
                address: owner.address,
                weight: data.size,
              };
              weightedList.push(arDriveUser);
            }
          }
        }
        else {
          // The blocks are too old, and we dont care about them
          completed = true;
        }
      }
    })
  }

  // lets sort the list based on data amount
  weightedList.sort(dataCompare);
  return weightedList;
}

const config: config = {
  emission_period: 2592000, // E
  time_interval: 86400, // I
  initial_emit_amount: 9679, // A
  decay_const: undefined,
  token_contract_id,
  token_allocations: token_allocation_function(),
};

export default config;
