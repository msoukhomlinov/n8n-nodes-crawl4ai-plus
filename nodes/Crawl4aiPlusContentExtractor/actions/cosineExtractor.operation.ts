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
	createBrowserConfig,
	createCosineExtractionStrategy,
	getCrawl4aiClient,
	isValidUrl,
} from '../helpers/utils';
import { formatExtractionResult, parseExtractedJson } from '../../Crawl4aiPlusBasicCrawler/helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/reviews',
		description: 'The URL to extract content from using semantic similarity clustering',
		displayOptions: {
			show: {
				operation: ['cosineExtractor'],
			},
		},
	},
	{
		displayName: 'Semantic Filter',
		name: 'semanticFilter',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'product reviews, user feedback',
		description: 'Keywords or topic to filter content semantically. Example: "pricing information", "technical specifications", "customer testimonials".',
		displayOptions: {
			show: {
				operation: ['cosineExtractor'],
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
				operation: ['cosineExtractor'],
			},
		},
		options: [
			{
				displayName: 'Enable Stealth Mode',
				name: 'enableStealth',
				type: 'boolean',
				default: false,
				description: 'Whether to enable anti-detection features to bypass bot detection systems',
			},
			{
				displayName: 'Extra Browser Arguments',
				name: 'extraArgs',
				type: 'fixedCollection',
				default: { args: [] },
				typeOptions: {
					multipleValues: true,
				},
				options: [
					{
						name: 'args',
						displayName: 'Argument',
						values: [
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								placeholder: '--disable-dev-shm-usage',
								description: 'Chromium argument (e.g., --disable-blink-features=AutomationControlled)',
							},
						],
					},
				],
				description: 'Additional Chromium arguments for fine-tuned browser control. Common examples: --disable-dev-shm-usage, --disable-gpu.',
			},
			{
				displayName: 'Headless Mode',
				name: 'headless',
				type: 'boolean',
				default: true,
				description: 'Whether to run the browser in headless mode',
			},
			{
				displayName: 'JavaScript Code',
				name: 'jsCode',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder: "document.querySelector('.load-more').click();",
				description: 'JavaScript code to execute on the page before extraction',
			},
			{
				displayName: 'User Agent',
				name: 'userAgent',
				type: 'string',
				default: '',
				placeholder: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
				description: 'Custom user agent string. Leave empty for default.',
			},
			{
				displayName: 'Viewport Height',
				name: 'viewportHeight',
				type: 'number',
				default: 800,
				description: 'Browser viewport height in pixels',
			},
			{
				displayName: 'Viewport Width',
				name: 'viewportWidth',
				type: 'number',
				default: 1280,
				description: 'Browser viewport width in pixels',
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
				operation: ['cosineExtractor'],
			},
		},
		options: [
			{
				displayName: 'Cookies',
				name: 'cookies',
				type: 'fixedCollection',
				default: { cookieValues: [] },
				typeOptions: {
					multipleValues: true,
				},
				options: [
					{
						name: 'cookieValues',
						displayName: 'Cookie',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Cookie name',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Cookie value',
							},
							{
								displayName: 'Domain',
								name: 'domain',
								type: 'string',
								default: '',
								description: 'Cookie domain',
							},
						],
					},
				],
				description: 'Cookies to inject into the browser session for authentication',
			},
			{
				displayName: 'Session ID',
				name: 'sessionId',
				type: 'string',
				default: '',
				placeholder: 'my-session-123',
				description: 'Reuse browser context across requests with a session identifier',
			},
			{
				displayName: 'Storage State (JSON)',
				name: 'storageState',
				type: 'json',
				default: '',
				placeholder: '{"cookies": [...], "origins": [...]}',
				description: 'Browser storage state (cookies, localStorage, sessionStorage) as JSON. Best for n8n Cloud. Get from browser DevTools → Application → Storage.',
			},
			{
				displayName: 'Use Managed Browser',
				name: 'useManagedBrowser',
				type: 'boolean',
				default: false,
				description: 'Whether to connect to an existing managed browser instance instead of launching a new one',
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
				description: 'Path to browser profile directory for persistent sessions. Advanced: Only works in self-hosted n8n with persistent volumes. Use Storage State for cloud deployments.',
				displayOptions: {
					show: {
						usePersistentContext: [true],
					},
				},
			},
		],
	},
	{
		displayName: 'Clustering Options',
		name: 'clusteringOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['cosineExtractor'],
			},
		},
		options: [
			{
				displayName: 'Linkage Method',
				name: 'linkageMethod',
				type: 'options',
				options: [
					{
						name: 'Ward',
						value: 'ward',
						description: 'Minimises variance within clusters (recommended for most use cases)',
					},
					{
						name: 'Complete',
						value: 'complete',
						description: 'Uses maximum distances between clusters',
					},
					{
						name: 'Average',
						value: 'average',
						description: 'Uses average distances between all pairs',
					},
					{
						name: 'Single',
						value: 'single',
						description: 'Uses minimum distances between clusters',
					},
				],
				default: 'ward',
				description: 'Clustering algorithm linkage method for grouping similar content',
			},
			{
				displayName: 'Max Distance',
				name: 'maxDist',
				type: 'number',
				default: 0.2,
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberPrecision: 2,
				},
				description: 'Maximum distance threshold for clustering (0.0 to 1.0). Lower values create tighter clusters.',
			},
			{
				displayName: 'Model Name',
				name: 'modelName',
				type: 'string',
				default: 'sentence-transformers/all-MiniLM-L6-v2',
				placeholder: 'sentence-transformers/all-MiniLM-L6-v2',
				description: 'Sentence transformer model for generating embeddings. Use multilingual models for non-English content.',
			},
			{
				displayName: 'Similarity Threshold',
				name: 'simThreshold',
				type: 'number',
				default: 0.3,
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberPrecision: 2,
				},
				description: 'Minimum similarity score for content to be included (0.0 to 1.0). Higher values = stricter matching.',
			},
			{
				displayName: 'Top K Clusters',
				name: 'topK',
				type: 'number',
				default: 3,
				typeOptions: {
					minValue: 1,
				},
				description: 'Number of top-ranked content clusters to return',
			},
			{
				displayName: 'Verbose',
				name: 'verbose',
				type: 'boolean',
				default: false,
				description: 'Whether to enable detailed logging for debugging clustering behaviour',
			},
			{
				displayName: 'Word Count Threshold',
				name: 'wordCountThreshold',
				type: 'number',
				default: 10,
				typeOptions: {
					minValue: 1,
				},
				description: 'Minimum number of words per content block to be included in clustering',
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
				operation: ['cosineExtractor'],
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
				displayName: 'CSS Selector',
				name: 'cssSelector',
				type: 'string',
				default: '',
				placeholder: 'article.content',
				description: 'CSS selector to pre-filter content before clustering (leave empty to process full page)',
			},
			{
				displayName: 'Include Full Text',
				name: 'includeFullText',
				type: 'boolean',
				default: false,
				description: 'Whether to include the full crawled markdown text in the output',
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
			const semanticFilter = this.getNodeParameter('semanticFilter', i, '') as string;
			const browserOptions = this.getNodeParameter('browserOptions', i, {}) as IDataObject;
			const sessionOptions = this.getNodeParameter('sessionOptions', i, {}) as IDataObject;
			const clusteringOptions = this.getNodeParameter('clusteringOptions', i, {}) as IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			// Merge session options into browser options for unified config
			let mergedBrowserOptions = { ...browserOptions, ...sessionOptions };

			// Transform extraArgs from fixedCollection format to array
			if (mergedBrowserOptions.extraArgs && typeof mergedBrowserOptions.extraArgs === 'object') {
				const extraArgsCollection = mergedBrowserOptions.extraArgs as IDataObject;
				if (extraArgsCollection.args && Array.isArray(extraArgsCollection.args)) {
					mergedBrowserOptions.extraArgs = (extraArgsCollection.args as IDataObject[])
						.map(arg => String(arg.value || '').trim())
						.filter(v => v.length > 0);
				}
			}

			// Validate URL
			if (!url || !isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), 'Please provide a valid URL.', { itemIndex: i });
			}

			// Validate semantic filter
			if (!semanticFilter || semanticFilter.trim().length === 0) {
				throw new NodeOperationError(
					this.getNode(),
					'Semantic Filter is required for CosineStrategy. Provide keywords or topics to guide content clustering.',
					{ itemIndex: i }
				);
			}

			// Create browser config
			const browserConfig = createBrowserConfig(mergedBrowserOptions);

			// Create Cosine extraction strategy
			const extractionStrategy = createCosineExtractionStrategy(
				semanticFilter,
				clusteringOptions
			);

			// Get crawler instance
			const crawler = await getCrawl4aiClient(this);

			// Run the extraction
			const result = await crawler.arun(url, {
				browserConfig,
				extractionStrategy,
				cacheMode: options.cacheMode || 'ENABLED',
				jsCode: browserOptions.jsCode,
				cssSelector: options.cssSelector,
			});

			// Parse extracted JSON (CosineStrategy returns array of clusters)
			const extractedData = parseExtractedJson(result);

			// Format extraction result
			const formattedResult = formatExtractionResult(
				result,
				extractedData,
				options.includeFullText as boolean
			);

			// Add result to output array
			allResults.push({
				json: formattedResult,
				pairedItem: { item: i },
			});

		} catch (error) {
			// Handle continueOnFail or re-throw
			if (this.continueOnFail()) {
				allResults.push({
					json: {
						error: error.message,
					},
					pairedItem: { item: i },
				});
			} else {
				throw error;
			}
		}
	}

	return allResults;
}

