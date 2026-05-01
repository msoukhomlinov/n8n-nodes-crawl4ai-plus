import { IDataObject } from 'n8n-workflow';
import { CrawlResult, Link } from '../../shared/interfaces';
import { parseExtractedJson } from '../../shared/formatters';
import type { SmartUrlSelectionMeta } from './utils';

/**
 * Strip verbose Python traceback noise from Crawl4AI error messages.
 * Removes Code context block, Call log block, and Python file paths.
 */
function cleanCrawlError(msg: string): string {
	let out = msg.replace(/\n\nCode context:[\s\S]*$/, '');
	out = out.replace(/\nCall log:[\s\S]*$/, '');
	out = out.replace(/\s*\(\.\.\/[^)]+\.py\)/g, '');
	return out.trim();
}

/**
 * Resolve markdown from a CrawlResult (API returns string or object)
 */
function resolveMarkdown(result: CrawlResult): { raw: string; fit: string } {
	if (typeof result.markdown === 'object' && result.markdown !== null) {
		const raw = result.markdown.raw_markdown || '';
		return { raw, fit: result.markdown.fit_markdown || raw };
	}
	if (typeof result.markdown === 'string') {
		return { raw: result.markdown, fit: result.markdown };
	}
	return { raw: '', fit: '' };
}

/**
 * Resolve domain from URL
 */
function resolveDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

/**
 * Build a metrics object from an array of CrawlResults — aggregates cache hits/misses across all pages
 */
function buildMetrics(results: CrawlResult[]): IDataObject {
	const primary = results[0];
	const metrics: IDataObject = {};

	let maxCrawlTime: number | undefined;
	for (const r of results) {
		if (r.crawl_time != null) {
			maxCrawlTime = maxCrawlTime === undefined ? r.crawl_time : Math.max(maxCrawlTime, r.crawl_time);
		}
	}
	if (maxCrawlTime !== undefined) metrics.crawlTime = maxCrawlTime;

	let cacheHits = 0;
	let cacheMisses = 0;
	for (const r of results) {
		if (r.cache_status === 'hit') cacheHits++;
		else if (r.cache_status === 'miss') cacheMisses++;
	}
	if (cacheHits > 0 || cacheMisses > 0) {
		metrics.cacheHits = cacheHits;
		metrics.cacheMisses = cacheMisses;
	}

	if (primary?.server_memory_delta_mb != null) metrics.memoryDeltaMb = primary.server_memory_delta_mb;
	if (primary?.server_peak_memory_mb != null) metrics.peakMemoryMb = primary.server_peak_memory_mb;

	return metrics;
}

/**
 * Format Get Page Content results — merges multi-page results into a single output
 */
export function formatPageContentResult(
	results: CrawlResult[],
	options: {
		includeLinks?: boolean;
		includeHtml?: boolean;
		contentQuality?: string;
	} = {},
): IDataObject {
	const primaryUrl = results[0]?.url || '';
	const domain = resolveDomain(primaryUrl);
	const fetchedAt = new Date().toISOString();

	// Merge markdown from all pages
	const markdownParts: string[] = [];
	const allLinks: { internal: Link[]; external: Link[] } = { internal: [], external: [] };

	for (const result of results) {
		const md = resolveMarkdown(result);
		// When contentQuality is 'complete', prefer raw (unfiltered) markdown
		const text = options.contentQuality === 'complete'
			? (md.raw || md.fit)
			: (md.fit || md.raw);
		if (text) {
			markdownParts.push(text);
		}

		if (options.includeLinks !== false && result.links) {
			allLinks.internal.push(...(result.links.internal || []));
			allLinks.external.push(...(result.links.external || []));
		}
	}

	const separator = '\n\n---\n\n';
	const primaryResult = results[0];
	const redirectedUrl = primaryResult?.redirected_url;

	const overallSuccess = results.some((r) => r.success);
	const output: IDataObject = {
		domain,
		url: primaryUrl,
		...(redirectedUrl && redirectedUrl !== primaryUrl ? { redirectedUrl } : {}),
		statusCode: primaryResult?.status_code ?? null,
		...(results.length > 1 ? { urls: results.map((r) => r.url) } : {}),
		markdown: markdownParts.join(separator),
		...(options.includeLinks !== false ? { links: allLinks } : {}),
		...(options.includeHtml ? { html: primaryResult?.html || null } : {}),
		success: overallSuccess,
		pagesScanned: results.length,
		fetchedAt,
		metrics: buildMetrics(results),
	};
	if (!overallSuccess) {
		const firstError = results.find((r) => r.error_message)?.error_message;
		if (firstError) output.errorMessage = cleanCrawlError(firstError);
	}

	if (primaryResult?.js_execution_result != null) {
		output.jsExecutionResult = primaryResult.js_execution_result;
	}

	const allDownloaded = results.flatMap((r) => r.downloaded_files ?? []);
	if (allDownloaded.length > 0) output.downloadedFiles = allDownloaded;

	return output;
}

