import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
} from 'n8n-workflow';

// Import the router and operations description
import { router } from './actions/router';
import { description as operationsDescription } from './actions/operations';

// Define the node class
export class Crawl4aiBasicCrawler implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Crawl4AI: Basic Crawler',
		name: 'crawl4aiBasicCrawler',
		icon: 'file:crawl4ai.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Crawl websites using Crawl4AI',
		defaults: {
			name: 'Crawl4AI: Basic Crawler',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'crawl4aiApi',
				required: true,
			},
		],
		properties: [
			// Spread the imported operations description
			...operationsDescription,
		],
	};

	constructor(baseDescription: INodeTypeBaseDescription) {
		// Constructor remains simple
	}

	// Execution entry point, delegates to the router
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await router.call(this);
	}
}
