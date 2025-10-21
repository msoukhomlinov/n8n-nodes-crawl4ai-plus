import { IDataObject } from 'n8n-workflow';
import { CrawlResult } from './interfaces';

/**
 * Format crawl result for n8n
 * @param result Crawl result from Crawl4AI
 * @param includeMedia Whether to include media in the result
 * @param verboseResponse Whether to include verbose data in the result
 * @param outputOptions Additional output configuration options
 * @returns Formatted result for n8n
 */
export function formatCrawlResult(
  result: CrawlResult,
  includeMedia: boolean = false,
  verboseResponse: boolean = false,
  outputOptions?: {
    markdownOutput?: 'raw' | 'fit' | 'both';
    includeLinks?: boolean;
    includeScreenshot?: boolean;
    includePdf?: boolean;
    includeSslCertificate?: boolean;
    includeTables?: boolean;
  }
): IDataObject {
  // Base result with essential fields
  const formattedResult: IDataObject = {
    url: result.url,
    success: result.success,
    statusCode: result.status_code || null,
    title: result.title || '',
  };

  // Handle markdown output based on format (object when content filter used, string otherwise)
  if (typeof result.markdown === 'object' && result.markdown !== null) {
    const markdownObj = result.markdown as any;

    if (outputOptions?.markdownOutput === 'fit') {
      formattedResult.content = markdownObj.fit_markdown || markdownObj.raw_markdown || '';
    } else if (outputOptions?.markdownOutput === 'both') {
      formattedResult.rawMarkdown = markdownObj.raw_markdown || '';
      formattedResult.fitMarkdown = markdownObj.fit_markdown || '';
      formattedResult.content = markdownObj.raw_markdown || ''; // Primary field for single-value contexts
    } else {
      // Default: raw markdown
      formattedResult.content = markdownObj.raw_markdown || '';
    }
  } else {
    // No content filter used: markdown is a simple string
    formattedResult.content = result.markdown || '';
  }

  formattedResult.text = result.text || '';

  // Add error message if failed
  if (!result.success && result.error_message) {
    formattedResult.error = result.error_message;
  }

  // Add extracted content if available
  if (result.extracted_content) {
    try {
      // Try to parse as JSON if it's a JSON string
      formattedResult.extractedContent = JSON.parse(result.extracted_content);
    } catch (e) {
      // If not a valid JSON, use as-is
      formattedResult.extractedContent = result.extracted_content;
    }
  }

  // Include links data (always include if available, or if explicitly requested)
  if (outputOptions?.includeLinks || result.links) {
    if (result.links) {
      formattedResult.links = {
        internal: result.links.internal || [],
        external: result.links.external || [],
      };
    }
  }

  // Include media data if requested
  if (includeMedia && result.media) {
    formattedResult.media = {
      images: result.media.images || [],
      videos: result.media.videos || [],
      ...(result.media.audios ? { audios: result.media.audios } : {})
    };
  }

  // Include screenshot if requested and available
  if ((outputOptions?.includeScreenshot || result.screenshot) && result.screenshot) {
    formattedResult.screenshot = result.screenshot;
  }

  // Include PDF if requested and available
  if ((outputOptions?.includePdf || result.pdf) && result.pdf) {
    formattedResult.pdf = result.pdf;
  }

  // Include SSL certificate if requested and available
  if ((outputOptions?.includeSslCertificate || result.ssl_certificate) && result.ssl_certificate) {
    formattedResult.sslCertificate = result.ssl_certificate;
  }

  // Include tables if requested and available
  if ((outputOptions?.includeTables || result.tables) && result.tables && result.tables.length > 0) {
    formattedResult.tables = result.tables.map((table) => ({
      headers: table.headers,
      rows: table.rows,
      ...(table.caption ? { caption: table.caption } : {}),
      ...(table.metadata ? { metadata: table.metadata } : {})
    }));
    formattedResult.tableCount = result.tables.length;
  }

  // Include verbose data if requested
  if (verboseResponse) {
    formattedResult.html = result.html || '';
    formattedResult.cleanedHtml = result.cleaned_html || '';
    formattedResult.crawlTime = result.crawl_time;
    formattedResult.metadata = result.metadata || {};
  }

  return formattedResult;
}

/**
 * Parse JSON result from extraction
 * @param result Crawl result with extracted_content
 * @returns Parsed JSON data
 */
export function parseExtractedJson(result: CrawlResult): IDataObject | null {
  if (!result.extracted_content) {
    return null;
  }

  try {
    return JSON.parse(result.extracted_content) as IDataObject;
  } catch (error) {
    return null;
  }
}

/**
 * Format extraction result
 * @param result Crawl result
 * @param extractedData Extracted data
 * @param includeFullText Whether to include the original webpage text
 * @returns Formatted data for output
 */
export function formatExtractionResult(
  result: CrawlResult,
  extractedData: IDataObject | null,
  includeFullText: boolean = false,
): IDataObject {
  // Base result with the URL
  const formattedResult: IDataObject = {
    url: result.url,
    success: result.success,
    statusCode: result.status_code || null,
  };

  // Add error message if failed
  if (!result.success && result.error_message) {
    formattedResult.error = result.error_message;
    return formattedResult;
  }

  // Add extracted data
  if (extractedData) {
    Object.entries(extractedData).forEach(([key, value]) => {
      formattedResult[key] = value;
    });
  } else {
    formattedResult.extractionFailed = true;
  }

  // Include original webpage text if requested
  if (includeFullText) {
    formattedResult.originalText = result.text || '';
    formattedResult.title = result.title || '';
  }

  return formattedResult;
}
