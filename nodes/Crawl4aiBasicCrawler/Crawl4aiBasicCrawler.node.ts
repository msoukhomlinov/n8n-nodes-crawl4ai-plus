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
		// @ts-ignore - n8n 使用的類型定義可能未包含此屬性
		usableAsTool: true,
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

	// Execution entry point, delegates to the router
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await router.call(this);
	}
}
