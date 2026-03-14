import type {
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions } from '../helpers/interfaces';
import { operations } from './operations';

export async function router(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	let returnData: INodeExecutionData[] = [];
	const node = this.getNode();

	const operation = this.getNodeParameter('operation', 0) as string;
	const nodeOptions = this.getNodeParameter('options', 0, {}) as Crawl4aiNodeOptions;
	const continueOnFail = this.continueOnFail();

	try {
		const executeFunction = operations[operation];

		if (!executeFunction) {
			throw new NodeOperationError(node, `The operation "${operation}" is not supported!`, {
				itemIndex: 0,
			});
		}

		returnData = await executeFunction.call(this, items, nodeOptions);
	} catch (error) {
		if (continueOnFail) {
			returnData = items.map((item, index) => ({
				json: item.json,
				error: new NodeOperationError(node, (error as Error).message, {
					itemIndex: (error as any).itemIndex ?? index,
				}),
				pairedItem: { item: index },
			}));
		} else {
			throw error;
		}
	}

	return this.prepareOutputData(returnData);
}
