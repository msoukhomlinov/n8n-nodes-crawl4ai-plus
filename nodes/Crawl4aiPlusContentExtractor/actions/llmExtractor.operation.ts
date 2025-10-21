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
import { parseExtractedJson, formatExtractionResult } from '../../Crawl4aiPlusBasicCrawler/helpers/formatters';

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
				description: 'Which browser engine to use for crawling. Default: Chromium (if not specified)',
			},
			{
				displayName: 'Enable JavaScript',
				name: 'java_script_enabled',
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
	displayName: 'Session & Authentication',
	name: 'sessionOptions',
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
			displayName: 'Cookies',
			name: 'cookies',
			type: 'json',
			default: '',
			placeholder: '[{"name": "session_id", "value": "abc123", "domain": ".example.com", "path": "/"}]',
			description: 'Array of cookie objects to inject. Alternative to storage state for simple cookie-based auth.',
		},
		{
			displayName: 'Storage State (JSON)',
			name: 'storageState',
			type: 'string',
			typeOptions: {
				rows: 6,
			},
			default: '',
			placeholder: '{"cookies": [...], "origins": [...]}',
			description: 'Browser storage state as JSON (cookies, localStorage, sessionStorage). Captures authenticated session state. Works in all n8n environments.',
		},
		{
			displayName: 'Use Managed Browser',
			name: 'useManagedBrowser',
			type: 'boolean',
			default: false,
			description: 'Whether to use managed browser mode (required for persistent contexts). Advanced option.',
			displayOptions: {
				show: {
					usePersistentContext: [true],
				},
			},
		},
		{
			displayName: 'Use Persistent Browser Context',
			name: 'usePersistentContext',
			type: 'boolean',
			default: false,
			description: 'Whether to use a persistent browser context (requires user data directory). Only use in self-hosted environments with persistent storage.',
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
		displayName: 'LLM Options',
		name: 'llmOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {
			maxTokens: 2000,
			temperature: 0,
		},
		displayOptions: {
			show: {
				operation: ['llmExtractor'],
			},
		},
		options: [
			{
				displayName: 'Input Format',
				name: 'inputFormat',
				type: 'options',
				options: [
					{
						name: 'Markdown (Default)',
						value: 'markdown',
						description: 'Extract from raw markdown - Fast, text-focused, good for most cases',
					},
					{
						name: 'HTML',
						value: 'html',
						description: 'Extract from HTML - Preserves DOM structure, best for structured data extraction',
					},
					{
						name: 'Fit Markdown (Cleaned)',
						value: 'fit_markdown',
						description: 'Extract from cleaned markdown - Requires content filter, reduces noise and token cost',
					},
				],
				default: 'markdown',
				description: 'Format of content passed to the LLM. HTML uses more tokens but preserves structure. Fit markdown requires a content filter to be configured.',
			},
			{
				displayName: 'Max Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 2000,
				description: 'Maximum number of tokens for the LLM response',
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
	const credentials = (await this.getCredentials('crawl4aiPlusApi')) as unknown as Crawl4aiApiCredentials;

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
		const sessionOptions = this.getNodeParameter('sessionOptions', i, {}) as IDataObject;
		const llmOptions = this.getNodeParameter('llmOptions', i, {}) as IDataObject;
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const arrayHandling = options.arrayHandling as string || 'none';
		const includeMetadataInSplitItems = options.includeMetadataInSplitItems as boolean || false;

		// Merge session options into browser options for unified config
		let mergedBrowserOptions = { ...browserOptions, ...sessionOptions };

		// Transform extraArgs from fixedCollection format to array
		if (browserOptions.extraArgs && typeof browserOptions.extraArgs === 'object') {
			const extraArgsCollection = browserOptions.extraArgs as any;
			if (extraArgsCollection.args && Array.isArray(extraArgsCollection.args)) {
				mergedBrowserOptions.extraArgs = extraArgsCollection.args.map((arg: any) => arg.value).filter((v: string) => v);
			}
		}

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
			const useCustomProvider = credentials.llmProvider === 'other';
			let provider: string | undefined;
			let apiKey: string | undefined;
			let baseUrl: string | undefined;

			if (useCustomProvider) {
				provider = credentials.customProvider?.trim();
				apiKey = credentials.customApiKey?.trim();
				baseUrl = credentials.customBaseUrl?.trim() || undefined;
				if (!provider) {
					throw new NodeOperationError(this.getNode(), 'Custom provider must be set in credentials when using "LiteLLM / Custom" provider.', { itemIndex: i });
				}
				if (!apiKey) {
					throw new NodeOperationError(this.getNode(), 'Custom provider API key must be provided in credentials when using "LiteLLM / Custom" provider.', { itemIndex: i });
				}
			} else {
				switch (credentials.llmProvider) {
					case 'ollama': {
						const ollamaModel = credentials.ollamaModel?.trim() || 'llama3';
						provider = `ollama/${ollamaModel}`;
						apiKey = undefined; // Ollama typically runs locally without API keys
						baseUrl = credentials.ollamaUrl?.trim() || 'http://localhost:11434';
						break;
					}
					case 'openai':
					case 'groq':
					case 'anthropic': {
						const providerDefaults: Record<string, string> = {
							openai: 'gpt-4o',
							groq: 'llama-3.1-70b-versatile',
							anthropic: 'claude-3-5-sonnet-20241022',
						};
						const modelId = credentials.llmModel?.trim() || providerDefaults[credentials.llmProvider] || 'gpt-4o';
						provider = `${credentials.llmProvider}/${modelId}`;
						apiKey = credentials.apiKey?.trim();
						baseUrl = undefined;
						if (!apiKey) {
							throw new NodeOperationError(this.getNode(), `API key must be provided in credentials for ${credentials.llmProvider} LLM provider.`, { itemIndex: i });
						}
						break;
					}
					default: {
						throw new NodeOperationError(this.getNode(), 'Unsupported LLM provider configured in credentials. Please choose OpenAI, Groq, Anthropic, Ollama, or Other.', { itemIndex: i });
					}
				}
			}

		// Create browser config
		const browserConfig = createBrowserConfig(mergedBrowserOptions);

		// Get input format from LLM options
		const inputFormat = llmOptions.inputFormat as 'markdown' | 'html' | 'fit_markdown' | undefined;

		// Create LLM extraction strategy
		const extractionStrategy = createLlmExtractionStrategy(
			schema,
			instruction,
			provider,
			apiKey,
			baseUrl,
			inputFormat
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
