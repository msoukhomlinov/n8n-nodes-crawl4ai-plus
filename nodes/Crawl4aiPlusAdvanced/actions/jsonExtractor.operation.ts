import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, ExtractionStrategy, FullCrawlConfig } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createCrawlerRunConfig,
	isValidUrl,
} from '../../shared/utils';
import { formatExtractionResult } from '../../shared/formatters';
import {
	urlField,
	getBrowserSessionFields,
	getCrawlSettingsFields,
} from '../../shared/descriptions';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		...urlField,
		description: 'The URL of the JSON data to extract',
		placeholder: 'https://example.com/api/data.json',
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
		description: 'Dot-separated path to the JSON data to extract (e.g., "data.items"). Array indices are supported (e.g., "data.items.0.name"). Leave empty for entire JSON response.',
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
			{
				displayName: 'Include Full Text',
				name: 'includeFullText',
				type: 'boolean',
				default: false,
				description: 'Whether to include the full crawled text in the output',
			},
		],
	},
	...getBrowserSessionFields(['jsonExtractor']),
	...getCrawlSettingsFields(['jsonExtractor']),
];

/**
 * Find the first valid JSON object or array in a string using brace-balancing.
 * For each `{` or `[` found, walks forward counting matching open/close delimiters
 * (respecting strings) and attempts JSON.parse on the balanced substring.
 * Returns the parsed value on the first success, or null if none found.
 */
function extractFirstValidJson(text: string): IDataObject | IDataObject[] | null {
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch !== '{' && ch !== '[') continue;

		const open = ch;
		const close = ch === '{' ? '}' : ']';
		let depth = 0;
		let inString = false;
		let escape = false;

		for (let j = i; j < text.length; j++) {
			const c = text[j];

			if (escape) {
				escape = false;
				continue;
			}

			if (c === '\\' && inString) {
				escape = true;
				continue;
			}

			if (c === '"') {
				inString = !inString;
				continue;
			}

			if (inString) continue;

			if (c === open) {
				depth++;
			} else if (c === close) {
				depth--;
				if (depth === 0) {
					const candidate = text.substring(i, j + 1);
					try {
						return JSON.parse(candidate) as IDataObject | IDataObject[];
					} catch {
						// Not valid JSON despite balanced braces; try next start position
						break;
					}
				}
			}
		}
	}
	return null;
}

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];
	const crawler = await getCrawl4aiClient(this);

	for (let i = 0; i < items.length; i++) {
		try {
			const url = this.getNodeParameter('url', i, '') as string;
			const jsonPath = this.getNodeParameter('jsonPath', i, '') as string;
			const sourceType = this.getNodeParameter('sourceType', i, 'direct') as string;
			const extractionType = this.getNodeParameter('extractionType', i, 'css') as string;
			const scriptSelector = this.getNodeParameter('scriptSelector', i, '') as string;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}

			if (!isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
			}

			if (sourceType === 'script' && !scriptSelector) {
				throw new NodeOperationError(
					this.getNode(),
					'Script selector is required when source type is "JSON in Script Tag".',
					{ itemIndex: i },
				);
			}

			// Parse headers if provided
			let headers: IDataObject | undefined;
			if (options.headers && typeof options.headers === 'string') {
				try {
					headers = JSON.parse(options.headers as string) as IDataObject;
				} catch {
					throw new NodeOperationError(this.getNode(), 'Headers must be a valid JSON object.', { itemIndex: i });
				}
			}

			// Build extraction strategy for script/jsonld modes
			const useXPath = extractionType === 'xpath';
			const strategyTypeName = useXPath ? 'JsonXPathExtractionStrategy' : 'JsonCssExtractionStrategy';
			const baseSelector = sourceType === 'jsonld'
				? (useXPath ? '//script[@type="application/ld+json"]' : 'script[type="application/ld+json"]')
				: (scriptSelector || (useXPath ? '//body' : 'body'));
			const fieldSelector = '';  // empty selector = text content of the base element itself

			const extractionStrategy: ExtractionStrategy | undefined = sourceType !== 'direct' ? {
				type: strategyTypeName as 'JsonCssExtractionStrategy' | 'JsonXPathExtractionStrategy',
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
								},
							],
						},
					},
				},
			} : undefined;

			// Merge headers into browser config
			const browserConfigData: IDataObject = { ...bs };
			if (headers) {
				browserConfigData.headers = headers;
			}

			const config: FullCrawlConfig = {
				...createBrowserConfig(browserConfigData),
				...createCrawlerRunConfig(cs),
			};

			if (extractionStrategy) {
				config.extractionStrategy = extractionStrategy;
			}

			const result = await crawler.crawlUrl(url, config);

			// Process result based on source type
			let jsonData: IDataObject | IDataObject[] | null = null;

			if (result.success) {
				if (sourceType === 'direct') {
					try {
						if (result.extracted_content) {
							jsonData = JSON.parse(result.extracted_content) as IDataObject;
						} else if (result.text) {
							jsonData = JSON.parse(result.text) as IDataObject;
						}
					} catch {
						// Fallback: find valid JSON by brace-balancing
						jsonData = extractFirstValidJson(result.text || '');
						if (!jsonData) {
							jsonData = { content: result.text, _warning: 'No valid JSON found in the response. Returning raw text.' };
						}
					}
				} else {
					if (result.extracted_content) {
						try {
							const extractedData = JSON.parse(result.extracted_content);
							if (Array.isArray(extractedData) && extractedData.length > 0) {
								const content = extractedData[0].content;
								jsonData = JSON.parse(content);
							}
						} catch {
							jsonData = { _parseError: true, error: 'Failed to parse JSON from script tag' };
						}
					}
				}

				// Apply JSON path if provided
				if (jsonPath && jsonData) {
					const pathParts = jsonPath.split('.');
					let currentData: any = jsonData;

					let pathFailed = false;
					let failedSegment = '';
					for (const part of pathParts) {
						if (currentData && typeof currentData === 'object' && part in currentData) {
							currentData = currentData[part];
						} else {
							pathFailed = true;
							failedSegment = part;
							currentData = null;
							break;
						}
					}

					if (pathFailed) {
						jsonData = {
							_pathError: true,
							error: `JSON path "${jsonPath}" failed at segment "${failedSegment}"`,
						} as any;
					} else {
						jsonData = currentData as IDataObject;
					}
				}
			}

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
