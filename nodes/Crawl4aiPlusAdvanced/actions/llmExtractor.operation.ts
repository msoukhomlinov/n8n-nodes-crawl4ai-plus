import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiApiCredentials, Crawl4aiNodeOptions, FullCrawlConfig } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createCrawlerRunConfig,
	buildLlmConfig,
	validateLlmCredentials,
	createLlmExtractionStrategy,
	cleanExtractedData,
	isValidUrl,
} from '../../shared/utils';
import { formatExtractionResult, parseExtractedJson } from '../../shared/formatters';
import {
	urlField,
	getBrowserSessionFields,
	getCrawlSettingsFields,
} from '../../shared/descriptions';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		...urlField,
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
							{ name: 'String', value: 'string', description: 'Plain text string' },
							{ name: 'Number', value: 'number', description: 'Numeric value' },
							{ name: 'Boolean', value: 'boolean', description: 'True/false value' },
							{ name: 'Array', value: 'array', description: 'Array of values' },
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
				displayName: 'Input Format',
				name: 'inputFormat',
				type: 'options',
				options: [
					{
						name: 'Markdown (Default)',
						value: 'markdown',
						description: 'Extract from raw markdown — fast, text-focused, good for most cases',
					},
					{
						name: 'HTML',
						value: 'html',
						description: 'Extract from HTML — preserves DOM structure, best for structured data extraction',
					},
					{
						name: 'Fit Markdown (Cleaned)',
						value: 'fit_markdown',
						description: 'Extract from cleaned markdown — reduces noise and token cost',
					},
				],
				default: 'markdown',
				description: 'Format of content passed to the LLM',
			},
			{
				displayName: 'Max Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 2000,
				description: 'Maximum number of tokens for the LLM response',
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
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberPrecision: 1,
				},
				default: '',
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
						description: 'Maintain current behavior — arrays become indexed properties',
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
				displayName: 'Clean Extracted Text',
				name: 'cleanText',
				type: 'boolean',
				default: false,
				description: 'Whether to normalise whitespace in all extracted string values',
			},
			{
				displayName: 'Include Metadata in Split Items',
				name: 'includeMetadataInSplitItems',
				type: 'boolean',
				default: false,
				description: 'Whether to include URL, success, and other metadata in each split item',
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
	...getBrowserSessionFields(['llmExtractor']),
	...getCrawlSettingsFields(['llmExtractor']),
];

// --- Array Handling Helper Functions ---

function getNumericKeys(obj: IDataObject): string[] {
	return Object.keys(obj).filter(key => /^\d+$/.test(key)).sort((a, b) => parseInt(a) - parseInt(b));
}

function getMetadataKeys(obj: IDataObject): string[] {
	return Object.keys(obj).filter(key => !/^\d+$/.test(key));
}

function detectMainArray(obj: IDataObject): string | null {
	const numericKeys = getNumericKeys(obj);
	if (numericKeys.length === 0) return null;

	const firstItem = obj[numericKeys[0]];
	if (typeof firstItem === 'object' && firstItem !== null) {
		const keyCount = Object.keys(firstItem).length;
		if (keyCount >= 2) {
			return 'numeric';
		}
	}

	return null;
}

