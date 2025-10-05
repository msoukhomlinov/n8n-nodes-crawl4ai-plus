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
		displayName: 'Schema Input Mode',
		name: 'schemaMode',
		type: 'options',
		options: [
			{
				name: 'Simple Fields',
				value: 'simple',
				description: 'Define schema using individual field inputs',
			},
			{
				name: 'Advanced JSON',
				value: 'advanced',
				description: 'Define schema using JSON editor',
			},
		],
		default: 'simple',
		description: 'Choose how to define the extraction schema',
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
				schemaMode: ['simple'],
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
		displayName: 'JSON Schema',
		name: 'jsonSchema',
		type: 'string',
		default: `{
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "description": "Main page title"
    },
    "description": {
      "type": "string",
      "description": "Page description or summary"
    }
  },
  "required": ["title"]
}`,
		placeholder: `{
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "description": "Main page title"
    },
    "price": {
      "type": "number",
      "description": "Product price"
    },
    "features": {
      "type": "array",
      "items": {"type": "string"},
      "description": "List of product features"
    }
  },
  "required": ["title", "price"]
}`,
		description: 'JSON schema defining the structure of data to extract. Must be valid JSON format.',
		displayOptions: {
			show: {
				operation: ['llmExtractor'],
				schemaMode: ['advanced'],
			},
		},
		typeOptions: {
			rows: 12,
			alwaysOpenEditWindow: false,
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
				operation: ['llmExtractor'],
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
				description: 'Which browser engine to use for crawling',
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
						name: 'Anthropic Claude 3 Haiku',
						value: 'anthropic/claude-3-haiku-20240307',
						description: 'Claude 3 Haiku (Fast)',
					},
					{
						name: 'Anthropic Claude 3 Opus',
						value: 'anthropic/claude-3-opus-20240229',
						description: 'Claude 3 Opus (Most Capable)',
					},
				{
					name: 'Anthropic Claude 3 Sonnet',
					value: 'anthropic/claude-3-sonnet-20240229',
				},
				{
					name: 'Anthropic Claude 3.5 Sonnet',
					value: 'anthropic/claude-3-5-sonnet-20241022',
				},
					{
						name: 'Anthropic Claude 3.7 Sonnet',
						value: 'anthropic/claude-3-7-sonnet-20250219',
						description: 'Claude 3.7 Sonnet (Latest, Best)',
					},
					{
						name: 'DeepSeek Chat',
						value: 'deepseek/deepseek-chat',
						description: 'DeepSeek Chat (Affordable)',
					},
					{
						name: 'DeepSeek Coder',
						value: 'deepseek/deepseek-coder',
						description: 'DeepSeek Coder (Code-Focused)',
					},
					{
						name: 'Google Gemini 1.5 Flash',
						value: 'gemini/gemini-1.5-flash',
						description: 'Gemini 1.5 Flash (Fast)',
					},
					{
						name: 'Google Gemini 1.5 Pro',
						value: 'gemini/gemini-1.5-pro',
						description: 'Gemini 1.5 Pro (Large Context)',
					},
				{
					name: 'Google Gemini Pro',
					value: 'gemini/gemini-pro',
				},
					{
						name: 'Groq Llama 3 70B',
						value: 'groq/llama3-70b-8192',
						description: 'Groq Llama 3 70B (Fast)',
					},
					{
						name: 'Groq Llama 3.1 70B',
						value: 'groq/llama-3.1-70b-versatile',
						description: 'Groq Llama 3.1 70B (Fast)',
					},
					{
						name: 'Groq Llama 3.3 70B',
						value: 'groq/llama-3.3-70b-versatile',
						description: 'Groq Llama 3.3 70B (Fast)',
					},
					{
						name: 'Groq Mixtral 8x7B',
						value: 'groq/mixtral-8x7b-32768',
						description: 'Groq Mixtral 8x7B (Fast)',
					},
					{
						name: 'Ollama Llama 3',
						value: 'ollama/llama3',
						description: 'Ollama Llama 3 (Local)',
					},
					{
						name: 'Ollama Llama 3.3',
						value: 'ollama/llama3.3',
						description: 'Ollama Llama 3.3 (Local)',
					},
					{
						name: 'Ollama Mistral',
						value: 'ollama/mistral',
						description: 'Ollama Mistral (Local)',
					},
					{
						name: 'Ollama Qwen 2.5',
						value: 'ollama/qwen2.5',
						description: 'Ollama Qwen 2.5 (Local)',
					},
					{
						name: 'OpenAI GPT-3.5 Turbo',
						value: 'openai/gpt-3.5-turbo',
						description: 'OpenAI GPT-3.5 Turbo (Fast)',
					},
				{
					name: 'OpenAI GPT-4 Turbo',
					value: 'openai/gpt-4-turbo',
				},
					{
						name: 'OpenAI GPT-4o',
						value: 'openai/gpt-4o',
						description: 'OpenAI GPT-4o (Recommended)',
					},
					{
						name: 'OpenAI GPT-4o Mini',
						value: 'openai/gpt-4o-mini',
						description: 'OpenAI GPT-4o Mini (Fast & Affordable)',
					},
				],
				default: 'openai/gpt-4o-mini',
				description: 'LLM provider to use for extraction. Supports 100+ models via LiteLLM.',
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
				displayName: 'Array Handling',
				name: 'arrayHandling',
				type: 'options',
				options: [
					{
						name: 'Keep As Object (Default)',
						value: 'none',
						description: 'Maintain current behavior - arrays become indexed properties',
					},
					{
						name: 'Split Top-Level Arrays',
						value: 'topLevel',
						description: 'Create separate items only for arrays at root level',
					},
					{
						name: 'Split All Object Arrays',
						value: 'allObjects',
						description: 'Split any array containing objects, preserve primitive arrays',
					},
					{
						name: 'Smart Split',
						value: 'smart',
						description: 'Automatically detect main content arrays and split intelligently',
					},
				],
				default: 'none',
				description: 'How to handle arrays in the extracted data',
			},
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
				description: 'CSS selector to focus extraction on a specific part of the page (leave empty for full page)',
			},
			{
				displayName: 'Include Metadata in Split Items',
				name: 'includeMetadataInSplitItems',
				type: 'boolean',
				default: false,
				description: 'Whether to include URL, success, and other metadata in each split item (reduces redundancy when disabled)',
				displayOptions: {
					show: {
						arrayHandling: ['topLevel', 'allObjects', 'smart'],
					},
				},
			},
			{
				displayName: 'Include Original Text',
				name: 'includeFullText',
				type: 'boolean',
				default: false,
				description: 'Whether to include the original webpage text in output',
			},
		],
	},
];

