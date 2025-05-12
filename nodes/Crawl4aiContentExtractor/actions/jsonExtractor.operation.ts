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
	createBrowserConfig
} from '../helpers/utils';

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
		displayName: 'Script Selector',
		name: 'scriptSelector',
		type: 'string',
		default: '',
		placeholder: 'script#__NEXT_DATA__',
		description: 'CSS selector for the script tag containing JSON data',
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
				displayName: 'Headless Mode',
				name: 'headless',
				type: 'boolean',
				default: true,
				description: 'Whether to run browser in headless mode',
			},
			{
				displayName: 'Enable JavaScript',
				name: 'javaScriptEnabled',
				type: 'boolean',
				default: true,
				description: 'Whether to enable JavaScript execution',
			},
			{
				displayName: 'Timeout (MS)',
				name: 'timeout',
				type: 'number',
				default: 30000,
				description: 'Maximum time to wait for the browser to load the page',
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
						name: 'Enabled (Read/Write)',
						value: 'enabled',
						description: 'Use cache if available, save new results to cache',
					},
					{
						name: 'Bypass (Force Fresh)',
						value: 'bypass',
						description: 'Ignore cache, always fetch fresh content',
					},
					{
						name: 'Only (Read Only)',
						value: 'only',
						description: 'Only use cache, do not make new requests',
					},
				],
				default: 'enabled',
				description: 'How to use the cache when crawling',
			},
			{
				displayName: 'Include Full Content',
				name: 'includeFullContent',
				type: 'boolean',
				default: false,
				description: 'Whether to include the full JSON content in addition to the extracted data',
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
			const scriptSelector = this.getNodeParameter('scriptSelector', i, '') as string;
			const browserOptions = this.getNodeParameter('browserOptions', i, {}) as IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
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

			// Create browser config
			const browserConfig = createBrowserConfig(browserOptions);

			// Get crawler instance
			const crawler = await getCrawl4aiClient(this);

			// Prepare extraction parameters
			const extractionParams: IDataObject = {
				sourceType,
				cacheMode: options.cacheMode || 'enabled',
				jsCode: browserOptions.jsCode,
				browserConfig,
			};

			// Add script selector if needed
			if (sourceType === 'script') {
				extractionParams.scriptSelector = scriptSelector;
			}

			// Add JSON-LD type if needed
			if (sourceType === 'jsonld') {
				extractionParams.jsonLdType = true;
			}

			// Add headers if provided
			if (headers) {
				extractionParams.headers = headers;
			}

			// Create a JSON extraction strategy
			const extractionStrategy = {
				type: 'json',
				source_type: sourceType,
				script_selector: scriptSelector,
				json_path: jsonPath,
			};

			// Run the JSON extraction
			const result = await crawler.arun(url, {
				extractionStrategy,
				browserConfig,
				cacheMode: options.cacheMode || 'enabled',
				jsCode: browserOptions.jsCode,
				headers,
			});

			// Parse JSON from the result
			let jsonData: IDataObject | null = null;
			try {
				if (result.success && result.extracted_content) {
					jsonData = JSON.parse(result.extracted_content) as IDataObject;

					// Apply JSON path if provided
					if (jsonPath && jsonData) {
						// Handle nested path (e.g., 'data.items')
						const pathParts = jsonPath.split('.');
						let currentData: IDataObject | null = jsonData;

						for (const part of pathParts) {
							if (currentData && typeof currentData === 'object' && part in currentData) {
								currentData = currentData[part] as IDataObject;
							} else {
								currentData = null;
								break;
							}
						}

						jsonData = currentData as IDataObject;
					}
				}
			} catch (error) {
				throw new NodeOperationError(
					this.getNode(),
					`Failed to parse JSON: ${(error as Error).message}`,
					{ itemIndex: i }
				);
			}

			// Prepare output
			const output: IDataObject = {
				url,
				success: result.success,
			};

			// Add error message if failed
			if (!result.success && result.error_message) {
				output.error = result.error_message;
			} else if (jsonData) {
				// Add data if successful
				output.data = jsonData;

				// Include full content if requested
				if (options.includeFullContent === true && result.extracted_content) {
					try {
						output.fullContent = JSON.parse(result.extracted_content);
					} catch {
						output.fullContent = result.extracted_content;
					}
				}
			} else {
				output.error = 'No JSON data found or failed to parse JSON';
			}

			// Add the result to the output array
			allResults.push({
				json: output,
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
