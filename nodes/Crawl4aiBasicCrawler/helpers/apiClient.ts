import axios, { AxiosInstance } from 'axios';
import { Crawl4aiApiCredentials, CrawlerRunConfig, CrawlResult } from './interfaces';

/**
 * Creates a client for communicating with the Crawl4AI API
 */
export class Crawl4aiClient {
  private apiClient: AxiosInstance;
  private readonly credentials: Crawl4aiApiCredentials;

  constructor(credentials: Crawl4aiApiCredentials) {
    this.credentials = credentials;
    this.apiClient = this.createApiClient();
  }

  /**
   * Create and configure an Axios instance for API communication
   */
  private createApiClient(): AxiosInstance {
    const baseURL = this.credentials.connectionMode === 'docker'
      ? this.credentials.dockerUrl
      : 'http://localhost:11235'; // Default fallback for direct mode

    const client = axios.create({
      baseURL,
      timeout: 60000, // 60 seconds default timeout
    });

    // Add authentication headers if needed
    if (this.credentials.connectionMode === 'docker' && this.credentials.authenticationType) {
      if (this.credentials.authenticationType === 'token' && this.credentials.apiToken) {
        client.defaults.headers.common['Authorization'] = `Bearer ${this.credentials.apiToken}`;
      } else if (this.credentials.authenticationType === 'basic' && this.credentials.username && this.credentials.password) {
        const auth = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
        client.defaults.headers.common['Authorization'] = `Basic ${auth}`;
      }
    }

    return client;
  }

  /**
   * Crawl a single URL
   */
  async crawlUrl(url: string, config: CrawlerRunConfig): Promise<CrawlResult> {
    try {
      const response = await this.apiClient.post('/crawl', {
        urls: [url],
        browser_config: this.formatBrowserConfig(config),
        crawler_config: this.formatCrawlerConfig(config),
      });

      // Process the response
      if (response.data && Array.isArray(response.data.results) && response.data.results.length > 0) {
        return response.data.results[0];
      }

      return {
        url,
        success: false,
        error_message: 'No result returned from Crawl4AI API',
      };
    } catch (error) {
      console.error('Error during Crawl4AI API call:', error);
      return {
        url,
        success: false,
        error_message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Crawl multiple URLs
   */
  async crawlMultipleUrls(urls: string[], config: CrawlerRunConfig): Promise<CrawlResult[]> {
    try {
      const response = await this.apiClient.post('/crawl', {
        urls,
        browser_config: this.formatBrowserConfig(config),
        crawler_config: this.formatCrawlerConfig(config),
      });

      // Process the response
      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results;
      }

      return urls.map(url => ({
        url,
        success: false,
        error_message: 'No results returned from Crawl4AI API',
      }));
    } catch (error) {
      console.error('Error during Crawl4AI API call:', error);
      return urls.map(url => ({
        url,
        success: false,
        error_message: error instanceof Error ? error.message : 'Unknown error occurred',
      }));
    }
  }

  /**
   * Process raw HTML content
   */
  async processRawHtml(html: string, baseUrl: string, config: CrawlerRunConfig): Promise<CrawlResult> {
    try {
      // For raw HTML, we need to use a special URL format that tells Crawl4AI to process raw content
      const rawUrl = `raw://${html}`;
      const response = await this.apiClient.post('/crawl', {
        urls: [rawUrl],
        browser_config: this.formatBrowserConfig(config),
        crawler_config: {
          ...this.formatCrawlerConfig(config),
          base_url: baseUrl,
        },
      });

      // Process the response
      if (response.data && Array.isArray(response.data.results) && response.data.results.length > 0) {
        return response.data.results[0];
      }

      return {
        url: baseUrl,
        success: false,
        error_message: 'No result returned from Crawl4AI API',
      };
    } catch (error) {
      console.error('Error during Crawl4AI API call:', error);
      return {
        url: baseUrl,
        success: false,
        error_message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Run an advanced operation (used for Content Extractor operations)
   * @param url URL to process
   * @param options Advanced options
   * @returns Crawl result
   */
  async arun(url: string, options: any): Promise<CrawlResult> {
    try {
      const response = await this.apiClient.post('/crawl', {
        url,
        browser_config: this.formatBrowserConfig(options.browserConfig || {}),
        extraction_strategy: options.extractionStrategy,
        cache_mode: options.cacheMode || 'enabled',
        js_code: options.jsCode,
        css_selector: options.cssSelector,
        extra_args: options.extraArgs || {},
      });

      // Process the response
      if (response.data && response.data.result) {
        return response.data.result;
      }

      return {
        url,
        success: false,
        error_message: 'No result returned from Crawl4AI API',
      };
    } catch (error) {
      console.error('Error during Crawl4AI API call:', error);
      return {
        url,
        success: false,
        error_message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Format browser config for the API
   */
  private formatBrowserConfig(config: CrawlerRunConfig): any {
    return {
      headless: config.headless !== false,
      java_script_enabled: config.javaScriptEnabled !== false,
      viewport: config.viewport || { width: 1280, height: 800 },
      timeout: config.timeout || 30000,
      user_agent: config.userAgent,
    };
  }

  /**
   * Format crawler config for the API
   */
  private formatCrawlerConfig(config: CrawlerRunConfig): any {
    return {
      cache_mode: config.cacheMode || 'enabled',
      stream: config.streamEnabled || false,
      page_timeout: config.pageTimeout || 30000,
      request_timeout: config.requestTimeout || 30000,
      js_code: config.jsCode,
      js_only: config.jsOnly || false,
      css_selector: config.cssSelector,
      excluded_tags: config.excludedTags || [],
      exclude_external_links: config.excludeExternalLinks || false,
      check_robots_txt: config.checkRobotsTxt || false,
      word_count_threshold: config.wordCountThreshold || 0,
      session_id: config.sessionId,
      max_retries: config.maxRetries || 3,
      extraction_strategy: config.extractionStrategy,
    };
  }

  /**
   * Close the client and free resources
   */
  async close(): Promise<void> {
    // No specific cleanup needed for Axios client
  }
}

/**
 * Create an instance of the Crawl4AI client
 */
export async function createCrawlerInstance(
  credentials: Crawl4aiApiCredentials
): Promise<Crawl4aiClient> {
  return new Crawl4aiClient(credentials);
}
