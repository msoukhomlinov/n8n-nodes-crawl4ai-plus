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
  const config: BrowserConfig = {
    browser_type: options.browserType ? String(options.browserType) : 'chromium',
    headless: options.headless !== false,
    browser_mode: options.browserMode ? String(options.browserMode) : 'dedicated',
    use_managed_browser: options.useManagedBrowser === true,
    debugging_port: options.debuggingPort ? Number(options.debuggingPort) : 9222,
    chrome_channel: options.chromeChannel ? String(options.chromeChannel) : 'chromium',
    channel: options.channel ? String(options.channel) : 'chromium',
    viewport_width: options.viewportWidth ? Number(options.viewportWidth) : 1080,
    viewport_height: options.viewportHeight ? Number(options.viewportHeight) : 600,
    java_script_enabled: options.javaScriptEnabled !== false,
    user_agent: options.userAgent ? String(options.userAgent) : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/116.0.0.0 Safari/537.36",
    ignore_https_errors: options.ignoreHttpsErrors !== false,
    cookies: options.cookies ? Array.isArray(options.cookies) ? options.cookies : [] : [],
    headers: options.headers ? (typeof options.headers === 'object' ? options.headers : {}) : {},
    text_mode: options.textMode === true,
    light_mode: options.lightMode === true,
    extra_args: options.extraArgs ? Array.isArray(options.extraArgs) ? options.extraArgs : [] : [],
    enable_stealth: options.enableStealth === true,
  };

  // Add viewport object for backward compatibility
  config.viewport = {
    width: config.viewport_width || 1080,
    height: config.viewport_height || 600,
  };

  // Add backward compatibility properties
  config.javaScriptEnabled = config.java_script_enabled;
  config.userAgent = config.user_agent;

  return config;
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