// --- Array Handling Helper Functions ---

/**
 * Detect if a value is an array of objects (vs array of primitives)
 */
// function isObjectArray(value: any): boolean {
// 	return Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
// }

/**
 * Detect if a value is an array of primitives
 */
// function isPrimitiveArray(value: any): boolean {
// 	return Array.isArray(value) && value.length > 0 && typeof value[0] !== 'object';
// }

/**
 * Get numeric keys from an object (indicates flattened arrays)
 */
function getNumericKeys(obj: IDataObject): string[] {
	return Object.keys(obj).filter(key => /^\d+$/.test(key)).sort((a, b) => parseInt(a) - parseInt(b));
}

/**
 * Get non-numeric keys (metadata) from an object
 */
function getMetadataKeys(obj: IDataObject): string[] {
	return Object.keys(obj).filter(key => !/^\d+$/.test(key));
}

/**
 * Detect main content array using heuristics
 */
function detectMainArray(obj: IDataObject): string | null {
	const numericKeys = getNumericKeys(obj);
	if (numericKeys.length === 0) return null;

	// If all numeric keys are objects, this is likely the main content
	const firstItem = obj[numericKeys[0]];
	if (typeof firstItem === 'object' && firstItem !== null) {
		// Check complexity - objects with multiple properties are likely main content
		const keyCount = Object.keys(firstItem).length;
		if (keyCount >= 2) {
			return 'numeric'; // Indicates numeric keys contain main content
		}
	}

	return null;
}

/**
 * Process data according to array handling strategy
 */
