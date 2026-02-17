import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// Import helpers and types
import type { Crawl4aiNodeOptions } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createCrawlerRunConfig,
	isValidUrl
} from '../helpers/utils';
import { formatExtractionResult } from '../../Crawl4aiPlusBasicCrawler/helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/api/data.json',
		description: 'The URL of the JSON data to extract',
		displayOptions: {
			show: {
				operation: ['jsonExtractor'],
			},
		},
	},
	{
		displayName: 'JSON Path',
		name: 'jsonPath',
		type: 'string',
		default: '',
		placeholder: 'data.items',
		description: 'Path to the JSON data to extract (leave empty for entire JSON response)',
		displayOptions: {
			show: {
				operation: ['jsonExtractor'],
			},
		},
	},
	{
		displayName: 'Source Type',
		name: 'sourceType',
		type: 'options',
		options: [
			{
				name: 'Direct JSON URL',
				value: 'direct',
				description: 'URL returns JSON directly',
			},
			{
				name: 'JSON in Script Tag',
				value: 'script',
				description: 'JSON is embedded in a &lt;script&gt; tag',
			},
			{
				name: 'JSON-LD',
				value: 'jsonld',
				description: 'JSON-LD structured data',
			},
		],
		default: 'direct',
		description: 'Where to find the JSON data on the page',
		displayOptions: {
			show: {
				operation: ['jsonExtractor'],
			},
		},
	},
	{
		displayName: 'Extraction Schema Type',
		name: 'extractionType',
		type: 'options',
		options: [
			{
				name: 'CSS Schema',
				value: 'css',
				description: 'Use JsonCssExtractionStrategy (CSS selectors)',
			},
			{
				name: 'XPath Schema',
				value: 'xpath',
				description: 'Use JsonXPathExtractionStrategy (XPath expressions)',
			},
		],
		default: 'css',
		description: 'Schema extraction engine to use when source type is Script Tag or JSON-LD',
		displayOptions: {
			show: {
				operation: ['jsonExtractor'],
				sourceType: ['script', 'jsonld'],
			},
		},
	},
	{
		displayName: 'Script Selector',
		name: 'scriptSelector',
		type: 'string',
		default: '',
		placeholder: 'script#__NEXT_DATA__',
		description: 'CSS selector (or XPath expression when using XPath Schema) for the script tag containing JSON data',
		displayOptions: {
			show: {
				operation: ['jsonExtractor'],
				sourceType: ['script'],
			},
		},
	},
	{
		displayName: 'Browser Options',
		name: 'browserOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['jsonExtractor'],
			},
		},
		options: [
			{
				displayName: 'Browser Type',
				name: 'browserType',
				type: 'options',
				options: [
					{
						name: 'Chromium',
						value: 'chromium',
						description: 'Use Chromium browser (default, most compatible)',
					},
					{
						name: 'Firefox',
						value: 'firefox',
						description: 'Use Firefox browser',
					},
					{
						name: 'Webkit',
						value: 'webkit',
						description: 'Use Webkit browser (Safari engine)',
					},
				],
				default: 'chromium',
				description: 'Which browser engine to use for crawling. Default: Chromium (if not specified).',
			},
			{
				displayName: 'Enable JavaScript',
				name: 'javaScriptEnabled',
				type: 'boolean',
				default: true,
				description: 'Whether to enable JavaScript execution',
			},
			{
				displayName: 'Enable Stealth Mode',
				name: 'enableStealth',
				type: 'boolean',
				default: false,
				description: 'Whether to enable stealth mode to bypass basic bot detection (hides webdriver properties and modifies browser fingerprints)',
			},
			{
				displayName: 'Extra Browser Arguments',
				name: 'extraArgs',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'Additional command-line arguments to pass to the browser (advanced users only)',
				options: [
					{
						name: 'args',
						displayName: 'Arguments',
						values: [
							{
								displayName: 'Argument',
								name: 'value',
								type: 'string',
								default: '',
								placeholder: '--disable-blink-features=AutomationControlled',
								description: 'Browser command-line argument (e.g., --disable-blink-features=AutomationControlled)',
							},
						],
					},
				],
			},
			{
				displayName: 'Headless Mode',
				name: 'headless',
				type: 'boolean',
				default: true,
				description: 'Whether to run browser in headless mode',
			},
			{
				displayName: 'Init Scripts',
				name: 'initScripts',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: {},
				description: 'JavaScript snippets injected before page load for stealth or setup',
				options: [
					{
						name: 'scripts',
						displayName: 'Scripts',
						values: [
							{
								displayName: 'Script',
								name: 'value',
								type: 'string',
								typeOptions: { rows: 3 },
								default: '',
								placeholder: 'Object.defineProperty(navigator, "webdriver", {get: () => undefined});',
								description: 'JavaScript to inject before page load',
							},
						],
					},
				],
			},
			{
				displayName: 'JavaScript Code',
				name: 'jsCode',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder: 'window.scrollTo(0, document.body.scrollHeight);',
				description: 'JavaScript code to execute before extraction',
			},
			{
				displayName: 'Timeout (MS)',
				name: 'timeout',
				type: 'number',
				default: 30000,
				description: 'Maximum time to wait for the browser to load the page',
			},
		],
	},
	{
		displayName: 'Session & Authentication',
		name: 'sessionOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['jsonExtractor'],
			},
		},
		options: [
			{
				displayName: 'Cookies',
				name: 'cookies',
				type: 'fixedCollection',
				default: { cookieValues: [] },
				typeOptions: { multipleValues: true },
				options: [
					{
						name: 'cookieValues',
						displayName: 'Cookie',
						values: [
							{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Cookie name' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '', description: 'Cookie value' },
							{ displayName: 'Domain', name: 'domain', type: 'string', default: '', description: 'Cookie domain' },
						],
					},
				],
				description: 'Cookies to inject for authentication',
			},
			{
				displayName: 'Storage State (JSON)',
				name: 'storageState',
				type: 'json',
				default: '',
				placeholder: '{"cookies": [...], "origins": [...]}',
				description: 'Browser storage state as JSON',
			},
			{
				displayName: 'Use Managed Browser',
				name: 'useManagedBrowser',
				type: 'boolean',
				default: false,
				description: 'Whether to connect to an existing managed browser instance',
			},
			{
				displayName: 'Use Persistent Context',
				name: 'usePersistentContext',
				type: 'boolean',
				default: false,
				description: 'Whether to save browser context to disk for session persistence',
			},
			{
				displayName: 'User Data Directory',
				name: 'userDataDir',
				type: 'string',
				default: '',
				placeholder: '/data/browser-profiles/profile1',
				description: 'Path to browser profile directory for persistent sessions',
				displayOptions: { show: { usePersistentContext: [true] } },
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
				operation: ['jsonExtractor'],
			},
		},
		options: [
			{
				displayName: 'Cache Mode',
				name: 'cacheMode',
				type: 'options',
				options: [
					{
						name: 'Bypass (Skip Cache)',
						value: 'BYPASS',
						description: 'Skip cache for this operation, fetch fresh content',
					},
					{
						name: 'Disabled (No Cache)',
						value: 'DISABLED',
						description: 'No caching at all',
					},
					{
						name: 'Enabled (Read/Write)',
						value: 'ENABLED',
						description: 'Use cache if available, save new results to cache',
					},
					{
						name: 'Read Only',
						value: 'READ_ONLY',
						description: 'Only read from cache, do not write new results',
					},
					{
						name: 'Write Only',
						value: 'WRITE_ONLY',
						description: 'Only write to cache, do not read existing cache',
					},
				],
				default: 'ENABLED',
				description: 'How to use the cache when crawling',
			},
			{
				displayName: 'Include Full Text',
				name: 'includeFullText',
				type: 'boolean',
				default: false,
				description: 'Whether to include the full crawled text in the output',
			},
			{
				displayName: 'Headers',
				name: 'headers',
				type: 'string',
				typeOptions: {
					rows: 2,
				},
				default: '',
				placeholder: '{"accept": "application/json"}',
				description: 'Headers to send with the request (JSON format)',
			},
		],
	},
];

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		try {
			// Get parameters for the current item
			const url = this.getNodeParameter('url', i, '') as string;
			const jsonPath = this.getNodeParameter('jsonPath', i, '') as string;
			const sourceType = this.getNodeParameter('sourceType', i, 'direct') as string;
			const extractionType = this.getNodeParameter('extractionType', i, 'css') as string;
			const scriptSelector = this.getNodeParameter('scriptSelector', i, '') as string;
			let browserOptions = this.getNodeParameter('browserOptions', i, {}) as IDataObject;
			const sessionOptions = this.getNodeParameter('sessionOptions', i, {}) as IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			// Transform extraArgs from fixedCollection format to array
			if (browserOptions.extraArgs && typeof browserOptions.extraArgs === 'object') {
				const extraArgsCollection = browserOptions.extraArgs as any;
				if (extraArgsCollection.args && Array.isArray(extraArgsCollection.args)) {
					browserOptions = {
						...browserOptions,
						extraArgs: extraArgsCollection.args.map((arg: any) => arg.value).filter((v: string) => v)
					};
				}
			}

			// Merge session options into browser options
			browserOptions = { ...sessionOptions, ...browserOptions };

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}

			if (!isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
			}

			// Check if script selector is provided when source type is 'script'
			if (sourceType === 'script' && !scriptSelector) {
				throw new NodeOperationError(this.getNode(), 'Script selector is required when source type is "JSON in Script Tag".', { itemIndex: i });
			}

			// Parse headers if provided
			let headers: IDataObject | undefined;
			if (options.headers && typeof options.headers === 'string') {
				try {
					headers = JSON.parse(options.headers as string) as IDataObject;
				} catch (error) {
					throw new NodeOperationError(this.getNode(), 'Headers must be a valid JSON object.', { itemIndex: i });
				}
			}

			// Get crawler instance
			const crawler = await getCrawl4aiClient(this);

			// Create a JSON extraction strategy — CSS or XPath schema
			const useXPath = extractionType === 'xpath';
			const strategyTypeName = useXPath ? 'JsonXPathExtractionStrategy' : 'JsonCssExtractionStrategy';
			const baseSelector = sourceType === 'jsonld'
				? (useXPath ? '//script[@type="application/ld+json"]' : 'script[type="application/ld+json"]')
				: (scriptSelector || (useXPath ? '//body' : 'body'));
			const fieldSelector = sourceType === 'jsonld' ? '' : (scriptSelector || (useXPath ? '//pre' : 'pre'));
			const extractionStrategy = {
				type: strategyTypeName,
				params: {
					schema: {
						type: 'dict',
						value: {
							name: 'json_extraction',
							baseSelector,
							fields: [
								{
									name: 'content',
									selector: fieldSelector,
									type: 'text',
								}
							],
						},
					},
				},
			};

			// Build crawler config using standardized helper
			const crawlerOptions: any = {
				...browserOptions, // Include browser options
				cacheMode: options.cacheMode || 'ENABLED',
				jsCode: browserOptions.jsCode,
			};

			// Add headers if provided (headers go in browser config)
			if (headers) {
				crawlerOptions.headers = headers;
			}

			const crawlerConfig = createCrawlerRunConfig(crawlerOptions);
			// Set extraction strategy only if not direct mode
			if (sourceType !== 'direct') {
				crawlerConfig.extractionStrategy = extractionStrategy;
			}

			// Run the extraction using standardized arun() method
			const result = await crawler.arun(url, crawlerConfig);

			// Process the result based on source type
			let jsonData: IDataObject | IDataObject[] | null = null;

			if (result.success) {
				if (sourceType === 'direct') {
					// For direct JSON URLs, the result might be in extracted_content or text
					try {
						if (result.extracted_content) {
							jsonData = JSON.parse(result.extracted_content) as IDataObject;
						} else if (result.text) {
							jsonData = JSON.parse(result.text) as IDataObject;
						}
					} catch (error) {
						// Fallback: try to extract JSON from text content
						const jsonMatch = result.text?.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
						if (jsonMatch) {
							try {
								jsonData = JSON.parse(jsonMatch[0]) as IDataObject;
							} catch {
								// If all else fails, return the text
								jsonData = { content: result.text };
							}
						}
					}
				} else {
					// For script tags and JSON-LD, use extraction strategy result
					if (result.extracted_content) {
						try {
							const extractedData = JSON.parse(result.extracted_content);
							if (Array.isArray(extractedData) && extractedData.length > 0) {
								// Extract the content from the first item
								const content = extractedData[0].content;
								// Parse the actual JSON from the script content
								jsonData = JSON.parse(content);
							}
						} catch (error) {
							// Fallback to text content
							jsonData = { error: 'Failed to parse JSON from script tag' };
						}
					}
				}

				// Apply JSON path if provided
				if (jsonPath && jsonData) {
					// Handle nested path (e.g., 'data.items')
					const pathParts = jsonPath.split('.');
					let currentData: any = jsonData;

					for (const part of pathParts) {
						if (currentData && typeof currentData === 'object' && part in currentData) {
							currentData = currentData[part];
						} else {
							currentData = null;
							break;
						}
					}

					jsonData = currentData as IDataObject;
				}
			}

			// Format result using standard output shape
			const fetchedAt = new Date().toISOString();
			const strategyName = sourceType !== 'direct'
				? (extractionType === 'xpath' ? 'JsonXPathExtractionStrategy' : 'JsonCssExtractionStrategy')
				: 'JsonExtractor';
			const formattedResult = formatExtractionResult(result, jsonData as any, {
				fetchedAt,
				extractionStrategy: strategyName,
				includeFullText: options.includeFullText as boolean,
				includeLinks: false,
			});

			// Add the result to the output array
			allResults.push({
				json: formattedResult,
				pairedItem: { item: i },
			});

		} catch (error) {
			// Handle continueOnFail or re-throw
			if (this.continueOnFail()) {
				const node = this.getNode();
				const errorItemIndex = (error as any).itemIndex ?? i;
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(node, (error as Error).message, { itemIndex: errorItemIndex }),
					pairedItem: { item: i },
				});
				continue;
			}
			// If not continueOnFail, re-throw the error
			throw error;
		}
	}

	return allResults;
}
