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
	createMarkdownGenerator,
	createTableExtractionStrategy,
	buildLlmConfig,
	isValidUrl,
} from '../../shared/utils';
import { formatCrawlResult } from '../helpers/formatters';
import {
	getBrowserSessionFields,
	getCrawlSettingsFields,
	getOutputFilteringFields,
} from '../../shared/descriptions';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'Crawl Mode',
		name: 'crawlMode',
		type: 'options',
		options: [
			{
				name: 'Manual URL List',
				value: 'manual',
				description: 'Provide an explicit list of URLs to crawl',
			},
			{
				name: 'Discover From Seed URL',
				value: 'discover',
				description: 'Start from a seed URL and recursively follow links matching your keywords',
			},
		],
		default: 'manual',
		displayOptions: {
			show: {
				operation: ['crawlMultipleUrls'],
			},
		},
	},
	{
		displayName: 'URLs',
		name: 'urls',
		type: 'string',
		typeOptions: {
			rows: 5,
		},
		required: true,
		default: '',
		placeholder: 'https://example.com\nhttps://example.org',
		description: 'URLs to crawl, one per line or comma-separated',
		displayOptions: {
			show: {
				operation: ['crawlMultipleUrls'],
				crawlMode: ['manual'],
			},
		},
	},
	{
		displayName: 'Seed URL',
		name: 'seedUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com',
		description: 'Starting URL for discovery. The crawler will follow links from here.',
		displayOptions: {
			show: {
				operation: ['crawlMultipleUrls'],
				crawlMode: ['discover'],
			},
		},
	},
	{
		displayName: 'Discovery Query',
		name: 'query',
		type: 'string',
		default: '',
		placeholder: 'pricing features documentation',
		description: 'Keywords that guide which links to follow. Required for Best-First strategy.',
		displayOptions: {
			show: {
				operation: ['crawlMultipleUrls'],
				crawlMode: ['discover'],
			},
		},
	},
	{
		displayName: 'Discovery Strategy',
		name: 'discoveryStrategy',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['crawlMultipleUrls'],
				crawlMode: ['discover'],
			},
		},
		options: [
			{
				displayName: 'Crawl Strategy',
				name: 'crawlStrategy',
				type: 'options',
				options: [
					{
						name: 'Best-First (Recommended)',
						value: 'BestFirstCrawlingStrategy',
						description: 'Visit highest-scoring pages first. Best for finding relevant content quickly.',
					},
					{
						name: 'Breadth-First Search (BFS)',
						value: 'BFSDeepCrawlStrategy',
						description: 'Explore all pages at each depth before going deeper. Best for comprehensive coverage.',
					},
					{
						name: 'Depth-First Search (DFS)',
						value: 'DFSDeepCrawlStrategy',
						description: 'Follow each path to its deepest point before backtracking.',
					},
				],
				default: 'BestFirstCrawlingStrategy',
				description: 'Strategy for discovering and following links',
			},
			{
				displayName: 'Exclude Domains',
				name: 'excludeDomains',
				type: 'string',
				default: '',
				placeholder: 'ads.example.com, tracking.example.com',
				description: 'Comma-separated domains to exclude from crawling',
			},
			{
				displayName: 'Exclude Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: '*/login/*, */admin/*, *.pdf',
				description: 'Comma-separated URL patterns to exclude (wildcards supported)',
			},
			{
				displayName: 'Include External',
				name: 'includeExternal',
				type: 'boolean',
				default: false,
				description: 'Whether to follow links to external domains',
			},
			{
				displayName: 'Include Patterns',
				name: 'includePatterns',
				type: 'string',
				default: '',
				placeholder: '*/products/*, */blog/*',
				description: 'Comma-separated URL patterns to include (wildcards supported)',
			},
			{
				displayName: 'Max Depth',
				name: 'maxDepth',
				type: 'number',
				default: 2,
				description: 'Maximum link-following depth (1-5)',
			},
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				default: 50,
				description: 'Maximum number of pages to crawl (1-200)',
			},
			{
				displayName: 'Prefetch',
				name: 'prefetch',
				type: 'boolean',
				default: false,
				description: 'Whether to enable fast URL discovery pre-fetch mode (0.8.0)',
			},
			{
				displayName: 'Result Limit',
				name: 'resultLimit',
				type: 'number',
				default: 0,
				description: 'Maximum number of results to return (0 = unlimited)',
			},
			{
				displayName: 'Resume State (JSON)',
				name: 'resumeState',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				placeholder: '{"visited_urls": [...], "queue": [...]}',
				description: 'JSON state from a previous crawl to resume from',
			},
		],
	},
	...getBrowserSessionFields(['crawlMultipleUrls']),
	...getCrawlSettingsFields(['crawlMultipleUrls']),
	...getOutputFilteringFields(['crawlMultipleUrls']),
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
			const crawlMode = this.getNodeParameter('crawlMode', i, 'manual') as string;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;
			const of = this.getNodeParameter('outputFiltering', i, {}) as IDataObject;

			// Build config from shared collections
			const config: CrawlerRunConfig = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig(cs),
				screenshot: of.screenshot as boolean,
				pdf: of.pdf as boolean,
				fetchSslCertificate: of.fetchSslCertificate as boolean,
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

			let urls: string[] = [];
			let effectiveResultLimit = 0;

			if (crawlMode === 'manual') {
				const urlsString = this.getNodeParameter('urls', i, '') as string;
				if (!urlsString) {
					throw new NodeOperationError(this.getNode(), 'URLs cannot be empty.', { itemIndex: i });
				}

				urls = urlsString
					.split(/[\n,]/)
					.map((u) => u.trim())
					.filter((u) => u.length > 0);

				if (urls.length === 0) {
					throw new NodeOperationError(this.getNode(), 'No valid URLs provided.', { itemIndex: i });
				}

				const invalidUrls = urls.filter((u) => !isValidUrl(u));
				if (invalidUrls.length > 0) {
					throw new NodeOperationError(
						this.getNode(),
						`Invalid URLs: ${invalidUrls.join(', ')}`,
						{ itemIndex: i },
					);
				}
			} else {
				// discover mode
				const seedUrl = String(this.getNodeParameter('seedUrl', i, '')).trim();
				const query = String(this.getNodeParameter('query', i, '')).trim();
				const ds = this.getNodeParameter('discoveryStrategy', i, {}) as IDataObject;

				if (!seedUrl) {
					throw new NodeOperationError(this.getNode(), 'Seed URL is required for discovery mode.', { itemIndex: i });
				}
				if (!isValidUrl(seedUrl)) {
					throw new NodeOperationError(this.getNode(), `Invalid Seed URL: ${seedUrl}`, { itemIndex: i });
				}
				if (!query) {
					throw new NodeOperationError(this.getNode(), 'Discovery query cannot be empty.', { itemIndex: i });
				}

				const maxDepth = Math.min(Math.max(Number(ds.maxDepth ?? 2), 1), 5);
				const maxPages = Math.min(Math.max(Number(ds.maxPages ?? 50), 1), 200);
				const includeExternal = ds.includeExternal === true;

				// Parse comma-separated patterns
				const parseList = (raw: string | string[] | undefined): string[] => {
					if (Array.isArray(raw)) return raw;
					if (typeof raw === 'string') {
						return raw.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
					}
					return [];
				};

				const includePatterns = parseList(ds.includePatterns as string | string[] | undefined);
				const excludePatterns = parseList(ds.excludePatterns as string | string[] | undefined);
				const excludeDomains = parseList(ds.excludeDomains as string | string[] | undefined);

				// Build filter chain
				const filters: IDataObject[] = [];

				if (excludeDomains.length > 0) {
					filters.push({
						type: 'DomainFilter',
						params: { blocked_domains: excludeDomains },
					});
				}

				if (excludePatterns.length > 0) {
					filters.push({
						type: 'URLPatternFilter',
						params: { patterns: excludePatterns, reverse: true },
					});
				}

				if (includePatterns.length > 0) {
					filters.push({
						type: 'URLPatternFilter',
						params: { patterns: includePatterns, reverse: false },
					});
				}

				// Build keyword scorer
				const urlScorer = query
					? {
						type: 'KeywordRelevanceScorer',
						params: {
							keywords: query.split(/\s+OR\s+|\s+/).filter((k) => k.trim()),
							weight: 1.0,
						},
					}
					: undefined;

				const strategyType = String(ds.crawlStrategy ?? 'BestFirstCrawlingStrategy');

				const strategyParams: IDataObject = {
					max_depth: maxDepth,
					max_pages: maxPages,
					include_external: includeExternal,
					...(filters.length > 0
						? {
							filter_chain: {
								type: 'FilterChain',
								params: { filters },
							},
						}
						: {}),
					...(urlScorer ? { url_scorer: urlScorer } : {}),
				};

				config.deepCrawlStrategy = {
					type: strategyType,
					params: strategyParams,
				};

				if (ds.prefetch === true) {
					config.prefetch = true;
				}

				if (ds.resumeState && typeof ds.resumeState === 'string' && ds.resumeState.trim()) {
					try {
						const resumeObj = JSON.parse(ds.resumeState.trim());
						(config.deepCrawlStrategy as any).params.resume_state = resumeObj;
					} catch (e) {
						throw new NodeOperationError(
							this.getNode(),
							`Invalid Resume State JSON: ${(e as Error).message}`,
							{ itemIndex: i },
						);
					}
				}

				urls = [seedUrl];
				effectiveResultLimit = Math.max(Number(ds.resultLimit ?? 0), 0);
			}

			const crawler = await getCrawl4aiClient(this);
			const results = await crawler.crawlMultipleUrls(urls, config);

			const limitedResults = effectiveResultLimit > 0 ? results.slice(0, effectiveResultLimit) : results;

			const fetchedAt = new Date().toISOString();
			for (const result of limitedResults) {
				const formattedResult = formatCrawlResult(result, {
					cacheMode: cs.cacheMode as string | undefined,
					includeHtml: of.verbose as boolean,
					includeLinks: of.includeLinks !== false,
					includeMedia: of.includeMedia as boolean,
					includeScreenshot: of.screenshot as boolean,
					includePdf: of.pdf as boolean,
					includeSslCertificate: of.fetchSslCertificate as boolean,
					includeTables: of.includeTables as boolean,
					fetchedAt,
				});

				allResults.push({
					json: formattedResult,
					pairedItem: { item: i },
				});
			}
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
