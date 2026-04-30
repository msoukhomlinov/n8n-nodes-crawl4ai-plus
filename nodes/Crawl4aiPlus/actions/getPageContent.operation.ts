import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, FullCrawlConfig } from '../../shared/interfaces';
import {
	assertValidHttpUrl,
	getCrawl4aiClient,
	getSimpleDefaults,
	executeCrawl,
	resolveRequestHeaders,
} from '../helpers/utils';
import { createMarkdownGenerator } from '../../shared/utils';
import { formatPageContentResult } from '../helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com',
		description: 'The URL to crawl and extract content from',
		displayOptions: {
			show: {
				operation: ['getPageContent'],
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
		description: 'How extensively to crawl from the starting URL',
		displayOptions: {
			show: {
				operation: ['getPageContent'],
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
				operation: ['getPageContent'],
			},
		},
		options: [
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
				displayName: 'Content Quality',
				name: 'contentQuality',
				type: 'options',
				options: [
					{
						name: 'Clean',
						value: 'clean',
						description: 'Filtered markdown — removes navigation, ads, and boilerplate',
					},
					{
						name: 'Complete',
						value: 'complete',
						description: 'Full raw markdown — all page content preserved',
					},
				],
				default: 'clean',
				description: 'How much content filtering to apply',
			},
			{
				displayName: 'CSS Selector',
				name: 'cssSelector',
				type: 'string',
				default: '',
				placeholder: 'article.main-content',
				description: 'CSS selector to limit content extraction to a specific element',
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
				displayName: 'Include HTML',
				name: 'includeHtml',
				type: 'boolean',
				default: false,
				description: 'Whether to include raw HTML in the output',
			},
			{
				displayName: 'Include Links',
				name: 'includeLinks',
				type: 'boolean',
				default: true,
				description: 'Whether to include structured links in output',
			},
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				default: 10,
				description: 'Maximum number of pages to crawl (safety cap)',
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

	for (let i = 0; i < items.length; i++) {
		try {
			const url = this.getNodeParameter('url', i, '') as string;
			const crawlScope = this.getNodeParameter('crawlScope', i, 'singlePage') as string;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			assertValidHttpUrl(url, this.getNode(), i);

			// Build config from simple defaults
			const config: FullCrawlConfig = {
				...getSimpleDefaults(),
				cacheMode: (options.cacheMode as FullCrawlConfig['cacheMode']) || 'ENABLED',
			};

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

			if (options.cssSelector) {
				config.cssSelector = String(options.cssSelector);
			}

			if (options.waitFor) {
				config.waitFor = String(options.waitFor);
			}

			// Apply content quality filter
			const contentQuality = (options.contentQuality as string) || 'clean';
			if (contentQuality !== 'complete') {
				config.markdownGenerator = createMarkdownGenerator({
					filterType: 'pruning',
					threshold: 0.48,
					thresholdType: 'fixed',
				});
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

			// Guard against empty results (e.g., all pages deduplicated or filtered)
			if (!results || results.length === 0) {
				allResults.push({
					json: {
						success: false,
						error: 'No results returned - all pages may have been deduplicated or filtered',
						url,
						crawlScope,
					} as unknown as IDataObject,
					pairedItem: { item: i },
				});
				continue;
			}

			const formatted = formatPageContentResult(results, {
				includeHtml: options.includeHtml as boolean,
				includeLinks: options.includeLinks !== false,
				contentQuality: contentQuality,
			});

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