function processArrayHandling(
	data: IDataObject,
	strategy: string,
	baseMetadata: IDataObject,
	includeMetadata: boolean = true
): IDataObject[] {
	if (strategy === 'none') {
		return [data];
	}

	const numericKeys = getNumericKeys(data);
	const baseData: IDataObject = {};

	// Only include metadata if requested
	if (includeMetadata) {
		const metadata = getMetadataKeys(data);

		// Preserve metadata
		metadata.forEach(key => {
			baseData[key] = data[key];
		});

		// Add additional metadata
		Object.entries(baseMetadata).forEach(([key, value]) => {
			baseData[key] = value;
		});
	}

	if (numericKeys.length === 0) {
		// No arrays detected, return as single item
		return [data];
	}

	switch (strategy) {
		case 'topLevel':
			// Split all top-level numeric keys
			return numericKeys.map(key => {
				const itemData = data[key];
				if (typeof itemData === 'object' && itemData !== null) {
					return {
						...baseData,
						...itemData
					};
				}
				return {
					...baseData,
					value: itemData
				};
			});

		case 'allObjects':
			// Only split if items are objects
			const firstItem = data[numericKeys[0]];
			if (typeof firstItem === 'object' && firstItem !== null) {
				return numericKeys.map(key => {
					const itemData = data[key];
					return {
						...baseData,
						...(typeof itemData === 'object' && itemData !== null ? itemData : { value: itemData })
					};
				});
			}
			return [data]; // Keep as single item if not objects

		case 'smart':
			// Use heuristics to determine if this should be split
			const mainArray = detectMainArray(data);
			if (mainArray === 'numeric') {
				return numericKeys.map(key => {
					const itemData = data[key];
					return {
						...baseData,
						...(typeof itemData === 'object' && itemData !== null ? itemData : { value: itemData })
					};
				});
			}
			return [data]; // Keep as single item

		default:
			return [data];
	}
}

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
			const schemaMode = this.getNodeParameter('schemaMode', i, 'simple') as string;
			const schemaFieldsValues = this.getNodeParameter('schemaFields.fieldsValues', i, []) as IDataObject[];
			const jsonSchema = this.getNodeParameter('jsonSchema', i, {}) as IDataObject;
			const browserOptions = this.getNodeParameter('browserOptions', i, {}) as IDataObject;
			const llmOptions = this.getNodeParameter('llmOptions', i, {}) as IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const arrayHandling = options.arrayHandling as string || 'none';
			const includeMetadataInSplitItems = options.includeMetadataInSplitItems as boolean || false;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}

			if (!isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
			}

			if (!instruction) {
				throw new NodeOperationError(this.getNode(), 'Extraction instructions cannot be empty.', { itemIndex: i });
			}

			// Validate schema based on mode
			if (schemaMode === 'simple') {
				if (!schemaFieldsValues || schemaFieldsValues.length === 0) {
					throw new NodeOperationError(this.getNode(), 'At least one schema field must be defined.', { itemIndex: i });
				}
			} else if (schemaMode === 'advanced') {
				if (!jsonSchema || (jsonSchema as unknown as string).trim() === '') {
					throw new NodeOperationError(this.getNode(), 'JSON schema cannot be empty.', { itemIndex: i });
				}
			}

			// Prepare LLM schema based on mode
			let schema: LlmSchema;

			if (schemaMode === 'simple') {
				// Build schema from individual fields (current logic)
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

				schema = {
					title: 'ExtractedData',
					type: 'object',
					properties: schemaProperties,
					required: requiredFields.length > 0 ? requiredFields : undefined,
				};
			} else {
				// Use JSON schema directly (advanced mode)
				// jsonSchema is always a string now (from textarea)
				const jsonSchemaString = jsonSchema as unknown as string;

				if (!jsonSchemaString || jsonSchemaString.trim() === '') {
					throw new NodeOperationError(this.getNode(), 'JSON schema cannot be empty in advanced mode.', { itemIndex: i });
				}

				let parsedSchema: any;
				try {
					parsedSchema = JSON.parse(jsonSchemaString.trim());
				} catch (error) {
					throw new NodeOperationError(this.getNode(), `Invalid JSON schema: ${(error as Error).message}`, { itemIndex: i });
				}

				// Validate that parsedSchema is an object
				if (!parsedSchema || typeof parsedSchema !== 'object') {
					throw new NodeOperationError(this.getNode(), 'JSON schema must be a valid object', { itemIndex: i });
				}

				schema = parsedSchema as LlmSchema;

				// Ensure basic structure is present
				if (!schema.type) {
					schema.type = 'object';
				}
				if (!schema.title) {
					schema.title = 'ExtractedData';
				}
			}

			// Determine LLM provider
			let provider: string;
			let apiKey: string;
			let baseUrl: string | undefined;

			if (credentials.llmProvider === 'other') {
				provider = credentials.customProvider || 'openai/gpt-4o';
				apiKey = credentials.customApiKey || '';
				baseUrl = credentials.customBaseUrl || undefined;
			} else {
				provider = credentials.llmProvider || 'openai/gpt-4o';
				apiKey = credentials.apiKey || '';
				baseUrl = undefined;
			}

			if (llmOptions.overrideProvider === true) {
				provider = llmOptions.llmProvider as string || provider;
				apiKey = llmOptions.apiKey as string || apiKey;
				// Note: When overriding provider in the node, base URL from credentials is still used
			}

			// Create browser config
			const browserConfig = createBrowserConfig(browserOptions);

			// Create LLM extraction strategy
			const extractionStrategy = createLlmExtractionStrategy(
				schema,
				instruction,
				provider,
				apiKey,
				baseUrl
			);

			// Get crawler instance
			const crawler = await getCrawl4aiClient(this);

			// Prepare extra arguments for LLM
			const extraArgs: any = {};
			if (llmOptions.temperature !== undefined) {
				extraArgs.temperature = llmOptions.temperature;
			}
			if (llmOptions.maxTokens !== undefined) {
				extraArgs.max_tokens = llmOptions.maxTokens;
			}

			// Run the extraction
			const result = await crawler.arun(url, {
				browserConfig,
				extractionStrategy,
				cacheMode: options.cacheMode || 'enabled',
				jsCode: browserOptions.jsCode,
				cssSelector: options.cssSelector,
				extraArgs,
			});

			// Parse extracted JSON
			const extractedData = parseExtractedJson(result);

			// Format extraction result
			const formattedResult = formatExtractionResult(
				result,
				extractedData,
				options.includeFullText as boolean
			);

			// Apply array handling strategy
			const processedResults = processArrayHandling(
				formattedResult,
				arrayHandling,
				{}, // baseMetadata (empty for now)
				includeMetadataInSplitItems
			);

			// Add processed results to output array
			processedResults.forEach(processedResult => {
				allResults.push({
					json: processedResult,
					pairedItem: { item: i },
				});
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
