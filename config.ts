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

// Set the ardrive primary and backup gateways
const primaryGraphQLUrl = 'https://arweave.net/graphql';
const backupGraphQLUrl = 'https://arweave.dev/graphql';

export interface AstatineItem {
  address: string,
  weight: number,
}

export interface AstatineDailyTransactions {
  weightedList: AstatineItem[];
  totalDataSize: number;
}

export const token_allocation_function = async() : Promise<AstatineDailyTransactions> => {
  // Get all ArDrive data transactions and total data size uploaded in last 24 hours
  const dailyTransactions = await get_24_hour_ardrive_transactions();
  return dailyTransactions;
}

// Format byte size to something nicer.  This is minified...
export function formatBytes(bytes: number): string {
	const marker = 1024; // Change to 1000 if required
	const decimal = 3; // Change as required
	const kiloBytes = marker; // One Kilobyte is 1024 bytes
	const megaBytes = marker * marker; // One MB is 1024 KB
	const gigaBytes = marker * marker * marker; // One GB is 1024 MB
	// const teraBytes = marker * marker * marker * marker; // One TB is 1024 GB

	// return bytes if less than a KB
	if (bytes < kiloBytes) return `${bytes} Bytes`;
	// return KB if less than a MB
	if (bytes < megaBytes) return `${(bytes / kiloBytes).toFixed(decimal)} KB`;
	// return MB if less than a GB
	if (bytes < gigaBytes) return `${(bytes / megaBytes).toFixed(decimal)} MB`;
	// return GB if less than a TB
	return `${(bytes / gigaBytes).toFixed(decimal)} GB`;
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
async function queryForDataUploads(minBlock: number, firstPage: number, cursor: string, graphQLUrl: string) {
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
  console.log ("Error querying for data uploads.")
  if (graphQLUrl === primaryGraphQLUrl) {
    console.log ("Trying the backup graphQL url")
    return await queryForDataUploads(minBlock, firstPage, cursor, backupGraphQLUrl);
  }
}
}

// Gets the last 24 hours worth of transactions
// Only includes users who have uploaded the minimum amount of data, 50MB
async function get_24_hour_ardrive_transactions() : Promise<AstatineDailyTransactions> {

  let completed : Boolean = false;
  let weightedList : AstatineItem[] = [];
  let trimmedWeightedList : AstatineItem[] = [];
  let firstPage : number = 100; // Max size of query for GQL
  let cursor : string = "";
  let timeStamp = new Date();

  // TEMPORARILY USED TO RUN IN THE PAST
  // timeStamp.setDate(timeStamp.getDate() - 1)
  
  // This will force the job to run at 16:00 UTC (or 12:00pm EST)
  timeStamp.setMinutes(0);
  timeStamp.setHours(16);
  let yesterday = new Date(timeStamp);
  let totalDataSize = 0;
  yesterday.setDate(timeStamp.getDate() - 1);

  while (!completed) {
    // Create the query to search for all ardrive transactions.
    let transactions = await queryForDataUploads(0, firstPage, cursor, primaryGraphQLUrl);
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
              totalDataSize += +data.size;
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

  // Trim the list of any users who have not uploaded the minimum
  let minUploadAmount = 1048576 * 50 // 50 MB
  weightedList.forEach((item: AstatineItem) => {
    if (item.weight >= minUploadAmount) {
      trimmedWeightedList.push(item);
    }
  })
  
  const dailyTransactions : AstatineDailyTransactions = {
    weightedList,
    totalDataSize,
  };

  return dailyTransactions;
}

const config: config = {
  emission_period: 31536000, // E
  time_interval: 86400, // I
  initial_emit_amount: 800  , // A
  decay_const: 0,
  token_contract_id,
  token_allocations: token_allocation_function(),
};

export default config;
