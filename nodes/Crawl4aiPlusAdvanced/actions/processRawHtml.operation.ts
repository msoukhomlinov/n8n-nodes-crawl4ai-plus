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
	createCrawlerRunConfig,
	createMarkdownGenerator,
	createTableExtractionStrategy,
	buildLlmConfig,
} from '../../shared/utils';
import { formatCrawlResult } from '../helpers/formatters';
import {
	getCrawlSettingsFields,
	getOutputFilteringFields,
} from '../../shared/descriptions';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'HTML Content',
		name: 'html',
		type: 'string',
		typeOptions: {
			rows: 8,
		},
		required: true,
		default: '',
		placeholder: '<html><body><h1>Example</h1><p>Content</p></body></html>',
		description: 'The raw HTML content to process. Maximum size: 5MB.',
		displayOptions: {
			show: {
				operation: ['processRawHtml'],
			},
		},
	},
	{
		displayName: 'Base URL',
		name: 'baseUrl',
		type: 'string',
		default: 'https://example.com',
		description: 'The base URL to use for resolving relative links',
		displayOptions: {
			show: {
				operation: ['processRawHtml'],
			},
		},
	},
	...getCrawlSettingsFields(['processRawHtml']),
	...getOutputFilteringFields(['processRawHtml']),
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
			const html = this.getNodeParameter('html', i, '') as string;
			const baseUrl = this.getNodeParameter('baseUrl', i, 'https://example.com') as string;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;
			const of = this.getNodeParameter('outputFiltering', i, {}) as IDataObject;

			if (!html) {
				throw new NodeOperationError(this.getNode(), 'HTML content cannot be empty.', { itemIndex: i });
			}

			// Build config from crawl settings (no browser session for raw HTML)
			const config: CrawlerRunConfig = {
				...createCrawlerRunConfig(cs),
			};

			// Content filter -> markdown generator
			if (of.contentFilter && of.contentFilter !== 'none') {
				const filterConfig: IDataObject = { filterType: of.contentFilter };

				if (of.contentFilter === 'pruning') {
					if (of.threshold !== undefined) filterConfig.threshold = of.threshold;
					if (of.thresholdType) filterConfig.thresholdType = of.thresholdType;
					if (of.minWordThreshold !== undefined) filterConfig.minWordThreshold = of.minWordThreshold;
				} else if (of.contentFilter === 'bm25') {
					filterConfig.userQuery = of.userQuery || '';
					if (of.bm25Threshold !== undefined) filterConfig.bm25Threshold = of.bm25Threshold;
				} else if (of.contentFilter === 'llm') {
					const credentials = await this.getCredentials('crawl4aiPlusApi') as any;
					if (!credentials.enableLlm) {
						throw new NodeOperationError(
							this.getNode(),
							'LLM features must be enabled in Crawl4AI credentials to use LLM content filtering.',
							{ itemIndex: i },
						);
					}
					const { llmConfig } = buildLlmConfig(credentials);
					filterConfig.llmConfig = llmConfig;
					filterConfig.llmInstruction = of.llmInstruction || '';
					if (of.chunkTokenThreshold !== undefined) filterConfig.chunkTokenThreshold = of.chunkTokenThreshold;
					if (of.llmVerbose !== undefined) filterConfig.llmVerbose = of.llmVerbose;
				}

				config.markdownGenerator = createMarkdownGenerator(filterConfig);
			}

			// Table extraction
			if (of.tableExtraction && of.tableExtraction !== 'none') {
				const tableConfig: IDataObject = { strategyType: of.tableExtraction };

				if (of.tableExtraction === 'default') {
					if (of.tableScoreThreshold !== undefined) tableConfig.tableScoreThreshold = of.tableScoreThreshold;
					if (of.tableVerbose !== undefined) tableConfig.verbose = of.tableVerbose;
				} else if (of.tableExtraction === 'llm') {
					const credentials = await this.getCredentials('crawl4aiPlusApi') as any;
					if (!credentials.enableLlm) {
						throw new NodeOperationError(
							this.getNode(),
							'LLM features must be enabled in Crawl4AI credentials to use LLM table extraction.',
							{ itemIndex: i },
						);
					}
					const { llmConfig } = buildLlmConfig(credentials);
					tableConfig.llmConfig = llmConfig;
					if (of.tableCssSelector) tableConfig.cssSelector = of.tableCssSelector;
					if (of.tableMaxTries !== undefined) tableConfig.maxTries = of.tableMaxTries;
					if (of.tableEnableChunking !== undefined) tableConfig.enableChunking = of.tableEnableChunking;
					if (of.tableChunkTokenThreshold !== undefined) tableConfig.chunkTokenThreshold = of.tableChunkTokenThreshold;
					if (of.tableMinRowsPerChunk !== undefined) tableConfig.minRowsPerChunk = of.tableMinRowsPerChunk;
					if (of.tableMaxParallelChunks !== undefined) tableConfig.maxParallelChunks = of.tableMaxParallelChunks;
					if (of.tableLlmVerbose !== undefined) tableConfig.verbose = of.tableLlmVerbose;
				}

				config.tableExtraction = createTableExtractionStrategy(tableConfig);
			}

			const crawler = await getCrawl4aiClient(this);
			const fetchedAt = new Date().toISOString();
			const result = await crawler.processRawHtml(html, baseUrl, config);

			const formattedResult = formatCrawlResult(result, {
				includeHtml: of.verbose as boolean,
				includeLinks: of.includeLinks !== false,
				includeMedia: of.includeMedia as boolean,
				includeTables: of.includeTables as boolean,
				fetchedAt,
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
