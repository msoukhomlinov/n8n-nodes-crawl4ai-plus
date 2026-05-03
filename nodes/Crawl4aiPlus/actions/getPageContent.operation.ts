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
import { parseDenylist } from '../../shared/urlSafety';
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
					{ name: 'Undetected (Anti-Bot)', value: 'undetected' },
					{ name: 'WebKit', value: 'webkit' },
				],
				default: 'chromium',
				description: 'Browser engine to use. Undetected uses deep browser patches to bypass Cloudflare and similar bot-protection. Firefox has a different TLS fingerprint to Chromium.',
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
				displayName: 'Delay Before Return (Ms)',
				name: 'delayBeforeReturnHtml',
				type: 'number',
				default: 0,
				description: 'Milliseconds to wait after page load before returning HTML. Use for pages where content loads after the initial render (e.g. AJAX-heavy sites).',
			},
			{
				displayName: 'Denylist Paths',
				name: 'denylistPaths',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				placeholder: '/path/to/block\n/another/path\n*/pattern/*',
				description: 'Paths or URL patterns to block before crawling — one per line. Supports * wildcards. Only applies when crawling multiple pages.',
				displayOptions: {
					show: {
						'/crawlScope': ['followLinks', 'fullSite'],
					},
				},
			},
			{
				displayName: 'Enable Stealth Mode',
				name: 'enableStealth',
				type: 'boolean',
				default: false,
				description: 'Whether to enable stealth mode (playwright-stealth) to avoid browser fingerprint detection',
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
				displayName: 'Headless Mode',
				name: 'headless',
				type: 'boolean',
				default: true,
				description: 'Whether to run the browser in headless mode. Set to false to run visibly — harder for Cloudflare to detect, but slower.',
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
				displayName: 'Magic Mode',
				name: 'magic',
				type: 'boolean',
				default: false,
				description: 'Whether to enable magic mode for automatic anti-bot handling (randomises interactions and timings)',
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
				displayName: 'Override Navigator',
				name: 'overrideNavigator',
				type: 'boolean',
				default: false,
				description: 'Whether to override navigator properties to hide browser automation signals',
			},
			{
				displayName: 'Page Timeout (Ms)',
				name: 'pageTimeout',
				type: 'number',
				default: 30000,
				description: 'Maximum time in milliseconds to wait for the page to load before failing',
			},
			{
				displayName: 'Simulate User',
				name: 'simulateUser',
				type: 'boolean',
				default: false,
				description: 'Whether to simulate realistic user behaviour (mouse movements, scrolling) to bypass bot detection',
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
			{
				displayName: 'Wait Until',
				name: 'waitUntil',
				type: 'options',
				options: [
					{ name: 'Commit (First Byte)', value: 'commit', description: 'Return as soon as the first byte of the response is received' },
					{ name: 'DOM Content Loaded', value: 'domcontentloaded', description: 'Wait for the DOMContentLoaded event' },
					{ name: 'Load', value: 'load', description: 'Wait for the load event (default browser behaviour)' },
					{ name: 'Network Idle', value: 'networkidle', description: 'Wait until no network requests for 500ms — best for AJAX/SPA sites' },
				],
				default: 'load',
				description: 'Navigation event to wait for before extracting content. Use Network Idle for JS-heavy or AJAX-rendered pages.',
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
			const rawUrl = this.getNodeParameter('url', i, '') as string;
			const crawlScope = this.getNodeParameter('crawlScope', i, 'singlePage') as string;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			const url = assertValidHttpUrl(rawUrl, this.getNode(), i);

			// Build config from simple defaults
			const config: FullCrawlConfig = {
				...getSimpleDefaults(),
				cacheMode: (options.cacheMode as FullCrawlConfig['cacheMode']) || 'ENABLED',
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

			if (options.headless === false) {
				config.headless = false;
			}

			if (options.enableStealth === true) config.enable_stealth = true;
			if (options.magic === true) config.magic = true;
			if (options.simulateUser === true) config.simulateUser = true;
			if (options.overrideNavigator === true) config.overrideNavigator = true;
			if (options.pageTimeout != null) config.pageTimeout = Number(options.pageTimeout);

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

			if (options.waitUntil) {
				config.waitUntil = String(options.waitUntil);
			}
			if (options.delayBeforeReturnHtml != null) {
				config.delayBeforeReturnHtml = Number(options.delayBeforeReturnHtml) / 1000;
			}

			if (options.avoidAds === true) {
				config.avoidAds = true;
			}
			if (options.avoidCss === true) {
				config.avoidCss = true;
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

			// Merge explicit denylist into exclude patterns for multi-page crawls
			const denylistPaths = parseDenylist(options.denylistPaths as string | undefined);
			const baseExclude = (options.excludePatterns as string | undefined) || '';
			const mergedExclude = denylistPaths.length > 0
				? [baseExclude, ...denylistPaths].filter((p) => p.trim().length > 0).join(',')
				: baseExclude || undefined;

			const results = await executeCrawl(
				client,
				url,
				crawlScope as 'singlePage' | 'followLinks' | 'fullSite',
				config,
				{
					maxPages: options.maxPages as number | undefined,
					excludePatterns: mergedExclude,
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
