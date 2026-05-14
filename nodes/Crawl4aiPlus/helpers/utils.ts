import { IDataObject, INode, NodeOperationError } from 'n8n-workflow';
import { Crawl4aiClient } from '../../shared/apiClient';
import { DeepCrawlStrategy, ExtractionStrategy, FullCrawlConfig, CrawlResult } from '../../shared/interfaces';
import { createLlmExtractionStrategy, normalizeUrlProtocol } from '../../shared/utils';

// Re-export shared utilities needed by operations
export {
	getCrawl4aiClient,
	buildLlmConfig,
	validateLlmCredentials,
	createCssSelectorExtractionStrategy,
	resolveRequestHeaders,
} from '../../shared/utils';
export { createLlmExtractionStrategy };

export interface SmartUrlSelectionMeta {
	enabled: true;
	seedUrl: string;
	seedRedirectedUrl?: string;
	seedStatusCode?: number;
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
export function assertValidHttpUrl(url: string, node: INode, itemIndex: number): string {
	if (!url || !url.trim()) {
		throw new NodeOperationError(node, 'URL cannot be empty.', { itemIndex });
	}
	const normalized = normalizeUrlProtocol(url);
	let parsed: URL;
	try {
		parsed = new URL(normalized);
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
	return normalized;
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

const SKIP_LINK_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|pdf|zip|woff|woff2|ttf|eot)$/i;
const SKIP_LINK_PATHS = ['/cdn-cgi/', '/wp-content/'];

export function extractLinksFromSeedResult(
	result: CrawlResult,
	seedUrl: string,
): Array<{ url: string; anchorText: string }> {
	let seedHostname: string;
	try {
		seedHostname = new URL(seedUrl).hostname;
	} catch {
		return [];
	}

	// Accept links from the final URL's hostname — handles www-redirects
	// e.g. input "holmesglen.edu.au" redirects to "www.holmesglen.edu.au";
	// result.url = requested URL, result.redirected_url = final URL after redirect
	const allowedHostnames = new Set<string>([seedHostname]);
	if (result.redirected_url) {
		try {
			allowedHostnames.add(new URL(result.redirected_url).hostname);
		} catch { /* ignore malformed redirected_url */ }
	}
	// www-normalisation: add www.X when X given, or X when www.X given
	if (seedHostname.startsWith('www.')) {
		allowedHostnames.add(seedHostname.slice(4));
	} else {
		allowedHostnames.add(`www.${seedHostname}`);
	}

	const seen = new Set<string>();
	const candidates: Array<{ url: string; anchorText: string }> = [];

	function addCandidate(href: string, text: string): void {
		try {
			const parsed = new URL(href);
			if (!allowedHostnames.has(parsed.hostname)) return;
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
			if (SKIP_LINK_EXTENSIONS.test(parsed.pathname)) return;
			if (SKIP_LINK_PATHS.some((p) => parsed.pathname.includes(p))) return;
			const normalised = normalizeUrl(href);
			if (seen.has(normalised)) return;
			seen.add(normalised);
			candidates.push({ url: href, anchorText: text.trim() });
		} catch {
			// skip malformed URLs
		}
	}

	if (result.links?.internal && result.links.internal.length > 0) {
		for (const link of result.links.internal) {
			addCandidate(link.href, link.text || '');
		}
	} else {
		// Fallback: regex over raw_markdown
		let markdown = '';
		if (typeof result.markdown === 'object' && result.markdown !== null) {
			markdown = result.markdown.raw_markdown || '';
		} else if (typeof result.markdown === 'string') {
			markdown = result.markdown;
		}
		const LINK_REGEX = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
		let match: RegExpExecArray | null;
		while ((match = LINK_REGEX.exec(markdown)) !== null) {
			addCandidate(match[2], match[1]);
		}
	}

	return candidates.slice(0, 200);
}

export function buildUrlSelectionSchema(): IDataObject {
	return {
		type: 'object',
		properties: {
			directUrls: {
				type: 'array',
				items: { type: 'string' },
				description: 'URLs from the candidates list to crawl directly — clearly relevant to the extraction goal',
			},
			exploreSections: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						url: { type: 'string' },
						reason: { type: 'string' },
					},
					required: ['url', 'reason'],
				},
				description: 'Section URLs worth crawling one level deeper to find relevant sub-pages',
			},
		},
		required: ['directUrls', 'exploreSections'],
	} as IDataObject;
}

