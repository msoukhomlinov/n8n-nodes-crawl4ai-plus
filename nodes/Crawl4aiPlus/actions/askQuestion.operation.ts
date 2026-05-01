import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiApiCredentials, Crawl4aiNodeOptions, FullCrawlConfig } from '../../shared/interfaces';
import { checkLlmExtractionError } from '../../shared/formatters';
import {
	assertValidHttpUrl,
	getCrawl4aiClient,
	getSimpleDefaults,
	executeCrawl,
	validateLlmCredentials,
	buildLlmConfig,
	createLlmExtractionStrategy,
	resolveRequestHeaders,
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
				description: 'Follow and crawl same-domain links (depth 1); external links are excluded',
			},
			{
				name: 'Full Site',
				value: 'fullSite',
				description: 'Crawl the entire same-domain site recursively (depth 3); external links are excluded',
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
				displayName: 'Avoid Ads',
				name: 'avoidAds',
				type: 'boolean',
				default: false,
				description: 'Whether to block ad-related network requests during crawl (reduces noise, speeds up page load)',
			},
			{
				displayName: 'Avoid CSS',
				name: 'avoidCss',
				type: 'boolean',
				default: false,
				description: 'Whether to block CSS resource requests during crawl (faster for text-only extraction)',
			},
			{
				displayName: 'Browser Profile',
				name: 'browserProfile',
				type: 'options',
				options: [
					{ name: 'Chrome (Android)', value: 'chrome_android' },
					{ name: 'Chrome (Linux)', value: 'chrome_linux' },
					{ name: 'Chrome (macOS)', value: 'chrome_macos' },
					{ name: 'Chrome (Windows)', value: 'chrome_windows' },
					{ name: 'Custom', value: 'custom' },
					{ name: 'Edge (Windows)', value: 'edge_windows' },
					{ name: 'Firefox (macOS)', value: 'firefox_macos' },
					{ name: 'Firefox (Windows)', value: 'firefox_windows' },
					{ name: 'Googlebot', value: 'googlebot' },
					{ name: 'None', value: 'none' },
					{ name: 'Safari (iOS)', value: 'safari_ios' },
					{ name: 'Safari (macOS)', value: 'safari_macos' },
				],
				default: 'none',
				description: 'Preset browser headers to send with the request. Helps bypass server-side bot detection. Select Custom to enter your own headers.',
			},
			{
				displayName: 'Browser Type',
				name: 'browserType',
				type: 'options',
				options: [
					{ name: 'Chromium (Default)', value: 'chromium' },
					{ name: 'Firefox', value: 'firefox' },
					{ name: 'WebKit', value: 'webkit' },
				],
				default: 'chromium',
				description: 'Browser engine to use. Firefox has a different TLS fingerprint to Chromium and can bypass bot-detection systems that block headless Chrome.',
			},
			{
				displayName: 'Bypass Bot Detection',
				name: 'stealthMode',
				type: 'boolean',
				default: false,
				description: 'Whether to enable stealth and magic mode to help bypass bot detection (use if the site blocks automated crawlers)',
			},
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
				displayName: 'Custom Headers',
				name: 'customHeaders',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				placeholder: 'User-Agent: Mozilla/5.0 ...\nAccept-Language: en-AU,en;q=0.9',
				description: 'HTTP headers in Key: Value format, one per line',
				displayOptions: {
					show: {
						browserProfile: ['custom'],
					},
				},
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
				displayName: 'Model Name or ID',
				name: 'llmModel',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getLlmModels',
				},
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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

			assertValidHttpUrl(url, this.getNode(), i);
			if (!question) {
				throw new NodeOperationError(this.getNode(), 'Question cannot be empty.', {
					itemIndex: i,
				});
			}

			// Build LLM config and extraction strategy
			const modelOverride = options.llmModel as string | undefined;
			const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride || undefined);
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

			if (options.browserType) {
				config.browserType = String(options.browserType);
			}

			if (options.stealthMode === true) {
				config.enable_stealth = true;
				config.magic = true;
				config.simulateUser = true;
				config.overrideNavigator = true;
			}

			const resolvedHeaders = resolveRequestHeaders(
				options.browserProfile as string | undefined,
				options.browserProfile === 'custom' ? options.customHeaders as string | undefined : undefined,
			);
			if (resolvedHeaders) config.headers = resolvedHeaders;

			if (options.waitFor) {
				config.waitFor = String(options.waitFor);
			}

			if (options.avoidAds === true) {
				config.avoidAds = true;
			}
			if (options.avoidCss === true) {
				config.avoidCss = true;
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

			// Only fail when every page with extracted content has LLM errors (no usable data at all)
			const llmErrors = pagesWithContent
				.map((r) => checkLlmExtractionError(r))
				.filter((e): e is string => e !== null);
			if (llmErrors.length > 0 && llmErrors.length === pagesWithContent.length) {
				throw new NodeOperationError(this.getNode(), `LLM extraction failed: ${llmErrors[0]}`, { itemIndex: i });
			}

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
