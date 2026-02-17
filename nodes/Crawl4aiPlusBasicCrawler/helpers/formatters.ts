import { IDataObject } from 'n8n-workflow';
import { CrawlResult, Link } from './interfaces';

/**
 * Format crawl result for n8n — new structured output shape (4.0.0)
 */
export function formatCrawlResult(
  result: CrawlResult,
  options: {
    cacheMode?: string;
    includeHtml?: boolean;
    includeLinks?: boolean;
    includeMedia?: boolean;
    includeScreenshot?: boolean;
    includePdf?: boolean;
    includeSslCertificate?: boolean;
    includeTables?: boolean;
    extractionStrategy?: string;
    fetchedAt: string;
  }
): IDataObject {
  // Resolve domain safely
  let domain = result.url;
  try {
    domain = new URL(result.url).hostname;
  } catch {
    // fallback to raw url
  }

  // Resolve markdown fields (API returns string or object)
  let markdownRaw = '';
  let markdownFit = '';
  if (typeof result.markdown === 'object' && result.markdown !== null) {
    markdownRaw = result.markdown.raw_markdown || '';
    markdownFit = result.markdown.fit_markdown || markdownRaw;
  } else if (typeof result.markdown === 'string') {
    markdownRaw = result.markdown;
    markdownFit = result.markdown;
  }

  // Parse extracted_content JSON
  let extractedJson: object | null = null;
  if (result.extracted_content) {
    try {
      extractedJson = JSON.parse(result.extracted_content) as object;
    } catch {
      // Not valid JSON — leave null
    }
  }

  // Build base output
  const output: IDataObject = {
    domain,
    url: result.url,
    fetchedAt: options.fetchedAt,
    success: result.success,
    statusCode: result.status_code ?? null,
    ...(options.cacheMode ? { cacheMode: options.cacheMode } : {}),
    content: {
      markdownRaw,
      markdownFit,
      ...(options.includeHtml ? { html: result.html ?? null } : {}),
    },
    extracted: {
      strategy: options.extractionStrategy ?? null,
      json: extractedJson,
    },
    links: (options.includeLinks !== false)
      ? { internal: (result.links?.internal ?? []) as Link[], external: (result.links?.external ?? []) as Link[] }
      : { internal: [], external: [] },
    metrics: {
      durationMs: result.crawl_time != null ? Math.round(result.crawl_time * 1000) : null,
    },
  };

  // Error message only on failure
  if (!result.success && result.error_message) {
    output.errorMessage = result.error_message;
  }

  // Optional additions
  if (options.includeMedia && result.media) {
    output.media = {
      images: result.media.images || [],
      videos: result.media.videos || [],
      ...(result.media.audios ? { audios: result.media.audios } : {}),
    };
  }

  if (options.includeScreenshot && result.screenshot) {
    output.screenshot = result.screenshot;
  }

  if (options.includePdf && result.pdf) {
    output.pdf = result.pdf;
  }

  if (options.includeSslCertificate && result.ssl_certificate) {
    output.sslCertificate = result.ssl_certificate;
  }

  if (options.includeTables && result.tables && result.tables.length > 0) {
    output.tables = result.tables.map((table) => ({
      headers: table.headers,
      rows: table.rows,
      ...(table.caption ? { caption: table.caption } : {}),
      ...(table.metadata ? { metadata: table.metadata } : {}),
    }));
    output.tableCount = result.tables.length;
  }

  return output;
}

/**
 * Format extraction result for Content Extractor operations — same base shape
 */
export function formatExtractionResult(
  result: CrawlResult,
  extractedData: IDataObject | null,
  options: {
    fetchedAt: string;
    extractionStrategy?: string;
    includeFullText?: boolean;
    includeLinks?: boolean;
  }
): IDataObject {
  let domain = result.url;
  try {
    domain = new URL(result.url).hostname;
  } catch {
    // fallback
  }

  let markdownRaw = '';
  let markdownFit = '';
  if (typeof result.markdown === 'object' && result.markdown !== null) {
    markdownRaw = result.markdown.raw_markdown || '';
    markdownFit = result.markdown.fit_markdown || markdownRaw;
  } else if (typeof result.markdown === 'string') {
    markdownRaw = result.markdown;
    markdownFit = result.markdown;
  }

  const output: IDataObject = {
    domain,
    url: result.url,
    fetchedAt: options.fetchedAt,
    success: result.success,
    statusCode: result.status_code ?? null,
    content: {
      markdownRaw,
      markdownFit,
    },
    extracted: {
      strategy: options.extractionStrategy ?? null,
      json: extractedData,
    },
    links: (options.includeLinks !== false)
      ? { internal: (result.links?.internal ?? []) as Link[], external: (result.links?.external ?? []) as Link[] }
      : { internal: [], external: [] },
    metrics: {
      durationMs: result.crawl_time != null ? Math.round(result.crawl_time * 1000) : null,
    },
  };

  if (!result.success && result.error_message) {
    output.errorMessage = result.error_message;
  }

  if (options.includeFullText) {
    output.originalText = result.text || '';
  }

  return output;
}

/**
 * Parse JSON result from extraction
 */
export function parseExtractedJson(result: CrawlResult): IDataObject | null {
  if (!result.extracted_content) {
    return null;
  }
  try {
    return JSON.parse(result.extracted_content) as IDataObject;
  } catch {
    return null;
  }
}
