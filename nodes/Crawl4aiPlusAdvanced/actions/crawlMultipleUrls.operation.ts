import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, FullCrawlConfig } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createCrawlerRunConfig,
	applyOutputFilteringConfig,
	isValidUrl,
} from '../../shared/utils';
import { formatCrawlResult } from '../helpers/formatters';
import { parseDenylist, filterUrlsAgainstDenylist } from '../../shared/urlSafety';
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
						description: 'Follow each path to its deepest point before backtracking',
					},
				],
				default: 'BFSDeepCrawlStrategy',
				description: 'Strategy for discovering and following links',
			},
			{
				displayName: 'Denylist Paths',
				name: 'denylistPaths',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				placeholder: '/path/to/block\n/another/path\n*/pattern/*',
				description: 'Paths or URL patterns to never crawl — one per line, supports * wildcards. Applied to both discover and manual modes.',
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
				default: 3,
				description: 'Maximum link-following depth (1-5)',
			},
			{
				displayName: 'Max Links Per Page',
				name: 'maxLinksPerPage',
				type: 'number',
				default: 50,
				description: 'Maximum number of links to follow per page',
			},
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				default: 100,
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
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];
	const crawler = await getCrawl4aiClient(this);

	for (let i = 0; i < items.length; i++) {
		try {
			const crawlMode = this.getNodeParameter('crawlMode', i, 'manual') as string;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;
			const of = this.getNodeParameter('outputFiltering', i, {}) as IDataObject;
			const ds = this.getNodeParameter('discoveryStrategy', i, {}) as IDataObject;
			let blockedByDenylist: string[] = [];

			// Build config from shared collections
			const config: FullCrawlConfig = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig(cs),
				screenshot: of.screenshot as boolean,
				pdf: of.pdf as boolean,
				fetchSslCertificate: of.fetchSslCertificate as boolean,
				...(of.verbose === true ? { verbose: true } : {}),
			};

			// Apply content filter and table extraction from output filtering
			const filteringConfig = await applyOutputFilteringConfig(of, this, i);
			if (filteringConfig.markdownGenerator) {
				config.markdownGenerator = filteringConfig.markdownGenerator;
			}
			if (filteringConfig.tableExtraction) {
				config.tableExtraction = filteringConfig.tableExtraction;
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

				// Apply denylist to manual URL list before sending to API
				const manualDenylist = parseDenylist(ds.denylistPaths as string | undefined);
				if (manualDenylist.length > 0) {
					const { safeUrls, blockedUrls } = filterUrlsAgainstDenylist(urls, manualDenylist);
					blockedByDenylist = blockedUrls;
					urls = safeUrls;
					if (urls.length === 0) {
						throw new NodeOperationError(
							this.getNode(),
							`All provided URLs were blocked by the denylist (${blockedUrls.length} URL(s) blocked).`,
							{ itemIndex: i },
						);
					}
				}
			} else {
				// discover mode
				const seedUrl = String(this.getNodeParameter('seedUrl', i, '')).trim();
				const query = String(this.getNodeParameter('query', i, '')).trim();

				if (!seedUrl) {
					throw new NodeOperationError(this.getNode(), 'Seed URL is required for discovery mode.', { itemIndex: i });
				}
				if (!isValidUrl(seedUrl)) {
					throw new NodeOperationError(this.getNode(), `Invalid Seed URL: ${seedUrl}`, { itemIndex: i });
				}
				const strategyType = String(ds.crawlStrategy ?? 'BFSDeepCrawlStrategy');

				if (!query && strategyType === 'BestFirstCrawlingStrategy') {
					throw new NodeOperationError(this.getNode(), 'Discovery query is required for Best-First strategy.', { itemIndex: i });
				}

				const maxDepth = Math.min(Math.max(Number(ds.maxDepth ?? 3), 1), 5);
				const maxPages = Math.min(Math.max(Number(ds.maxPages ?? 100), 1), 200);
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

				const denylistPaths = parseDenylist(ds.denylistPaths as string | undefined);
				const allExcludePatterns = [...excludePatterns, ...denylistPaths];

				if (allExcludePatterns.length > 0) {
					filters.push({
						type: 'URLPatternFilter',
						params: { patterns: allExcludePatterns, reverse: true },
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

				const maxLinksPerPage = Number(ds.maxLinksPerPage ?? 50);

				const strategyParams: IDataObject = {
					max_depth: maxDepth,
					max_pages: maxPages,
					max_links: maxLinksPerPage,
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
					params: strategyParams as Record<string, unknown>,
				};

				if (ds.prefetch === true) {
					config.prefetch = true;
				}

				if (ds.resumeState && typeof ds.resumeState === 'string' && ds.resumeState.trim()) {
					try {
						const resumeObj = JSON.parse(ds.resumeState.trim());
						config.deepCrawlStrategy!.params.resume_state = resumeObj;
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

			const results = await crawler.crawlMultipleUrls(urls, config);

			const limitedResults = effectiveResultLimit > 0 ? results.slice(0, effectiveResultLimit) : results;

			if (limitedResults.length === 0) {
				allResults.push({
					json: {
						success: false,
						error: 'Crawl returned no results. The URLs may be inaccessible or blocked.',
						...(blockedByDenylist.length > 0 ? { blockedByDenylist } : {}),
					},
					pairedItem: { item: i },
				});
				continue;
			}

			const fetchedAt = new Date().toISOString();
			let safetyAttached = false;
			for (const result of limitedResults) {
				const formattedResult = formatCrawlResult(result, {
					cacheMode: cs.cacheMode as string | undefined,
					markdownOutput: (of.markdownOutput as 'raw' | 'fit' | 'both') || 'both',
					includeHtml: of.includeHtml === true,
					includeLinks: of.includeLinks !== false,
					includeMedia: of.includeMedia as boolean,
					includeScreenshot: of.screenshot as boolean,
					includePdf: of.pdf as boolean,
					includeSslCertificate: of.fetchSslCertificate as boolean,
					includeTables: of.includeTables as boolean,
					fetchedAt,
				});

				if (blockedByDenylist.length > 0 && !safetyAttached) {
					(formattedResult as IDataObject)._safetyFilter = {
						blockedUrls: blockedByDenylist,
						blockedCount: blockedByDenylist.length,
					};
					safetyAttached = true;
				}

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
