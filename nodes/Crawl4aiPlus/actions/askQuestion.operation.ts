import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiApiCredentials, Crawl4aiNodeOptions, FullCrawlConfig } from '../../shared/interfaces';
import {
	getCrawl4aiClient,
	getSimpleDefaults,
	executeCrawl,
	validateLlmCredentials,
	buildLlmConfig,
	createLlmExtractionStrategy,
} from '../helpers/utils';
import { formatQuestionResult } from '../helpers/formatters';

// Fixed schema for question-answering
const QUESTION_SCHEMA = {
	type: 'object',
	properties: {
		answer: { type: 'string' },
		details: { type: 'array', items: { type: 'string' } },
		source_quotes: { type: 'array', items: { type: 'string' } },
	},
	required: ['answer', 'details', 'source_quotes'],
};

const SYSTEM_PROMPT = `Answer the user's question based on the page content. Return a JSON object with exactly these keys:
- "answer": A concise answer to the question (string)
- "details": An array of supporting details or facts (string[])
- "source_quotes": An array of direct quotes from the page that support the answer (string[])

If the page doesn't contain enough information to answer, set "answer" to "I couldn't find enough information on the page to answer this question." and leave details and source_quotes as empty arrays.`;

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com',
		description: 'The URL to ask a question about',
		displayOptions: {
			show: {
				operation: ['askQuestion'],
			},
		},
	},
	{
		displayName: 'Question',
		name: 'question',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		placeholder: 'What services do they offer?',
		description: 'The question to answer based on the page content',
		displayOptions: {
			show: {
				operation: ['askQuestion'],
			},
		},
	},
	{
		displayName: 'Crawl Scope',
		name: 'crawlScope',
		type: 'options',
		options: [
			{
				name: 'Single Page',
				value: 'singlePage',
				description: 'Crawl only the specified URL',
			},
			{
				name: 'Follow Links',
				value: 'followLinks',
				description: 'Follow and crawl discovered links (depth 1)',
			},
			{
				name: 'Full Site',
				value: 'fullSite',
				description: 'Crawl the entire site recursively (depth 3)',
			},
		],
		default: 'singlePage',
		description: 'How many pages to search for the answer',
		displayOptions: {
			show: {
				operation: ['askQuestion'],
			},
		},
	},
	{
		displayName:
			'This operation requires LLM credentials to be configured in the Crawl4AI Plus credentials.',
		name: 'llmNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['askQuestion'],
			},
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['askQuestion'],
			},
		},
		options: [
			{
				displayName: 'Cache Mode',
				name: 'cacheMode',
				type: 'options',
				options: [
					{ name: 'Bypass (Skip Cache)', value: 'BYPASS' },
					{ name: 'Disabled (No Cache)', value: 'DISABLED' },
					{ name: 'Enabled (Read/Write)', value: 'ENABLED' },
					{ name: 'Read Only', value: 'READ_ONLY' },
					{ name: 'Write Only', value: 'WRITE_ONLY' },
				],
				default: 'ENABLED',
				description: 'How to use the cache when crawling',
			},
			{
				displayName: 'Exclude URL Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: '*/admin/*,*/login/*',
				description: 'Comma-separated URL patterns to exclude from crawling (only for multi-page)',
				displayOptions: {
					show: {
						'/crawlScope': ['followLinks', 'fullSite'],
					},
				},
			},
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				default: 10,
				description: 'Maximum number of pages to crawl',
				displayOptions: {
					show: {
						'/crawlScope': ['followLinks', 'fullSite'],
					},
				},
			},
			{
				displayName: 'Wait For',
				name: 'waitFor',
				type: 'string',
				default: '',
				placeholder: '.content-loaded or js:() => document.readyState === "complete"',
				description:
					'CSS selector or JS expression (prefixed with js:) to wait for before extracting content',
			},
		],
	},
];

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];
	const client = await getCrawl4aiClient(this);
	const credentials = (await this.getCredentials('crawl4aiPlusApi')) as unknown as Crawl4aiApiCredentials;
	try {
		validateLlmCredentials(credentials, 'Ask Question');
	} catch (err) {
		throw new NodeOperationError(this.getNode(), (err as Error).message);
	}

	for (let i = 0; i < items.length; i++) {
		try {
			const url = this.getNodeParameter('url', i, '') as string;
			const question = this.getNodeParameter('question', i, '') as string;
			const crawlScope = this.getNodeParameter('crawlScope', i, 'singlePage') as string;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}
			if (!question) {
				throw new NodeOperationError(this.getNode(), 'Question cannot be empty.', {
					itemIndex: i,
				});
			}

			// Build LLM config and extraction strategy
			const { provider, apiKey, baseUrl } = buildLlmConfig(credentials);
			const instruction = `${SYSTEM_PROMPT}\n\nQuestion: ${question}`;

			const extractionStrategy = createLlmExtractionStrategy(
				QUESTION_SCHEMA,
				instruction,
				provider,
				apiKey,
				baseUrl,
			);

			// Build config
			const config: FullCrawlConfig = {
				...getSimpleDefaults(),
				cacheMode: (options.cacheMode as FullCrawlConfig['cacheMode']) || 'ENABLED',
				extractionStrategy,
			};

			if (options.waitFor) {
				config.waitFor = String(options.waitFor);
			}

			const results = await executeCrawl(
				client,
				url,
				crawlScope as 'singlePage' | 'followLinks' | 'fullSite',
				config,
				{
					maxPages: options.maxPages as number | undefined,
					excludePatterns: options.excludePatterns as string | undefined,
				},
			);

			// Collect all pages with extracted content
			const pagesWithContent = results.filter((r) => r.extracted_content);

			if (results.length === 0) {
				allResults.push({
					json: { success: false, error: 'No results returned from crawl', url, question },
					pairedItem: { item: i },
				});
				continue;
			}

			const formatted = formatQuestionResult(
				pagesWithContent.length > 0 ? pagesWithContent : results,
				question,
				results.length,
			);

			allResults.push({
				json: formatted,
				pairedItem: { item: i },
			});
		} catch (error) {
			if (this.continueOnFail()) {
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(this.getNode(), (error as Error).message, {
						itemIndex: i,
					}),
					pairedItem: { item: i },
				});
				continue;
			}
			throw error;
		}
	}

	return allResults;
}
