import { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { Crawl4aiApiCredentials, BrowserConfig, CrawlerRunConfig } from './interfaces';
import { createCrawlerInstance } from './apiClient';

/**
 * Get Crawl4AI client instance from context
 */
export async function getCrawl4aiClient(
  executeFunctions: IExecuteFunctions,
): Promise<any> {
  // Get credentials
  const credentials = await executeFunctions.getCredentials('crawl4aiApi') as unknown as Crawl4aiApiCredentials;
  
  if (!credentials) {
    throw new Error('Crawl4AI credentials are not configured!');
  }
  
  // Create and return client instance
  return createCrawlerInstance(credentials);
}

/**
 * Convert n8n options to Crawl4AI browser configuration
 * @param options Node options from n8n
 * @returns Browser configuration for Crawl4AI
 */
export function createBrowserConfig(options: IDataObject): BrowserConfig {
  return {
    headless: options.headless !== false,
    javaScriptEnabled: options.javaScriptEnabled === true,
    viewport: {
      width: options.viewportWidth ? Number(options.viewportWidth) : 1280,
      height: options.viewportHeight ? Number(options.viewportHeight) : 800,
    },
    timeout: options.timeout ? Number(options.timeout) : 30000,
    userAgent: options.userAgent ? String(options.userAgent) : undefined,
  };
}

/**
 * Convert n8n options to Crawl4AI crawler run configuration
 * @param options Node options from n8n
 * @returns Crawler run configuration for Crawl4AI
 */
export function createCrawlerRunConfig(options: IDataObject): CrawlerRunConfig {
  // Process excluded tags (convert string to array)
  let excludedTags: string[] = [];
  if (options.excludedTags) {
    if (typeof options.excludedTags === 'string') {
      excludedTags = (options.excludedTags as string)
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);
    } else if (Array.isArray(options.excludedTags)) {
      excludedTags = options.excludedTags as string[];
    }
  }

  return {
    cacheMode: options.cacheMode as 'enabled' | 'bypass' | 'only' || 'enabled',
    streamEnabled: options.streamEnabled === true,
    pageTimeout: options.pageTimeout ? Number(options.pageTimeout) : 30000,
    requestTimeout: options.requestTimeout ? Number(options.requestTimeout) : 30000,
    jsCode: options.jsCode ? String(options.jsCode) : undefined,
    jsOnly: options.jsOnly === true,
    cssSelector: options.cssSelector ? String(options.cssSelector) : undefined,
    excludedTags,
    excludeExternalLinks: options.excludeExternalLinks === true,
    checkRobotsTxt: options.checkRobotsTxt === true,
    wordCountThreshold: options.wordCountThreshold ? Number(options.wordCountThreshold) : 0,
    sessionId: options.sessionId ? String(options.sessionId) : undefined,
    maxRetries: options.maxRetries ? Number(options.maxRetries) : 3,
  };
}

/**
 * Safely parse JSON
 */
export function safeJsonParse(jsonString: string, defaultValue: any = null): any {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Clean text by removing extra whitespace and normalizing
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}
