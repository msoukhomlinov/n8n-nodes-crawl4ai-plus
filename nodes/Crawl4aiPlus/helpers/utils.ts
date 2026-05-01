import { IDataObject, INode, NodeOperationError } from 'n8n-workflow';
import { Crawl4aiClient } from '../../shared/apiClient';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DeepCrawlStrategy, ExtractionStrategy, FullCrawlConfig, CrawlResult } from '../../shared/interfaces';

// Re-export shared utilities needed by operations
export {
	getCrawl4aiClient,
	buildLlmConfig,
	validateLlmCredentials,
	createLlmExtractionStrategy,
	createCssSelectorExtractionStrategy,
	resolveRequestHeaders,
} from '../../shared/utils';

export interface SmartUrlSelectionMeta {
	enabled: true;
	seedUrl: string;
	candidatesFound: number;
	directUrls: string[];
	exploreSections: Array<{ url: string; reason: string }>;
	finalUrlsCrawled: string[];
	warnings: string[];
}

/**
 * Validate that a URL is non-empty and uses http/https protocol.
 * Throws NodeOperationError with a human-readable message on failure.
 */
export function assertValidHttpUrl(url: string, node: INode, itemIndex: number): void {
	if (!url) {
		throw new NodeOperationError(node, 'URL cannot be empty.', { itemIndex });
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new NodeOperationError(node, `Invalid URL: "${url}" — check for typos (e.g. missing or extra characters in "https://").`, { itemIndex });
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new NodeOperationError(
			node,
			`URL must use http or https — got "${parsed.protocol.replace(':', '')}" instead. Check for typos in the URL.`,
			{ itemIndex },
		);
	}
}

/**
 * Default config values for the simple node.
 * Field names match CrawlerRunConfig (camelCase).
 * browserType and javaScriptEnabled are passed through to the API client
 * which reads them as extra properties on the config object.
 */
export function getSimpleDefaults(): Partial<FullCrawlConfig> {
	return {
		headless: true,
		browserType: 'chromium',
		java_script_enabled: true,
		viewport: { width: 1280, height: 800 },
		pageTimeout: 30000,
	};
}

/**
 * Normalize URL by stripping tracking params and fragments for dedup comparison
 */
export function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		// Remove tracking/sorting params
		const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
			'fbclid', 'gclid', 'sort', 'order'];
		for (const param of paramsToRemove) {
			parsed.searchParams.delete(param);
		}
		// Also remove any utm_* params not in the explicit list
		const allKeys = [...parsed.searchParams.keys()];
		for (const key of allKeys) {
			if (key.startsWith('utm_')) {
				parsed.searchParams.delete(key);
			}
		}
		// Strip fragment
		parsed.hash = '';
		// Normalize trailing slash
		let normalized = parsed.toString();
		normalized = normalized.replace(/\/+$/, '');
		return normalized;
	} catch {
		return url;
	}
}

/**
 * Deduplicate crawl results by normalized URL, keeping first occurrence
 */
export function deduplicateResults(results: CrawlResult[]): CrawlResult[] {
	const seen = new Set<string>();
	return results.filter((result) => {
		const key = normalizeUrl(result.url);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** Default URL patterns auto-excluded for smart dedup */
const SMART_DEDUP_EXCLUDE_PATTERNS = [
	'*?sort=*',
	'*?order=*',
	'*?orderby=*',
	'*?ref=*',
	'*?utm_*',
	'*?fbclid=*',
	'*?gclid=*',
	'*#*',
];

/**
 * Build a deep crawl strategy config.
 * Uses BestFirstCrawlingStrategy with KeywordRelevanceScorer when keywords are provided;
 * falls back to BFSDeepCrawlStrategy for generic crawls.
 */
export function buildDeepCrawlStrategy(
	scope: 'followLinks' | 'fullSite',
	maxPages: number,
	seedUrl: string,
	excludePatterns?: string,
	keywords?: string[],
	maxDepthOverride?: number,
): DeepCrawlStrategy {
	const maxDepth = maxDepthOverride ?? (scope === 'followLinks' ? 1 : 3);

	// Build filter chain
	const filters: IDataObject[] = [];

	// Same-domain filter using seed URL
	const seedDomain = new URL(seedUrl).hostname;
	if (seedDomain) {
		filters.push({
			type: 'URLPatternFilter',
			params: {
				patterns: [`*${seedDomain}*`],
			},
		});
	}

	// Combine exclude patterns with smart dedup defaults
	const allExcludePatterns: string[] = [...SMART_DEDUP_EXCLUDE_PATTERNS];

	if (excludePatterns) {
		const userPatterns = excludePatterns
			.split(',')
			.map((p) => p.trim())
			.filter((p) => p.length > 0);
		allExcludePatterns.push(...userPatterns);
	}

	if (allExcludePatterns.length > 0) {
		filters.push({
			type: 'URLPatternFilter',
			params: {
				patterns: allExcludePatterns,
				reverse: true,
			},
		});
	}

	const strategyParams: Record<string, unknown> = {
		max_depth: maxDepth,
		max_pages: maxPages,
		...(filters.length > 0
			? {
					filter_chain: {
						type: 'FilterChain',
						params: { filters },
					},
				}
			: {}),
	};

	if (keywords && keywords.length > 0) {
		strategyParams.url_scorer = {
			type: 'KeywordRelevanceScorer',
			params: { keywords, weight: 1.0 },
		};
		return { type: 'BestFirstCrawlingStrategy', params: strategyParams };
	}

	return { type: 'BFSDeepCrawlStrategy', params: strategyParams };
}

/**
 * Execute a crawl at the given scope, returning an array of results regardless of scope.
 * Single-page crawls wrap the result in an array for consistent downstream handling.
 */
export async function executeCrawl(
	client: Crawl4aiClient,
	url: string,
	scope: 'singlePage' | 'followLinks' | 'fullSite',
	config: FullCrawlConfig,
	options: {
		maxPages?: number;
		excludePatterns?: string;
		keywords?: string[];
	} = {},
): Promise<CrawlResult[]> {
	if (scope === 'singlePage') {
		const result = await client.crawlUrl(url, config);
		return [result];
	}

	// Multi-page crawl
	const defaultMaxPages = 10;
	const maxPages = options.maxPages ?? defaultMaxPages;

	const deepCrawlStrategy = buildDeepCrawlStrategy(
		scope,
		maxPages,
		url,
		options.excludePatterns,
		options.keywords,
	);

	const multiConfig: FullCrawlConfig = {
		...config,
		deepCrawlStrategy,
	};

	let results = await client.crawlMultipleUrls([url], multiConfig);

	// Client-side dedup
	results = deduplicateResults(results);

	return results;
}
