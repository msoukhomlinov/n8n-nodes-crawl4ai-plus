import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, CrawlerRunConfig } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createCrawlerRunConfig,
	createCssSelectorExtractionStrategy,
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
							{ name: 'Text', value: 'text', description: 'Extract text content' },
							{ name: 'HTML', value: 'html', description: 'Extract HTML content' },
							{ name: 'Attribute', value: 'attribute', description: 'Extract an attribute value' },
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
				displayName: 'Clean Extracted Text',
				name: 'cleanText',
				type: 'boolean',
				default: true,
				description: 'Whether to clean and normalise extracted text (remove extra spaces, newlines)',
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
	...getBrowserSessionFields(['cssExtractor']),
	...getCrawlSettingsFields(['cssExtractor']),
];

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		try {
			const url = this.getNodeParameter('url', i, '') as string;
			const baseSelector = this.getNodeParameter('baseSelector', i, '') as string;
			const fieldsValues = this.getNodeParameter('fields.fieldsValues', i, []) as IDataObject[];
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}

			if (!isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
			}

			if (!baseSelector) {
				throw new NodeOperationError(this.getNode(), 'Base selector cannot be empty.', { itemIndex: i });
			}

			if (!fieldsValues || fieldsValues.length === 0) {
				throw new NodeOperationError(this.getNode(), 'At least one field must be defined.', { itemIndex: i });
			}

			// Build CSS extraction strategy
			const schema = {
				name: 'extracted_items',
				baseSelector,
				fields: fieldsValues.map(field => ({
					name: field.name as string,
					selector: field.selector as string,
					type: field.fieldType as 'text' | 'attribute' | 'html',
					attribute: field.attribute as string,
				})),
			};

			const extractionStrategy = createCssSelectorExtractionStrategy(schema);

			const config: CrawlerRunConfig = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig(cs),
				extractionStrategy,
			};

			const crawler = await getCrawl4aiClient(this);
			const fetchedAt = new Date().toISOString();
			const result = await crawler.crawlUrl(url, config);

			let extractedData = parseExtractedJson(result);

			if (options.cleanText === true && extractedData) {
				extractedData = cleanExtractedData(extractedData) as IDataObject;
			}

			const formattedResult = formatExtractionResult(result, extractedData, {
				fetchedAt,
				extractionStrategy: 'JsonCssExtractionStrategy',
				includeFullText: options.includeFullText as boolean,
				includeLinks: true,
			});

			allResults.push({
				json: formattedResult,
				pairedItem: { item: i },
			});
		} catch (error) {
			if (this.continueOnFail()) {
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(this.getNode(), (error as Error).message, {
						itemIndex: (error as any).itemIndex ?? i,
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
