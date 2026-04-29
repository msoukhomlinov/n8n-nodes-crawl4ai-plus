import { IDataObject } from 'n8n-workflow';
import { CrawlResult, Link } from '../../shared/interfaces';
import { parseExtractedJson } from '../../shared/formatters';

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
 * Build a metrics object from a CrawlResult
 */
function buildMetrics(result: CrawlResult): IDataObject {
	return {
		crawlTime: result.crawl_time ?? null,
	};
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
	let totalCrawlTime = 0;
	let hasValidDuration = false;

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

		if (result.crawl_time != null) {
			totalCrawlTime += result.crawl_time;
			hasValidDuration = true;
		}
	}

	const separator = '\n\n---\n\n';
	const output: IDataObject = {
		domain,
		url: primaryUrl,
		...(results.length > 1 ? { urls: results.map((r) => r.url) } : {}),
		markdown: markdownParts.join(separator),
		...(options.includeLinks !== false ? { links: allLinks } : {}),
		...(options.includeHtml ? { html: results[0]?.html || null } : {}),
		success: results.some((r) => r.success),
		pagesScanned: results.length,
		fetchedAt,
		metrics: {
			crawlTime: hasValidDuration ? totalCrawlTime : null,
		},
	};

	return output;
}

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
	const allDetails: string[] = [];
	const allSourceQuotes: string[] = [];
	let bestAnswer = '';

	for (const result of results) {
		const parsed = parseExtractedJson(result);
		// LLM extraction returns an array of chunk results; handle both array and object
		const items = Array.isArray(parsed) ? (parsed as IDataObject[]) : (parsed ? [parsed] : []);
		for (const item of items) {
			if (item.error) continue;
			if (item.answer && !bestAnswer) {
				bestAnswer = item.answer as string;
			}
			if (Array.isArray(item.details)) {
				allDetails.push(...(item.details as string[]));
			}
			if (Array.isArray(item.source_quotes)) {
				allSourceQuotes.push(...(item.source_quotes as string[]));
			}
		}
	}

	// Fallback if no structured data parsed
	if (!bestAnswer) {
		bestAnswer = primaryResult.extracted_content || '';
	}

	return {
		domain,
		url: primaryResult.url || '',
		...(results.length > 1 ? { urls: results.map((r) => r.url) } : {}),
		question,
		answer: bestAnswer,
		details: [...new Set(allDetails)],
		sourceQuotes: [...new Set(allSourceQuotes)],
		success: results.some((r) => r.success),
		pagesScanned,
		pagesWithAnswers: results.filter((r) => r.extracted_content).length,
		fetchedAt,
		metrics: buildMetrics(primaryResult),
	};
}

/**
 * Format Extract Data result
 */
export function formatExtractedDataResult(
	results: CrawlResult[],
	data: IDataObject | IDataObject[],
	extractionType: string,
): IDataObject {
	const primaryUrl = results[0]?.url || '';
	const domain = resolveDomain(primaryUrl);
	const fetchedAt = new Date().toISOString();

	return {
		domain,
		url: primaryUrl,
		...(results.length > 1 ? { urls: results.map((r) => r.url) } : {}),
		extractionType,
		data,
		success: results.some((r) => r.success),
		pagesScanned: results.length,
		fetchedAt,
		metrics: buildMetrics(results[0] || ({} as CrawlResult)),
	};
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

	return {
		domain,
		url: result.url,
		items,
		itemCount: items.length,
		success: result.success,
		fetchedAt,
		metrics: buildMetrics(result),
	};
}
