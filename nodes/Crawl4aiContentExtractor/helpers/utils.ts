import { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { CrawlResult, Crawl4aiApiCredentials, BrowserConfig, CrawlerRunConfig, CssSelectorSchema, LlmSchema } from './interfaces';

/**
 * Creates a new instance of AsyncWebCrawler or connects to Docker client based on credentials
 * This is an export from the BasicCrawler utils.ts
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
                extracted_content: config.extractionStrategy ? JSON.stringify({ title: 'Extracted Title', content: 'Extracted Content' }) : undefined,
                crawl_time: Date.now(),
            };
        },
        async close(): Promise<void> {
            // Clean up resources
        }
    };
}

/**
 * Convert n8n options to Crawl4AI browser configuration
 * This is an export from the BasicCrawler utils.ts
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
 * Create a CSS selector extraction strategy
 * @param schema CSS selector schema
 * @returns Extraction strategy for CSS selectors
 */
export function createCssSelectorExtractionStrategy(schema: CssSelectorSchema): any {
    // In a real implementation, this would create a JsonCssExtractionStrategy
    // Here we just return the schema as the mock crawler will use it
    return {
        type: 'css',
        schema,
    };
}

/**
 * Create an LLM extraction strategy
 * @param config LLM extraction configuration
 * @returns Extraction strategy for LLM
 */
export function createLlmExtractionStrategy(
    schema: LlmSchema,
    instruction: string,
    provider: string,
    apiKey?: string,
): any {
    // In a real implementation, this would create an LLMExtractionStrategy
    // Here we just return the configuration as the mock crawler will use it
    return {
        type: 'llm',
        schema,
        instruction,
        provider,
        apiKey,
    };
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
