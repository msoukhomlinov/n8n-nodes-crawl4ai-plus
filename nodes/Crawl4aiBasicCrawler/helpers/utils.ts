import { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { CrawlResult, Crawl4aiApiCredentials, BrowserConfig, CrawlerRunConfig } from './interfaces';

/**
 * Creates a new instance of AsyncWebCrawler or connects to Docker client based on credentials
 * @param this IExecuteFunctions context
 * @param credentials Crawl4AI credentials
 * @returns mock function: we just create the mock function for this demonstration
 */
export async function createCrawlerInstance(
    this: IExecuteFunctions,
    credentials: Crawl4aiApiCredentials,
): Promise<any> {
    // This is a mock function to represent the crawler instance
    // In a real implementation, this would create an AsyncWebCrawler instance
    // or connect to a Docker client

    // Mock function for demonstration purposes
    return {
        async arun(url: string, config: CrawlerRunConfig): Promise<CrawlResult> {
            return {
                url,
                success: true,
                title: 'Mock Crawl Result',
                markdown: `# Mock Crawl Result\n\nThis is a mock result for ${url}`,
                text: `Mock Crawl Result This is a mock result for ${url}`,
                links: {
                    internal: [],
                    external: [],
                },
                media: {
                    images: [],
                    videos: [],
                },
                crawl_time: Date.now(),
            };
        },
        async arun_many(urls: string[], config: CrawlerRunConfig): Promise<CrawlResult[]> {
            return urls.map(url => ({
                url,
                success: true,
                title: 'Mock Crawl Result',
                markdown: `# Mock Crawl Result\n\nThis is a mock result for ${url}`,
                text: `Mock Crawl Result This is a mock result for ${url}`,
                links: {
                    internal: [],
                    external: [],
                },
                media: {
                    images: [],
                    videos: [],
                },
                crawl_time: Date.now(),
            }));
        },
        async close(): Promise<void> {
            // Clean up resources
        }
    };
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
    return {
        cacheMode: options.cacheMode as 'enabled' | 'bypass' | 'only' || 'enabled',
        streamEnabled: options.streamEnabled === true,
        pageTimeout: options.pageTimeout ? Number(options.pageTimeout) : 30000,
        requestTimeout: options.requestTimeout ? Number(options.requestTimeout) : 30000,
        jsCode: options.jsCode ? String(options.jsCode) : undefined,
        jsOnly: options.jsOnly === true,
        cssSelector: options.cssSelector ? String(options.cssSelector) : undefined,
        excludedTags: options.excludedTags as string[] || [],
        excludeExternalLinks: options.excludeExternalLinks === true,
        checkRobotsTxt: options.checkRobotsTxt === true,
        wordCountThreshold: options.wordCountThreshold ? Number(options.wordCountThreshold) : 0,
        sessionId: options.sessionId ? String(options.sessionId) : undefined,
        maxRetries: options.maxRetries ? Number(options.maxRetries) : 3,
    };
}

/**
 * Format crawl result for n8n
 * @param result Crawl result from Crawl4AI
 * @param includeMedia Whether to include media in the result
 * @param verboseResponse Whether to include verbose data in the result
 * @returns Formatted result for n8n
 */
export function formatCrawlResult(
    result: CrawlResult,
    includeMedia: boolean = false,
    verboseResponse: boolean = false
): IDataObject {
    // Base result with essential fields
    const formattedResult: IDataObject = {
        url: result.url,
        success: result.success,
        title: result.title || '',
        content: result.markdown || '',
        text: result.text || '',
    };

    // Add error message if failed
    if (!result.success && result.error_message) {
        formattedResult.error = result.error_message;
    }

    // Add extracted content if available
    if (result.extracted_content) {
        formattedResult.extractedContent = result.extracted_content;
    }

    // Include links data
    if (result.links) {
        formattedResult.links = {
            internal: result.links.internal,
            external: result.links.external,
        };
    }

    // Include media data if requested
    if (includeMedia && result.media) {
        formattedResult.media = {
            images: result.media.images,
            videos: result.media.videos,
        };
    }

    // Include verbose data if requested
    if (verboseResponse) {
        formattedResult.html = result.html || '';
        formattedResult.cleanedHtml = result.cleaned_html || '';
        formattedResult.statusCode = result.statusCode;
        formattedResult.crawlTime = result.crawl_time;
        formattedResult.metadata = result.metadata || {};
    }

    return formattedResult;
}
