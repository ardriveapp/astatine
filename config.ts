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

export const token_allocation_function = async() : Promise<AstatineItem[]> => {
  let weightedList : AstatineItem[];

  // Get all ArDrive data transactions in last 24 hours
  weightedList = await get_24_hour_ardrive_transactions();

  return weightedList;
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

// Creates a GraphQL Query to search for all ArDrive Data transactions and requests it from the primary Arweave gateway
async function queryForDataUploads(minBlock: number, firstPage: number, cursor: string) {
  try {
  const query = {
    query: `query {
    transactions(
      tags: { name: "App-Name", values: ["ArDrive-Desktop", "ArDrive-Web"] }
      block: {min: ${minBlock}}
      first: ${firstPage}
      after: "${cursor}"
    ) {
      pageInfo {
        hasNextPage
      }
      edges {
        cursor
        node {
          id
          owner {
              address
          }
          fee {
              ar
          }
          tags {
              name
              value
          }
          data {
            size
          }
          block {
            height
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

// Gets the last 24 hours worth of transactions
// Only includes users who have uploaded the minimum amount of data, 50MB
async function get_24_hour_ardrive_transactions() : Promise<AstatineItem[]> {

  let completed : Boolean = false;
  let weightedList : AstatineItem[] = [];
  let trimmedWeightedList : AstatineItem[] = [];
  let firstPage : number = 100; // Max size of query for GQL
  let cursor : string = "";
  let timeStamp = new Date();
  let yesterday = new Date(timeStamp);
  yesterday.setDate(yesterday.getDate() - 1);

  while (!completed) {
    // Create the query to search for all ardrive transactions.
    let transactions = await queryForDataUploads(0, firstPage, cursor);
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
            if (+data.size > 0) {
              // Does this wallet address exist in our array?
              let objIndex = weightedList.findIndex((obj => obj.address === owner.address));
              if (objIndex >= 0) {
              // If it exists, then we increment the existing data amount
                // console.log ("Existing wallet found %s with %s data", weightedList[objIndex].address, weightedList[objIndex].weight);
                weightedList[objIndex].weight += +data.size;
              } 
              else {
                // Else we add a new user into our Astatine List
                // console.log("Adding new wallet ", owner.address);
                let arDriveUser: AstatineItem = {
                  address: owner.address,
                  weight: +data.size,
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

  console.log (weightedList)
  // Trim the list of any users who have not uploaded the minimum
  let minUploadAmount = 1048576 * 1 // 1 MB
  weightedList.forEach((item: AstatineItem) => {
    if (item.weight >= minUploadAmount) {
      trimmedWeightedList.push(item);
    }
  })
  
  return trimmedWeightedList;
}

const config: config = {
  emission_period: 31536000, // E
  time_interval: 86400, // I
  initial_emit_amount: 700  , // A
  decay_const: 0,
  token_contract_id,
  token_allocations: token_allocation_function(),
};

export default config;
