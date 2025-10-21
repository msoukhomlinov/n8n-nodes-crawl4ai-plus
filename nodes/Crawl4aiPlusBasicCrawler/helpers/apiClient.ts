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
      timeout: 120000, // 120 seconds default timeout (increased from 60s)
    });

    // Add authentication headers if needed
    if (this.credentials.connectionMode === 'docker' && this.credentials.authenticationType) {
      if (this.credentials.authenticationType === 'token' && this.credentials.apiToken) {
        client.defaults.headers.common['Authorization'] = `Bearer ${this.credentials.apiToken}`;
      } else if (this.credentials.authenticationType === 'basic' && this.credentials.username && this.credentials.password) {
        // Use axios built-in auth config for Basic authentication
        client.defaults.auth = {
          username: this.credentials.username,
          password: this.credentials.password
        };
      }
    }

    return client;
  }

  /**
   * Get appropriate timeout based on config
   */
  private getTimeout(config: CrawlerRunConfig): number {
    // Use 5 minutes for deep crawl operations
    if (config.deepCrawlStrategy) {
      return 300000; // 5 minutes
    }
    // Use default 2 minutes for regular operations
    return 120000;
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
      }, {
        timeout: this.getTimeout(config),
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
      }, {
        timeout: this.getTimeout(config),
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
      // Validate HTML size (max 5MB to prevent memory issues)
      const htmlSizeBytes = new TextEncoder().encode(html).length;
      const MAX_HTML_SIZE = 5 * 1024 * 1024; // 5MB
      if (htmlSizeBytes > MAX_HTML_SIZE) {
        return {
          url: baseUrl,
          success: false,
          error_message: `HTML content too large (${(htmlSizeBytes / 1024 / 1024).toFixed(2)}MB). Maximum allowed: 5MB`,
        };
      }

      // For raw HTML, we need to use a special URL format that tells Crawl4AI to process raw content
      // Properly encode the HTML content to prevent injection vulnerabilities
      const rawUrl = `raw://${encodeURIComponent(html)}`;
      const response = await this.apiClient.post('/crawl', {
        urls: [rawUrl],
        browser_config: this.formatBrowserConfig(config),
        crawler_config: {
          ...this.formatCrawlerConfig(config),
          base_url: baseUrl,
        },
      }, {
        timeout: this.getTimeout(config),
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
      // Prepare the crawler config, only adding values if they exist
      const crawlerParams: any = {
        cache_mode: options.cacheMode || 'ENABLED',
      };

      if (options.jsCode) {
        crawlerParams.js_code = options.jsCode;
      }
      if (options.cssSelector) {
        crawlerParams.css_selector = options.cssSelector;
      }
      if (options.extractionStrategy) {
        crawlerParams.extraction_strategy = options.extractionStrategy;
      }
      if (options.extraArgs) {
        Object.assign(crawlerParams, options.extraArgs);
      }

      // Prepare the full request
      const requestBody = {
        urls: [url],
        browser_config: this.formatBrowserConfig(options.browserConfig || {}),
        crawler_config: {
          type: 'CrawlerRunConfig',
          params: crawlerParams,
        },
      };

      const response = await this.apiClient.post('/crawl', requestBody, {
        timeout: 120000, // 2 minutes for extraction operations
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
    } catch (error: any) {
      return {
        url,
        success: false,
        error_message: error.response?.data?.detail || error.message || 'Unknown error occurred',
      };
    }
  }

  /**
   * Format browser config for the API
   * Use flat dict for simple params, NO type/params wrapper needed
   */
  private formatBrowserConfig(config: CrawlerRunConfig): any {
    const params: any = {};

    const cfg = config as any;

    if (cfg.browserType) {
      params.browser_type = cfg.browserType;
    }

    if (cfg.browserMode) {
      params.browser_mode = cfg.browserMode;
    }

    if (cfg.useManagedBrowser) {
      params.use_managed_browser = true;
    }

    if (cfg.debuggingPort !== undefined) {
      params.debugging_port = cfg.debuggingPort;
    }

    if (cfg.chromeChannel) {
      params.chrome_channel = cfg.chromeChannel;
    }

    if (cfg.channel) {
      params.channel = cfg.channel;
    }

    if (config.headless !== undefined) {
      params.headless = config.headless;
    }

    if (config.viewport && (config.viewport.width !== undefined || config.viewport.height !== undefined)) {
      params.viewport = {
        type: 'dict',
        value: {
          ...(config.viewport.width !== undefined ? { width: config.viewport.width } : {}),
          ...(config.viewport.height !== undefined ? { height: config.viewport.height } : {}),
        },
      };
    }

    if (cfg.java_script_enabled !== undefined) {
      params.java_script_enabled = cfg.java_script_enabled;
    }

    if (cfg.user_agent) {
      params.user_agent = cfg.user_agent;
    }

    if (cfg.ignore_https_errors !== undefined) {
      params.ignore_https_errors = cfg.ignore_https_errors;
    }

    if (cfg.text_mode === true) {
      params.text_mode = true;
    }

    if (cfg.light_mode === true) {
      params.light_mode = true;
    }

    if (cfg.enable_stealth === true) {
      params.enable_stealth = true;
    }

    // Return flat dict (API accepts both formats)
    return Object.keys(params).length > 0 ? params : {};
  }

  /**
   * Format crawler config for the API
   * Use flat dict for simple params, type/params ONLY for extraction strategies
   */
  private formatCrawlerConfig(config: CrawlerRunConfig): any {
    const params: any = {};

    if (config.cacheMode) {
      params.cache_mode = config.cacheMode;
    }

    if (config.streamEnabled) {
      params.stream = true;
    }

    if (config.pageTimeout !== undefined) {
      params.page_timeout = config.pageTimeout;
    }

    if (config.waitUntil) {
      params.wait_until = config.waitUntil;
    }

    if (config.waitFor) {
      params.wait_for = config.waitFor;
    }

    if (config.jsCode) {
      params.js_code = config.jsCode;
    }

    if (config.jsOnly) {
      params.js_only = true;
    }

    if (config.cssSelector) {
      params.css_selector = config.cssSelector;
    }

    if (config.deepCrawlStrategy) {
      params.deep_crawl_strategy = config.deepCrawlStrategy;
    }

    if (config.excludedTags && config.excludedTags.length > 0) {
      params.excluded_tags = config.excludedTags;
    }

    if (config.excludeExternalLinks) {
      params.exclude_external_links = true;
    }

    if (config.checkRobotsTxt) {
      params.check_robots_txt = true;
    }

    if (config.wordCountThreshold !== undefined) {
      params.word_count_threshold = config.wordCountThreshold;
    }

    if (config.sessionId) {
      params.session_id = config.sessionId;
    }

    if (config.maxRetries !== undefined) {
      params.max_retries = config.maxRetries;
    }

    // Use type/params wrapper ONLY if extraction strategy OR table extraction is present
    if (config.extractionStrategy || config.deepCrawlStrategy || config.tableExtraction) {
      return {
        type: 'CrawlerRunConfig',
        params: {
          ...params,
          ...(config.extractionStrategy ? { extraction_strategy: config.extractionStrategy } : {}),
          ...(config.deepCrawlStrategy ? { deep_crawl_strategy: config.deepCrawlStrategy } : {}),
          ...(config.tableExtraction ? { table_extraction: config.tableExtraction } : {}),
        },
      };
    }

    // Return flat dict for simple params (API accepts both formats)
    return Object.keys(params).length > 0 ? params : {};
  }

  /**
   * Generate regex pattern using LLM
   */
  async generateRegexPattern(payload: any): Promise<any> {
    try {
      const response = await this.apiClient.post('/generate_pattern', payload);
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Pattern generation failed: ${error.response.data?.error || error.response.statusText}`);
      }
      throw new Error(`Pattern generation request failed: ${error.message}`);
    }
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