export function buildUrlSelectionPrompt(
	seedUrl: string,
	extractionContext: string,
	maxPages: number,
	candidates: Array<{ url: string; anchorText: string }>,
): string {
	const candidateList = candidates
		.map((c) => `${c.url} | ${c.anchorText || '(no anchor text)'}`)
		.join('\n');
	return `You are a URL relevance analyst. Given a list of links from ${seedUrl}, select the URLs most likely to contain: ${extractionContext}.

Rules:
- directUrls: exact URLs from the candidate list that are clearly and directly relevant
- exploreSections: section index URLs (e.g. /about/, /locations/) where relevant content is likely one level deeper — only include if the exact target page is not already in directUrls
- Only use URLs from the provided candidate list — do not invent or guess URLs
- Total directUrls + exploreSections must not exceed ${maxPages}
- If no relevant URLs are found, return empty arrays

Candidate links (url | anchor text):
${candidateList}`;
}

interface LlmUrlSelectionResponse {
	directUrls: string[];
	exploreSections: Array<{ url: string; reason: string }>;
}

interface LlmSelectionOptions {
	extractionContext: string;
	exploreDepth: number;
	provider: string;
	apiKey: string;
	baseUrl: string | undefined;
	keywords?: string[];
	finalExtractionStrategy?: ExtractionStrategy;
}

interface SmartUrlCrawlResult {
	results: CrawlResult[];
	meta: SmartUrlSelectionMeta;
}

