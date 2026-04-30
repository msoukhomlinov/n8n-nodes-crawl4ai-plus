import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
} from 'n8n-workflow';

import { getLlmModels } from '../shared/loadOptions';
import { router } from './actions/router';
import { description as operationsDescription } from './actions/operations';

export class Crawl4aiPlusAdvanced implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Crawl4AI Plus Advanced',
		name: 'crawl4aiPlusAdvanced',
		icon: 'file:crawl4aiplus.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Advanced web crawling and extraction with full Crawl4AI API control',
		defaults: {
			name: 'Crawl4AI Plus Advanced',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'crawl4aiPlusApi',
				required: true,
			},
		],
		properties: [
			...operationsDescription,
		],
	};

	methods = {
		loadOptions: {
			getLlmModels,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await router.call(this);
	}
}