const LLM_FALLBACK_ANSWER = "I couldn't find enough information on the page to answer this question.";

/**
 * Format Ask Question result into a flat, user-friendly output.
 * Accepts an array of results and merges answers from all pages.
 */
export function formatQuestionResult(
	results: CrawlResult[],
	question: string,
	pagesScanned: number,
): IDataObject {
	const primaryResult = results[0] || ({} as CrawlResult);
	const domain = resolveDomain(primaryResult.url || '');
	const fetchedAt = new Date().toISOString();

	// Parse extracted data from all results and merge
	const allAnswers: string[] = [];
	const allDetails: string[] = [];
	const allSourceQuotes: string[] = [];

	for (const result of results) {
		const parsed = parseExtractedJson(result);
		// LLM extraction returns an array of chunk results; handle both array and object
		const items = Array.isArray(parsed) ? (parsed as IDataObject[]) : (parsed ? [parsed] : []);
		for (const item of items) {
			if (item.error) continue;
			if (item.answer) {
				allAnswers.push(item.answer as string);
			}
			if (Array.isArray(item.details)) {
				allDetails.push(...(item.details as string[]));
			}
			if (Array.isArray(item.source_quotes)) {
				allSourceQuotes.push(...(item.source_quotes as string[]));
			}
		}
	}

	// Prefer real answers over the LLM's fallback "couldn't find" message, which appears
	// when a single chunk/page lacks info but other chunks/pages found the answer.
	const bestAnswer =
		allAnswers.find((a) => a !== LLM_FALLBACK_ANSWER) ||
		allAnswers[0] ||
		primaryResult.extracted_content ||
		'';

	const metrics = buildMetrics(results);

	const primaryUrl = primaryResult.url || '';
	const redirectedUrl = primaryResult.redirected_url;

	const questionSuccess = results.some((r) => r.success);
	const questionOutput: IDataObject = {
		domain,
		url: primaryUrl,
		...(redirectedUrl && redirectedUrl !== primaryUrl ? { redirectedUrl } : {}),
		statusCode: primaryResult.status_code ?? null,
		...(results.length > 1 ? { urls: results.map((r) => r.url) } : {}),
		question,
		answer: bestAnswer,
		details: [...new Set(allDetails)],
		sourceQuotes: [...new Set(allSourceQuotes)],
		success: questionSuccess,
		pagesScanned,
		pagesWithAnswers: results.filter((r) => r.extracted_content).length,
		fetchedAt,
		metrics,
	};
	if (!questionSuccess) {
		const firstError = results.find((r) => r.error_message)?.error_message;
		if (firstError) questionOutput.errorMessage = cleanCrawlError(firstError);
	}
	return questionOutput;
}

/**
 * Format Extract Data result
 */
export function formatExtractedDataResult(
	results: CrawlResult[],
	data: IDataObject | IDataObject[],
	extractionType: string,
	smartUrlMeta?: SmartUrlSelectionMeta,
): IDataObject {
	const primaryUrl = results[0]?.url || '';
	const domain = resolveDomain(primaryUrl);
	const fetchedAt = new Date().toISOString();

	const primaryExtractResult = results[0] || ({} as CrawlResult);
	const redirectedExtractUrl = primaryExtractResult.redirected_url;
	const extractSuccess = results.some((r) => r.success);

	const extractOutput: IDataObject = {
		domain,
		url: primaryUrl,
		...(redirectedExtractUrl && redirectedExtractUrl !== primaryUrl ? { redirectedUrl: redirectedExtractUrl } : {}),
		statusCode: primaryExtractResult.status_code ?? null,
		...(results.length > 1 ? { urls: results.map((r) => r.url) } : {}),
		extractionType,
		data,
		success: extractSuccess,
		pagesScanned: results.length,
		fetchedAt,
		metrics: buildMetrics(results),
		...(smartUrlMeta ? { _smartUrlSelection: smartUrlMeta } : {}),
	};
	if (!extractSuccess) {
		const firstError = results.find((r) => r.error_message)?.error_message;
		if (firstError) extractOutput.errorMessage = cleanCrawlError(firstError);
	}
	return extractOutput;
}

/**
 * Format CSS Extractor result
 */
export function formatCssExtractorResult(
	result: CrawlResult,
	items: IDataObject[],
): IDataObject {
	const domain = resolveDomain(result.url);
	const fetchedAt = new Date().toISOString();

	const redirectedCssUrl = result.redirected_url;

	const cssOutput: IDataObject = {
		domain,
		url: result.url,
		...(redirectedCssUrl && redirectedCssUrl !== result.url ? { redirectedUrl: redirectedCssUrl } : {}),
		statusCode: result.status_code ?? null,
		items,
		itemCount: items.length,
		success: result.success,
		fetchedAt,
		metrics: buildMetrics([result]),
	};
	if (!result.success && result.error_message) {
		cssOutput.errorMessage = cleanCrawlError(result.error_message);
	}
	return cssOutput;
}
