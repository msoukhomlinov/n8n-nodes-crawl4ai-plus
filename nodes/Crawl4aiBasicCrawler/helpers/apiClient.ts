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

    // Add request/response interceptors for debugging
    client.interceptors.request.use(
      (config) => {
        console.log('Crawl4AI Request:', {
          url: config.url,
          method: config.method,
          data: config.data,
        });
        return config;
      },
      (error) => {
        console.error('Request error:', error);
        return Promise.reject(error);
      }
    );

    client.interceptors.response.use(
      (response) => {
        console.log('Crawl4AI Response:', {
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error) => {
        console.error('Response error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );

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
   * @param options Advanced options including extraction strategy
   * @returns Crawl result
   */
  async arun(url: string, options: any): Promise<CrawlResult> {
    try {
      // Prepare the crawler config
      const crawlerConfig: any = {
        cache_mode: options.cacheMode || 'enabled',
        js_code: options.jsCode,
        css_selector: options.cssSelector,
      };

      // Add extraction strategy if provided
      if (options.extractionStrategy) {
        crawlerConfig.extraction_strategy = options.extractionStrategy;
      }

      // Add extra arguments if provided
      if (options.extraArgs) {
        Object.assign(crawlerConfig, options.extraArgs);
      }

      // Prepare the full request
      const requestBody = {
        urls: [url],
        browser_config: this.formatBrowserConfig(options.browserConfig || {}),
        crawler_config: {
          type: 'CrawlerRunConfig',
          params: crawlerConfig,
        },
      };

      console.log('Full request body:', JSON.stringify(requestBody, null, 2));

      const response = await this.apiClient.post('/crawl', requestBody);

      // Process the response
      if (response.data && Array.isArray(response.data.results) && response.data.results.length > 0) {
        return response.data.results[0];
      }

      return {
        url,
        success: false,
        error_message: 'No result returned from Crawl4AI API',
      };
    } catch (error: any) {
      console.error('Error during Crawl4AI API call:', error);
      console.error('Error response:', error.response?.data);
      return {
        url,
        success: false,
        error_message: error.response?.data?.detail || error.message || 'Unknown error occurred',
      };
    }
  }

  /**
   * Format browser config for the API
   */
  private formatBrowserConfig(config: CrawlerRunConfig): any {
    return {
      type: 'BrowserConfig',
      params: {
        browser_type: 'chromium',
        headless: config.headless !== false,
        browser_mode: 'dedicated',
        use_managed_browser: false,
        cdp_url: null,
        debugging_port: 9222,
        use_persistent_context: false,
        user_data_dir: null,
        chrome_channel: 'chromium',
        channel: 'chromium',
        proxy: null,
        viewport_width: config.viewport?.width || 1080,
        viewport_height: config.viewport?.height || 600,
        accept_downloads: false,
        downloads_path: null,
        storage_state: null,
        ignore_https_errors: true,
        java_script_enabled: config.javaScriptEnabled !== false,
        sleep_on_close: false,
        verbose: true,
        cookies: [],
        headers: {},
        user_agent: config.userAgent || "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/116.0.0.0 Safari/537.36",
        user_agent_mode: "",
        user_agent_generator_config: {},
        text_mode: false,
        light_mode: false,
        extra_args: [],
        host: "localhost",
        enable_stealth: (config as any).enable_stealth || false,
      },
    };
  }

  /**
   * Format crawler config for the API (for basic operations)
   */
  private formatCrawlerConfig(config: CrawlerRunConfig): any {
    const params: any = {
      cache_mode: config.cacheMode || 'enabled',
      stream: config.streamEnabled || false,
      page_timeout: config.pageTimeout || config.timeout || 30000, // Support both pageTimeout and legacy timeout
      wait_until: 'domcontentloaded',
      js_code: config.jsCode,
      js_only: config.jsOnly || false,
      css_selector: config.cssSelector,
      excluded_tags: config.excludedTags || [],
      exclude_external_links: config.excludeExternalLinks || false,
      check_robots_txt: config.checkRobotsTxt || false,
      word_count_threshold: config.wordCountThreshold || 0,
      session_id: config.sessionId,
      only_text: false,
      scan_full_page: false,
      remove_overlay_elements: false,
      simulate_user: false,
      override_navigator: false,
      magic: false,
    };

    // Add extraction strategy if present
    if (config.extractionStrategy) {
      params.extraction_strategy = config.extractionStrategy;
    }

    return {
      type: 'CrawlerRunConfig',
      params,
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
