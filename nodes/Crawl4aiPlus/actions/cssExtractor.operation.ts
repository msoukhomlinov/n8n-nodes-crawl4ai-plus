import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, CssSelectorSchema, FullCrawlConfig } from '../../shared/interfaces';
import {
	assertValidHttpUrl,
	getCrawl4aiClient,
	getSimpleDefaults,
	createCssSelectorExtractionStrategy,
	resolveRequestHeaders,
} from '../helpers/utils';
import { formatCssExtractorResult } from '../helpers/formatters';
import { parseExtractedJson } from '../../shared/formatters';
import { cleanExtractedData } from '../../shared/utils';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com',
		description: 'The URL to extract content from',
		displayOptions: {
			show: {
				operation: ['cssExtractor'],
			},
		},
	},
	{
		displayName: 'Base Selector',
		name: 'baseSelector',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'div.product-item',
		description: 'CSS selector for the repeating element (e.g., product items, article cards)',
		displayOptions: {
			show: {
				operation: ['cssExtractor'],
			},
		},
	},
	{
		displayName: 'Fields',
		name: 'fields',
		placeholder: 'Add Field',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		default: {},
		required: true,
		displayOptions: {
			show: {
				operation: ['cssExtractor'],
			},
		},
		options: [
			{
				name: 'fieldsValues',
				displayName: 'Fields',
				values: [
					{
						displayName: 'Field Name',
						name: 'name',
						type: 'string',
						required: true,
						default: '',
						placeholder: 'title',
						description: 'Name of the field to extract',
					},
					{
						displayName: 'CSS Selector',
						name: 'selector',
						type: 'string',
						required: true,
						default: '',
						placeholder: 'h3.title',
						description: 'CSS selector relative to the base selector',
					},
					{
						displayName: 'Field Type',
						name: 'fieldType',
						type: 'options',
						options: [
							{
								name: 'Text',
								value: 'text',
								description: 'Extract text content',
							},
							{
								name: 'HTML',
								value: 'html',
								description: 'Extract HTML content',
							},
							{
								name: 'Attribute',
								value: 'attribute',
								description: 'Extract an attribute value',
							},
						],
						default: 'text',
						description: 'Type of data to extract',
					},
					{
						displayName: 'Attribute Name',
						name: 'attribute',
						type: 'string',
						displayOptions: {
							show: {
								fieldType: ['attribute'],
							},
						},
						default: 'href',
						placeholder: 'href',
						description: 'Name of the attribute to extract',
					},
				],
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['cssExtractor'],
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
				displayName: 'Clean Text',
				name: 'cleanText',
				type: 'boolean',
				default: true,
				description:
					'Whether to clean and normalize extracted text (remove extra spaces, newlines)',
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
				displayName: 'Enable Stealth Mode',
				name: 'enableStealth',
				type: 'boolean',
				default: false,
				description: 'Whether to enable stealth mode (playwright-stealth) to avoid browser fingerprint detection',
			},
			{
				displayName: 'Headless Mode',
				name: 'headless',
				type: 'boolean',
				default: true,
				description: 'Whether to run the browser in headless mode. Set to false to run visibly — harder for Cloudflare to detect, but slower.',
			},
			{
				displayName: 'Include Original Text',
				name: 'includeOriginalText',
				type: 'boolean',
				default: false,
				description: 'Whether to include the original webpage text in output',
			},
			{
				displayName: 'Magic Mode',
				name: 'magic',
				type: 'boolean',
				default: false,
				description: 'Whether to enable magic mode for automatic anti-bot handling (randomises interactions and timings)',
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
			const baseSelector = this.getNodeParameter('baseSelector', i, '') as string;
			const fieldsValues = this.getNodeParameter('fields.fieldsValues', i, []) as IDataObject[];
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			const url = assertValidHttpUrl(rawUrl, this.getNode(), i);
			if (!baseSelector) {
				throw new NodeOperationError(this.getNode(), 'Base selector cannot be empty.', {
					itemIndex: i,
				});
			}
			if (!fieldsValues || fieldsValues.length === 0) {
				throw new NodeOperationError(this.getNode(), 'At least one field must be defined.', {
					itemIndex: i,
				});
			}

			// Build CSS extraction schema
			const schema: CssSelectorSchema = {
				name: 'extracted_items',
				baseSelector,
				fields: fieldsValues.map((field) => ({
					name: field.name as string,
					selector: field.selector as string,
					type: field.fieldType as 'text' | 'attribute' | 'html',
					...(field.fieldType === 'attribute' ? { attribute: field.attribute as string } : {}),
				})),
			};

			// Create extraction strategy
			const extractionStrategy = createCssSelectorExtractionStrategy(schema);

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
				config.chrome_channel = 'patchright';
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
			if (options.stealthMode === true && (config.pageTimeout ?? 0) < 110000) config.pageTimeout = 110000;

			const resolvedHeaders = resolveRequestHeaders(
				options.browserProfile as string | undefined,
				options.browserProfile === 'custom' ? options.customHeaders as string | undefined : undefined,
			);
			if (resolvedHeaders) config.headers = resolvedHeaders;

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

			// Execute crawl
			const result = await client.crawlUrl(url, config);

			// Parse extracted JSON
			const extractedData = parseExtractedJson(result);
			let itemsExtracted: IDataObject[] = [];

			if (extractedData) {
				if (Array.isArray(extractedData)) {
					itemsExtracted = extractedData as IDataObject[];
				} else if (typeof extractedData === 'object') {
					itemsExtracted = [extractedData];
				}
			}

			// Apply text cleaning if requested
			const shouldClean = options.cleanText !== false;
			if (shouldClean && itemsExtracted.length > 0) {
				itemsExtracted = cleanExtractedData(itemsExtracted) as IDataObject[];
			}

			const formatted = formatCssExtractorResult(result, itemsExtracted);

			// Include original page text if requested
			if (options.includeOriginalText) {
				const markdown = result.markdown;
				if (typeof markdown === 'object' && markdown !== null) {
					formatted.originalText = markdown.raw_markdown || markdown.fit_markdown || '';
				} else if (typeof markdown === 'string') {
					formatted.originalText = markdown;
				} else {
					formatted.originalText = '';
				}
			}

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