export async function executeSmartUrlCrawl(
	client: Crawl4aiClient,
	url: string,
	config: FullCrawlConfig,
	options: { maxPages?: number; excludePatterns?: string },
	llmSelectionOptions: LlmSelectionOptions,
	node: INode,
	itemIndex: number,
): Promise<SmartUrlCrawlResult> {
	const maxPages = options.maxPages ?? 10;
	const {
		extractionContext,
		exploreDepth,
		provider,
		apiKey,
		baseUrl,
		keywords,
		finalExtractionStrategy,
	} = llmSelectionOptions;
	const warnings: string[] = [];

	// Strip extraction + deep crawl strategies — seed crawl is plain single-page
	const extendedConfig = config as FullCrawlConfig & {
		extractionStrategy?: ExtractionStrategy;
		deepCrawlStrategy?: DeepCrawlStrategy;
	};
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { extractionStrategy: _es, deepCrawlStrategy: _dcs, ...seedConfigRest } = extendedConfig;

	// Hardening rationale:
	//   - LiteSpeed Cache "Delay JS Until Interaction": all <script> tags use
	//     type="litespeed/javascript" and only execute after a UI event fires on window.
	//     WP-Rocket, Perfmatters, and Flying Scripts follow the same pattern.
	//   - Yoast SEO + Google Tag Manager emit nested <noscript><iframe><noscript>... which
	//     lxml parses as children of the outer noscript, swallowing the entire <body>.
	//     Crawl4AI then strips noscript before link extraction and the body disappears.
	// jsCode (runs after page load, before page.content() is captured):
	//   1. Force LiteSpeed's delayed-JS loader to run now
	//   2. Dispatch the UI events other delay-JS plugins listen for
	//   3. Wait for the now-loaded scripts to mutate the DOM
	//   4. Remove <noscript> elements so lxml never sees the malformed nesting
	//
	// jsCode + delayBeforeReturnHtml apply to ALL crawls in this function (seed,
	// LLM URL selection, explore mini-crawls, final extraction crawl) because every
	// sub-page of a LiteSpeed/Yoast site exhibits the same pattern — if hardening
	// only ran on the seed, the final crawls would return 1-char markdown and every
	// downstream extraction (orgName, aboutOrg, custom, locations, emails) would
	// receive empty input.
	//
	// waitUntil rewrite ('commit' -> 'load') is SEED-ONLY via hardenedSeedConfig.
	// Anti-Bot mode sets waitUntil='commit' to dodge Playwright CDP races on
	// Cloudflare redirect chains; that safeguard must reach the actual target pages.
	const userJsCode = seedConfigRest.jsCode;
	const userJsCodeArray = Array.isArray(userJsCode)
		? userJsCode
		: userJsCode
			? [userJsCode]
			: [];
	const hardeningJsCode: string[] = [
		"if (typeof litespeed_load_delayed_js_force === 'function') { litespeed_load_delayed_js_force(); }",
		"['mouseover','click','keydown','wheel','touchstart','scroll'].forEach(function(ev){ window.dispatchEvent(new Event(ev, {bubbles:true})); });",
		"await new Promise(function(r){ setTimeout(r, 1500); });",
		"document.querySelectorAll('noscript').forEach(function(n){ n.remove(); });",
	];

	const seedConfig: FullCrawlConfig = {
		...seedConfigRest,
		// At least 3 s — enough for deferred scripts to load and execute
		delayBeforeReturnHtml: Math.max(seedConfigRest.delayBeforeReturnHtml ?? 0, 3),
		jsCode: [...hardeningJsCode, ...userJsCodeArray],
	};

	const hardenedSeedConfig: FullCrawlConfig = {
		...seedConfig,
		// 'commit' (set by Anti-Bot mode for Cloudflare redirect handling) returns before
		// the DOM is ready for link extraction. Override for the seed only.
		waitUntil: seedConfig.waitUntil === 'commit' ? 'load' : (seedConfig.waitUntil ?? 'load'),
	};

	// 1. Seed crawl
	const seedResult = await client.crawlUrl(url, hardenedSeedConfig);
	if (!seedResult.success) {
		throw new NodeOperationError(
			node,
			`Smart URL selection: seed crawl failed — ${seedResult.error_message || 'unknown error'}`,
			{ itemIndex },
		);
	}

	// 2. Link extraction
	const candidates = extractLinksFromSeedResult(seedResult, url);
	if (candidates.length === 0) {
		const inputHostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
		const actualUrl = seedResult.redirected_url || seedResult.url || url;
		const actualHostname = (() => { try { return new URL(actualUrl).hostname; } catch { return actualUrl; } })();
		const internalApiCount = seedResult.links?.internal?.length ?? 0;
		const externalApiCount = seedResult.links?.external?.length ?? 0;
		const markdownLen = (
			typeof seedResult.markdown === 'object' && seedResult.markdown !== null
				? (seedResult.markdown as { raw_markdown?: string }).raw_markdown
				: typeof seedResult.markdown === 'string' ? seedResult.markdown : ''
		)?.length ?? 0;
		const redirected = inputHostname !== actualHostname;
		const hint = redirected
			? `Page redirected from ${inputHostname} to ${actualHostname} — www-redirects are handled automatically. If this error persists, try using the final URL (${actualUrl}) directly in the node.`
			: internalApiCount === 0 && markdownLen < 500
				? 'Seed page returned very little content — the site may require JavaScript rendering. Try enabling "Bypass Bot Detection" or set "Wait Until" to "Network Idle".'
				: internalApiCount === 0
					? 'The Crawl4AI API returned no internal links for this page. The site may block crawlers — try enabling "Bypass Bot Detection" or the Firefox browser type.'
					: `${internalApiCount} internal link(s) were present but none matched the allowed hostnames. This is unexpected — please report this URL.`;
		throw new NodeOperationError(
			node,
			`Smart URL selection: no same-domain links found on seed page.\n` +
			`Input URL: ${url} (hostname: ${inputHostname})\n` +
			`Actual crawled URL: ${actualUrl} (hostname: ${actualHostname})\n` +
			`Links from API — internal: ${internalApiCount}, external: ${externalApiCount}\n` +
			`Markdown length: ${markdownLen} chars\n` +
			`Hint: ${hint}`,
			{ itemIndex },
		);
	}

	// 3. LLM URL selection via raw: synthetic HTML
	const selectionPrompt = buildUrlSelectionPrompt(url, extractionContext, maxPages, candidates);
	const selectionSchema = buildUrlSelectionSchema();
	const selectionConfig: FullCrawlConfig = {
		...seedConfig,
		extractionStrategy: createLlmExtractionStrategy(selectionSchema, selectionPrompt, provider, apiKey, baseUrl),
	};
	const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const candidateHtml = candidates
		.map((c) => `<li>${escHtml(c.url)} | ${escHtml(c.anchorText || '')}</li>`)
		.join('\n');
	const rawSelectionUrl = `raw:<ul>\n${candidateHtml}\n</ul>`;
	const selectionResult = await client.crawlUrl(rawSelectionUrl, selectionConfig);

	let directUrls: string[] = [];
	let exploreSections: Array<{ url: string; reason: string }> = [];

	if (selectionResult.success && selectionResult.extracted_content) {
		try {
			const parsed = JSON.parse(selectionResult.extracted_content) as unknown;
			const items = Array.isArray(parsed)
				? (parsed as LlmUrlSelectionResponse[])
				: [(parsed as LlmUrlSelectionResponse)];
			const first = items.find((item) => !(item as unknown as IDataObject).error);
			if (first) {
				directUrls = Array.isArray(first.directUrls) ? first.directUrls : [];
				exploreSections = Array.isArray(first.exploreSections) ? first.exploreSections : [];
			}
		} catch {
			warnings.push('LLM URL selection: failed to parse response as JSON');
		}
	} else {
		warnings.push(`LLM URL selection: ${selectionResult.error_message || 'request failed'}`);
	}

	// 4. Hallucination guard — discard URLs not in candidate list
	const candidateNormSet = new Set(candidates.map((c) => normalizeUrl(c.url)));

	const discardedDirectCount = directUrls.filter((u) => !candidateNormSet.has(normalizeUrl(u))).length;
	if (discardedDirectCount > 0) warnings.push(`Discarded ${discardedDirectCount} hallucinated URL(s) from directUrls`);
	directUrls = directUrls.filter((u) => candidateNormSet.has(normalizeUrl(u)));

	const discardedExploreCount = exploreSections.filter((s) => !candidateNormSet.has(normalizeUrl(s.url))).length;
	if (discardedExploreCount > 0) warnings.push(`Discarded ${discardedExploreCount} hallucinated URL(s) from exploreSections`);
	exploreSections = exploreSections.filter((s) => candidateNormSet.has(normalizeUrl(s.url)));

	// 5. Explore mini-crawls
	const exploreDiscovered: string[] = [];
	if (directUrls.length < maxPages && exploreSections.length > 0) {
		const sectionBudget = Math.max(
			1,
			Math.ceil((maxPages - directUrls.length) / exploreSections.length),
		);
		const directNormSet = new Set(directUrls.map(normalizeUrl));
		for (const section of exploreSections) {
			try {
				const deepStrategy = buildDeepCrawlStrategy(
					'followLinks',
					sectionBudget,
					section.url,
					options.excludePatterns,
					keywords,
					exploreDepth,
				);
				const exploreResults = await client.crawlMultipleUrls(
					[section.url],
					{ ...seedConfig, deepCrawlStrategy: deepStrategy },
				);
				const deduped = deduplicateResults(exploreResults);
				for (const r of deduped) {
					const norm = normalizeUrl(r.url);
					if (norm !== normalizeUrl(section.url) && !directNormSet.has(norm)) {
						exploreDiscovered.push(r.url);
					}
				}
			} catch (err) {
				warnings.push(`Explore crawl failed for ${section.url}: ${(err as Error).message}`);
			}
		}
	}

	// 6. Merge + cap — directUrls take priority
	const mergeDirectNormSet = new Set(directUrls.map(normalizeUrl));
	const exploreNormSet = new Set<string>();
	const uniqueExplore: string[] = [];
	for (const u of exploreDiscovered) {
		const norm = normalizeUrl(u);
		if (!mergeDirectNormSet.has(norm) && !exploreNormSet.has(norm)) {
			exploreNormSet.add(norm);
			uniqueExplore.push(u);
		}
	}
	const allCandidates = [...directUrls, ...uniqueExplore];
	const finalUrls = allCandidates.slice(0, maxPages);
	if (allCandidates.length > maxPages) {
		warnings.push(`Truncated candidate URLs from ${allCandidates.length} to ${maxPages} (maxPages limit)`);
	}

	// 7 + 8. Final crawl or zero-URL fallback
	let finalResults: CrawlResult[];

	if (finalUrls.length === 0) {
		warnings.push('LLM returned no candidate URLs — using seed page result only');
		if (finalExtractionStrategy) {
			// Re-crawl seed with extraction strategy (customLlm needs extracted_content)
			finalResults = [await client.crawlUrl(url, { ...seedConfig, extractionStrategy: finalExtractionStrategy })];
		} else {
			finalResults = [seedResult];
		}
	} else {
		const finalConfig: FullCrawlConfig = { ...seedConfig };
		if (finalExtractionStrategy) {
			finalConfig.extractionStrategy = finalExtractionStrategy;
		}
		// deepCrawlStrategy must be absent — flat list crawl, not deep crawl
		finalResults = await client.crawlMultipleUrls(finalUrls, finalConfig);
	}

	const meta: SmartUrlSelectionMeta = {
		enabled: true,
		seedUrl: url,
		...(seedResult.redirected_url && seedResult.redirected_url !== url ? { seedRedirectedUrl: seedResult.redirected_url } : {}),
		...(seedResult.status_code != null ? { seedStatusCode: seedResult.status_code } : {}),
		candidatesFound: candidates.length,
		directUrls,
		exploreSections,
		finalUrlsCrawled: finalResults.map((r) => r.url),
		warnings,
	};

	return { results: finalResults, meta };
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
