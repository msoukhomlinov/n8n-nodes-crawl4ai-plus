import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

// Import the router and operations description
import { router } from './actions/router';
import { description as operationsDescription } from './actions/operations';

// Define the node class
export class Crawl4aiPlusBasicCrawler implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Crawl4AI Plus: Basic Crawler',
		name: 'crawl4aiPlusBasicCrawler',
		icon: 'file:crawl4aiplus.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Crawl websites using Crawl4AI (Enhanced Edition)',
		defaults: {
			name: 'Crawl4AI Plus: Basic Crawler',
		},
		inputs: ['main'],
		outputs: ['main'],
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await router.call(this);
	}
}
