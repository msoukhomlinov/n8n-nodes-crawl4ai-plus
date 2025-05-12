import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// Import helpers and types
import type { Crawl4aiNodeOptions, Crawl4aiApiCredentials, LlmSchema, LlmSchemaField } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createLlmExtractionStrategy,
	isValidUrl
} from '../helpers/utils';
import { parseExtractedJson, formatExtractionResult } from '../../Crawl4aiBasicCrawler/helpers/formatters';

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
				operation: ['llmExtractor'],
			},
		},
	},
	{
		displayName: 'Extraction Instructions',
		name: 'instruction',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		required: true,
		default: '',
		placeholder: 'Extract the product name, price, and description from this page.',
		description: 'Instructions for the LLM on what to extract from the page',
		displayOptions: {
			show: {
				operation: ['llmExtractor'],
			},
		},
	},
	{
		displayName: 'Schema Fields',
		name: 'schemaFields',
		placeholder: 'Add Schema Field',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		default: {},
		required: true,
		displayOptions: {
			show: {
				operation: ['llmExtractor'],
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
						displayName: 'Field Type',
						name: 'fieldType',
						type: 'options',
						options: [
							{
								name: 'String',
								value: 'string',
								description: 'Plain text string',
							},
							{
								name: 'Number',
								value: 'number',
								description: 'Numeric value',
							},
							{
								name: 'Boolean',
								value: 'boolean',
								description: 'True/false value',
							},
							{
								name: 'Array',
								value: 'array',
								description: 'Array of values',
							},
						],
						default: 'string',
						description: 'Type of the field',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						placeholder: 'The main title of the product',
						description: 'Description of the field to help the LLM understand what to extract',
					},
					{
						displayName: 'Required',
						name: 'required',
						type: 'boolean',
						default: true,
						description: 'Whether this field is required',
					},
				],
			},
		],
	},
	{
		displayName: 'Browser Options',
		name: 'browserOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['llmExtractor'],
			},
		},
		options: [
			{
				displayName: 'Enable JavaScript',
				name: 'javaScriptEnabled',
				type: 'boolean',
				default: true,
				description: 'Whether to enable JavaScript execution',
			},
			{
				displayName: 'Headless Mode',
				name: 'headless',
				type: 'boolean',
				default: true,
				description: 'Whether to run browser in headless mode',
			},
			{
				displayName: 'JavaScript Code',
				name: 'jsCode',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder: 'document.querySelector("button.load-more").click();',
				description: 'JavaScript code to execute before extraction (e.g., to click buttons, scroll)',
			},
			{
				displayName: 'Timeout (MS)',
				name: 'timeout',
				type: 'number',
				default: 60000, // Longer timeout for LLM extraction
				description: 'Maximum time to wait for the browser to load the page',
			},
			{
				displayName: 'Viewport Height',
				name: 'viewportHeight',
				type: 'number',
				default: 800,
				description: 'The height of the browser viewport',
			},
			{
				displayName: 'Viewport Width',
				name: 'viewportWidth',
				type: 'number',
				default: 1280,
				description: 'The width of the browser viewport',
			},
		],
	},
	{
		displayName: 'LLM Options',
		name: 'llmOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['llmExtractor'],
			},
		},
		options: [
			{
				displayName: 'LLM Provider',
				name: 'llmProvider',
				type: 'options',
				options: [
					{
						name: 'Anthropic Claude 3 Sonnet',
						value: 'anthropic/claude-3-sonnet',
					},
					{
						name: 'Groq Llama 3 70B',
						value: 'groq/llama3-70b-8192',
					},
					{
						name: 'Ollama Llama 3',
						value: 'ollama/llama3',
						description: 'Ollama Llama 3 (Local)',
					},
					{
						name: 'OpenAI GPT-3.5 Turbo',
						value: 'openai/gpt-3.5-turbo',
					},
					{
						name: 'OpenAI GPT-4o',
						value: 'openai/gpt-4o',
					},
				],
				default: 'openai/gpt-4o',
				description: 'LLM provider to use for extraction',
				displayOptions: {
					show: {
						overrideProvider: [true],
					},
				},
			},
			{
				displayName: 'Max Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 2000,
				description: 'Maximum number of tokens for the LLM response',
			},
			{
				displayName: 'Override LLM Provider',
				name: 'overrideProvider',
				type: 'boolean',
				default: false,
				description: 'Whether to override the LLM provider from credentials',
			},
			{
				displayName: 'Provider API Key',
				name: 'apiKey',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '',
				description: 'API key for the LLM provider (leave empty to use API key from credentials)',
				displayOptions: {
					show: {
						overrideProvider: [true],
					},
				},
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberPrecision: 1,
				},
				default: 0,
				description: 'Controls randomness: 0 for deterministic results, higher for more creativity',
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
				operation: ['llmExtractor'],
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
				displayName: 'Include Original Text',
				name: 'includeFullText',
				type: 'boolean',
				default: false,
				description: 'Whether to include the original webpage text in output',
			},
			{
				displayName: 'CSS Selector',
				name: 'cssSelector',
				type: 'string',
				default: '',
				placeholder: 'article.content',
				description: 'CSS selector to focus extraction on a specific part of the page (leave empty for full page)',
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

	// Get credentials
	const credentials = (await this.getCredentials('crawl4aiApi')) as unknown as Crawl4aiApiCredentials;

	// Check if LLM features are enabled in credentials
	if (!credentials.enableLlm) {
		throw new NodeOperationError(
			this.getNode(),
			'LLM features are not enabled in Crawl4AI credentials. Please enable them and configure an LLM provider.',
			{ itemIndex: 0 }
		);
	}

	for (let i = 0; i < items.length; i++) {
		try {
			// Get parameters for the current item
			const url = this.getNodeParameter('url', i, '') as string;
			const instruction = this.getNodeParameter('instruction', i, '') as string;
			const schemaFieldsValues = this.getNodeParameter('schemaFields.fieldsValues', i, []) as IDataObject[];
			const browserOptions = this.getNodeParameter('browserOptions', i, {}) as IDataObject;
			const llmOptions = this.getNodeParameter('llmOptions', i, {}) as IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}

			if (!isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
			}

			if (!instruction) {
				throw new NodeOperationError(this.getNode(), 'Extraction instructions cannot be empty.', { itemIndex: i });
			}

			if (!schemaFieldsValues || schemaFieldsValues.length === 0) {
				throw new NodeOperationError(this.getNode(), 'At least one schema field must be defined.', { itemIndex: i });
			}

			// Prepare LLM schema
			const schemaProperties: Record<string, LlmSchemaField> = {};
			const requiredFields: string[] = [];

			schemaFieldsValues.forEach(field => {
				const fieldName = field.name as string;
				schemaProperties[fieldName] = {
					name: fieldName,
					type: field.fieldType as string,
					description: field.description as string || undefined,
				};

				if (field.required === true) {
					requiredFields.push(fieldName);
				}
			});

			const schema: LlmSchema = {
				title: 'ExtractedData',
				type: 'object',
				properties: schemaProperties,
				required: requiredFields.length > 0 ? requiredFields : undefined,
			};

			// Determine LLM provider
			let provider = credentials.llmProvider || 'openai/gpt-4o';
			let apiKey = credentials.apiKey;

			if (llmOptions.overrideProvider === true) {
				provider = llmOptions.llmProvider as string || provider;
				apiKey = llmOptions.apiKey as string || apiKey;
			}

			// Create browser config
			const browserConfig = createBrowserConfig(browserOptions);

			// Create LLM extraction strategy
			const extractionStrategy = createLlmExtractionStrategy(
				schema,
				instruction,
				provider,
				apiKey
			);

			// Get crawler instance
			const crawler = await getCrawl4aiClient(this);

			// Run the extraction
			const result = await crawler.arun(url, {
				browserConfig,
				extractionStrategy,
				cacheMode: options.cacheMode || 'enabled',
				jsCode: browserOptions.jsCode,
				cssSelector: options.cssSelector,
				extraArgs: {
					temperature: llmOptions.temperature || 0,
					maxTokens: llmOptions.maxTokens || 2000,
				},
			});

			// Parse extracted JSON
			const extractedData = parseExtractedJson(result);

			// Format extraction result
			const formattedResult = formatExtractionResult(
				result,
				extractedData,
				options.includeFullText as boolean
			);

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
