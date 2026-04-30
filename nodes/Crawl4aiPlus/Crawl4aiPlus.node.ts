import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
} from 'n8n-workflow';

import { getLlmModels } from '../shared/loadOptions';
import { router } from './actions/router';
import { operationDescriptions } from './actions/operations';

export class Crawl4aiPlus implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Crawl4AI Plus',
		name: 'crawl4aiPlus',
		icon: 'file:crawl4aiplus.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Crawl web pages, extract data, and ask questions using Crawl4AI',
		defaults: {
			name: 'Crawl4AI Plus',
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
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Get Page Content',
						value: 'getPageContent',
						description: 'Crawl a page and get clean markdown content',
						action: 'Get page content',
					},
					{
						name: 'Ask Question',
						value: 'askQuestion',
						description: 'Ask a question about a webpage and get a structured answer (requires LLM)',
						action: 'Ask a question about a page',
					},
					{
						name: 'Extract Data',
						value: 'extractData',
						description: 'Extract emails, financial data, or custom structured data from a webpage',
						action: 'Extract structured data',
					},
					{
						name: 'Extract with CSS Selectors',
						value: 'cssExtractor',
						description: 'Extract data using CSS selectors (no LLM required)',
						action: 'Extract with CSS selectors',
					},
				],
				default: 'getPageContent',
			},
			...operationDescriptions,
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
