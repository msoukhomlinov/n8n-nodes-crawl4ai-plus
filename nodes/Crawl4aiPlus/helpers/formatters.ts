import { IDataObject } from 'n8n-workflow';
import { CrawlResult } from '../../shared/interfaces';
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
		durationMs: result.crawl_time != null ? Math.round(result.crawl_time * 1000) : null,
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
	} = {},
): IDataObject {
	const primaryUrl = results[0]?.url || '';
	const domain = resolveDomain(primaryUrl);
	const fetchedAt = new Date().toISOString();

	// Merge markdown from all pages
	const markdownParts: string[] = [];
	const allLinks: { internal: any[]; external: any[] } = { internal: [], external: [] };
	let totalDurationMs = 0;
	let hasValidDuration = false;

	for (const result of results) {
		const md = resolveMarkdown(result);
		if (md.fit) {
			markdownParts.push(md.fit);
		} else if (md.raw) {
			markdownParts.push(md.raw);
		}

		if (options.includeLinks !== false && result.links) {
			allLinks.internal.push(...(result.links.internal || []));
			allLinks.external.push(...(result.links.external || []));
		}

		if (result.crawl_time != null) {
			totalDurationMs += Math.round(result.crawl_time * 1000);
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
			durationMs: hasValidDuration ? totalDurationMs : null,
		},
	};

	return output;
}

/**
 * Format Ask Question result into a flat, user-friendly output
 */
export function formatQuestionResult(
	result: CrawlResult,
	question: string,
	pagesScanned: number,
): IDataObject {
	const domain = resolveDomain(result.url);
	const fetchedAt = new Date().toISOString();

	// Parse the extracted JSON for answer/details/source_quotes
	const extractedData = parseExtractedJson(result);

	const answer = extractedData?.answer ?? '';
	const details = extractedData?.details ?? [];
	const sourceQuotes = extractedData?.source_quotes ?? [];

	return {
		domain,
		url: result.url,
		question,
		answer,
		details,
		sourceQuotes,
		success: result.success,
		pagesScanned,
		fetchedAt,
		metrics: buildMetrics(result),
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
