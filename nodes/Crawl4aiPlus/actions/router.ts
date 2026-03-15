import type {
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions } from '../../shared/interfaces';
import { operations } from './operations';

export async function router(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	let returnData: INodeExecutionData[] = [];
	const node = this.getNode();

	const operation = this.getNodeParameter('operation', 0) as string;
	const nodeOptions = {} as Crawl4aiNodeOptions;
	const continueOnFail = this.continueOnFail();

	const executeFunction = operations[operation];

	if (!executeFunction) {
		if (continueOnFail) {
			return this.prepareOutputData(items.map((item, index) => ({
				json: item.json,
				error: new NodeOperationError(node, `The operation "${operation}" is not supported!`, {
					itemIndex: index,
				}),
				pairedItem: { item: index },
			})));
		}
		throw new NodeOperationError(node, `The operation "${operation}" is not supported!`, {
			itemIndex: 0,
		});
	}

	returnData = await executeFunction.call(this, items, nodeOptions);

	return this.prepareOutputData(returnData);
}
