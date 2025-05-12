import { IExecuteFunctions, IDataObject, NodeOperationError } from 'n8n-workflow';
import { CrawlResult, Crawl4aiApiCredentials, BrowserConfig, CrawlerRunConfig, CssSelectorSchema, LlmSchema } from './interfaces';

/**
 * Creates a new instance of AsyncWebCrawler or connects to Docker client based on credentials
 * @param this IExecuteFunctions context
 * @param credentials Crawl4AI credentials
 * @returns A crawler instance (mock for now)
 */
export async function createCrawlerInstance(
    this: IExecuteFunctions,
    credentials: Crawl4aiApiCredentials,
): Promise<any> {
    // Check if we're using Docker mode
    if (credentials.connectionMode === 'docker') {
        // In a real implementation, this would create a Crawl4aiDockerClient instance
        // Here, we're just returning a mock client with the basic methods

        // Prepare the authentication headers
        const headers: Record<string, string> = {};
        
        if (credentials.authenticationType === 'token' && credentials.apiToken) {
            // Use token authentication
            headers['Authorization'] = `Bearer ${credentials.apiToken}`;
        } else if (credentials.authenticationType === 'basic' && credentials.username && credentials.password) {
            // Use basic authentication (username/password)
            const basicAuth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
            headers['Authorization'] = `Basic ${basicAuth}`;
        }
        
        // Mock Docker client
        console.log(`[Mock Docker Client] Using Docker server: ${credentials.dockerUrl}`);
        console.log(`[Mock Docker Client] Auth type: ${credentials.authenticationType}`);
        
        return {
            async arun(url: string, config: CrawlerRunConfig): Promise<CrawlResult> {
                // In real implementation, would make API calls to the Docker server
                // using credentials.dockerUrl and appropriate auth headers
                
                return {
                    url,
                    success: true,
                    title: 'Mock Docker Extraction Result',
                    markdown: `# Mock Docker Extraction Result\n\nThis is a mock result for ${url}`,
                    text: `Mock Docker Extraction Result This is a mock result for ${url}`,
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
    } else {
        // Direct Python mode - Mock for now
        return {
            async arun(url: string, config: CrawlerRunConfig): Promise<CrawlResult> {
                return {
                    url,
                    success: true,
                    title: 'Mock Direct Extraction Result',
                    markdown: `# Mock Direct Extraction Result\n\nThis is a mock result for ${url}`,
                    text: `Mock Direct Extraction Result This is a mock result for ${url}`,
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
 * @param schema LLM extraction schema
 * @param instruction Instructions for LLM extraction
 * @param provider LLM provider name
 * @param apiKey API key for LLM provider
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
