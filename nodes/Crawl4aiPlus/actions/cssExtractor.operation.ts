import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, CssSelectorSchema, FullCrawlConfig } from '../../shared/interfaces';
import {
	getCrawl4aiClient,
	getSimpleDefaults,
	createCssSelectorExtractionStrategy,
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
				displayName: 'Include Original Text',
				name: 'includeOriginalText',
				type: 'boolean',
				default: false,
				description: 'Whether to include the original webpage text in output',
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
			const baseSelector = this.getNodeParameter('baseSelector', i, '') as string;
			const fieldsValues = this.getNodeParameter('fields.fieldsValues', i, []) as IDataObject[];
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}
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

			if (options.waitFor) {
				config.waitFor = String(options.waitFor);
			}

			// Execute crawl
			const result = await client.crawlUrl(url, config);

			// Parse extracted JSON
			const extractedData = parseExtractedJson(result);
			let items_extracted: IDataObject[] = [];

			if (extractedData) {
				if (Array.isArray(extractedData)) {
					items_extracted = extractedData as IDataObject[];
				} else if (typeof extractedData === 'object') {
					items_extracted = [extractedData];
				}
			}

			// Apply text cleaning if requested
			const shouldClean = options.cleanText !== false;
			if (shouldClean && items_extracted.length > 0) {
				items_extracted = cleanExtractedData(items_extracted) as IDataObject[];
			}

			const formatted = formatCssExtractorResult(result, items_extracted);

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