function processArrayHandling(
	data: IDataObject,
	strategy: string,
	baseMetadata: IDataObject,
	includeMetadata: boolean = true,
): IDataObject[] {
	if (strategy === 'none') {
		return [data];
	}

	const numericKeys = getNumericKeys(data);
	const baseData: IDataObject = {};

	if (includeMetadata) {
		const metadata = getMetadataKeys(data);
		metadata.forEach(key => {
			baseData[key] = data[key];
		});
		Object.entries(baseMetadata).forEach(([key, value]) => {
			baseData[key] = value;
		});
	}

	if (numericKeys.length === 0) {
		return [data];
	}

	switch (strategy) {
		case 'topLevel':
			return numericKeys.map(key => {
				const itemData = data[key];
				if (typeof itemData === 'object' && itemData !== null) {
					return { ...baseData, ...itemData };
				}
				return { ...baseData, value: itemData };
			});

		case 'allObjects': {
			const firstItem = data[numericKeys[0]];
			if (typeof firstItem === 'object' && firstItem !== null) {
				return numericKeys.map(key => {
					const itemData = data[key];
					return {
						...baseData,
						...(typeof itemData === 'object' && itemData !== null ? itemData : { value: itemData }),
					};
				});
			}
			return [data];
		}

		case 'smart': {
			const mainArray = detectMainArray(data);
			if (mainArray === 'numeric') {
				return numericKeys.map(key => {
					const itemData = data[key];
					return {
						...baseData,
						...(typeof itemData === 'object' && itemData !== null ? itemData : { value: itemData }),
					};
				});
			}
			return [data];
		}

		default:
			return [data];
	}
}

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];

	const credentials = await this.getCredentials('crawl4aiPlusApi') as unknown as Crawl4aiApiCredentials;
	const crawler = await getCrawl4aiClient(this);

	for (let i = 0; i < items.length; i++) {
		try {
			try {
				validateLlmCredentials(credentials, 'LLM extraction');
			} catch (err) {
				throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
			}
			const url = this.getNodeParameter('url', i, '') as string;
			const instruction = this.getNodeParameter('instruction', i, '') as string;
			const schemaMode = this.getNodeParameter('schemaMode', i, 'simple') as string;
			const schemaFieldsValues = this.getNodeParameter('schemaFields.fieldsValues', i, []) as IDataObject[];
			const jsonSchema = this.getNodeParameter('jsonSchema', i, '') as string;
			const llmOptions = this.getNodeParameter('llmOptions', i, {}) as IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;

			const arrayHandling = (options.arrayHandling as string) || 'none';
			const includeMetadataInSplitItems = (options.includeMetadataInSplitItems as boolean) || false;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}

			if (!isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
			}

			if (!instruction) {
				throw new NodeOperationError(this.getNode(), 'Extraction instructions cannot be empty.', { itemIndex: i });
			}

			// Build schema
			let schema: Record<string, unknown>;

			if (schemaMode === 'simple') {
				if (!schemaFieldsValues || schemaFieldsValues.length === 0) {
					throw new NodeOperationError(this.getNode(), 'At least one schema field must be defined.', { itemIndex: i });
				}

				const schemaProperties: Record<string, Record<string, unknown>> = {};
				const requiredFields: string[] = [];

				schemaFieldsValues.forEach(field => {
					const fieldName = field.name as string;
					schemaProperties[fieldName] = {
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
				const jsonSchemaString = jsonSchema as string;
				if (!jsonSchemaString || jsonSchemaString.trim() === '') {
					throw new NodeOperationError(this.getNode(), 'JSON schema cannot be empty in advanced mode.', { itemIndex: i });
				}

				try {
					schema = JSON.parse(jsonSchemaString.trim());
				} catch (err) {
					throw new NodeOperationError(this.getNode(), `Invalid JSON schema: ${(err as Error).message}`, { itemIndex: i });
				}

				if (!schema || typeof schema !== 'object') {
					throw new NodeOperationError(this.getNode(), 'JSON schema must be a valid object', { itemIndex: i });
				}

				if (!schema.type) schema.type = 'object';
				if (!schema.title) schema.title = 'ExtractedData';
			}

			// Build LLM config and extraction strategy
			const modelOverride = llmOptions.llmModel as string | undefined;
			const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride || undefined);
			const inputFormat = llmOptions.inputFormat as 'markdown' | 'html' | 'fit_markdown' | undefined;
			const maxTokens = llmOptions.maxTokens !== undefined ? Number(llmOptions.maxTokens) : undefined;
			const temperature = llmOptions.temperature !== undefined && llmOptions.temperature !== '' ? Number(llmOptions.temperature) : undefined;
			const extractionStrategy = createLlmExtractionStrategy(schema, instruction, provider, apiKey, baseUrl, inputFormat, maxTokens, temperature);

			// Build combined config
			const config: FullCrawlConfig = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig(cs),
				extractionStrategy,
			};

			const fetchedAt = new Date().toISOString();
			const result = await crawler.crawlUrl(url, config);

			let extractedData = parseExtractedJson(result);

			if (options.cleanText === true && extractedData) {
				extractedData = cleanExtractedData(extractedData) as IDataObject;
			}

			const formattedResult = formatExtractionResult(result, extractedData, {
				fetchedAt,
				extractionStrategy: 'LLMExtractionStrategy',
				includeFullText: options.includeFullText as boolean,
				includeLinks: true,
			});

			const processedResults = processArrayHandling(
				formattedResult,
				arrayHandling,
				{},
				includeMetadataInSplitItems,
			);

			processedResults.forEach(processedResult => {
				allResults.push({
					json: processedResult,
					pairedItem: { item: i },
				});
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
