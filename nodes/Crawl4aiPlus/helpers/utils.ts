import { IDataObject } from 'n8n-workflow';
import { Crawl4aiClient } from '../../shared/apiClient';
import { CrawlerRunConfig, CrawlResult } from '../../shared/interfaces';

// Re-export shared utilities needed by operations
export {
	getCrawl4aiClient,
	buildLlmConfig,
	validateLlmCredentials,
	createLlmExtractionStrategy,
	createCssSelectorExtractionStrategy,
} from '../../shared/utils';

/**
 * Default config values for the simple node.
 * Field names match CrawlerRunConfig (camelCase).
 * browserType and javaScriptEnabled are passed through to the API client
 * which reads them as extra properties on the config object.
 */
export function getSimpleDefaults(): Partial<CrawlerRunConfig> {
	return {
		headless: true,
		browserType: 'chromium',
		javaScriptEnabled: true,
		viewportWidth: 1280,
		viewportHeight: 800,
	} as Partial<CrawlerRunConfig>;
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
 * Build a BFSDeepCrawlStrategy config for multi-page crawls
 */
export function buildDeepCrawlStrategy(
	scope: 'followLinks' | 'fullSite',
	maxPages: number,
	seedUrl: string,
	excludePatterns?: string,
): IDataObject {
	const maxDepth = scope === 'followLinks' ? 1 : 3;

	// Build filter chain
	const filters: IDataObject[] = [];

	// Same-domain filter using seed URL
	try {
		const seedDomain = new URL(seedUrl).hostname;
		if (seedDomain) {
			filters.push({
				type: 'URLPatternFilter',
				params: {
					patterns: [`*${seedDomain}*`],
				},
			});
		}
	} catch {
		// skip domain filter if URL is invalid
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
				reverse: true, // Block if match
			},
		});
	}

	const strategyParams: IDataObject = {
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

	return {
		type: 'BFSDeepCrawlStrategy',
		params: strategyParams,
	};
}

/**
 * Execute a crawl at the given scope, returning an array of results regardless of scope.
 * Single-page crawls wrap the result in an array for consistent downstream handling.
 */
export async function executeCrawl(
	client: Crawl4aiClient,
	url: string,
	scope: 'singlePage' | 'followLinks' | 'fullSite',
	config: CrawlerRunConfig,
	options: {
		maxPages?: number;
		excludePatterns?: string;
	} = {},
): Promise<CrawlResult[]> {
	if (scope === 'singlePage') {
		const result = await client.crawlUrl(url, config);
		return [result];
	}

	// Multi-page crawl
	const defaultMaxPages = scope === 'followLinks' ? 10 : 50;
	const maxPages = options.maxPages ?? defaultMaxPages;

	const deepCrawlStrategy = buildDeepCrawlStrategy(
		scope,
		maxPages,
		url,
		options.excludePatterns,
	);

	const multiConfig: CrawlerRunConfig = {
		...config,
		deepCrawlStrategy: deepCrawlStrategy as Record<string, any>,
	};

	let results = await client.crawlMultipleUrls([url], multiConfig);

	// Client-side dedup
	results = deduplicateResults(results);

	return results;
}
