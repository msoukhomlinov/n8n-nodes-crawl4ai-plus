import type {
  IExecuteFunctions,
  INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// Import interfaces and helpers
import type { Crawl4aiNodeOptions } from '../helpers/interfaces';

// Import the operations object which contains all execute functions
import { operations } from './operations';

export async function router(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const items = this.getInputData();
  let returnData: INodeExecutionData[] = [];
  const node = this.getNode();

  // Get operation and node options
  const operation = this.getNodeParameter('operation', 0) as string;
  // Cast to Crawl4aiNodeOptions which includes specific options
  const nodeOptions = this.getNodeParameter('options', 0, {}) as Crawl4aiNodeOptions;
  // Get continueOnFail specifically for error handling below
  const continueOnFail = this.continueOnFail();

  try {
    // ---------------------------------------------------------------------
    // Dispatch the task to the corresponding operation executor
    // ---------------------------------------------------------------------
    const executeFunction = operations[operation]; // Get the execute function from the imported object

    if (!executeFunction) {
      throw new NodeOperationError(node, `The operation "${operation}" is not supported!`, { itemIndex: 0 });
    }

    // Execute the operation's logic, passing items and nodeOptions
    returnData = await executeFunction.call(this, items, nodeOptions);
    // ---------------------------------------------------------------------

  } catch (error) {
    if (continueOnFail) {
      // Prepare error output for each item if continueOnFail is true
      returnData = items.map((item, index) => ({
        json: item.json, // Keep original json data if possible
        error: new NodeOperationError(node, (error as Error).message, { itemIndex: (error as any).itemIndex ?? index }),
        pairedItem: { item: index }, // Ensure pairing
      }));
    } else {
      // If not continuing on fail, throw the error
      throw error;
    }
  }

  // Return the final data
  return this.prepareOutputData(returnData);
}
