import axios, { AxiosInstance } from 'axios';
import { Crawl4aiApiCredentials, CrawlerRunConfig, CrawlResult, CrawlJobRequest, JobStatusResponse, MonitorHealth, LlmJobRequest } from './interfaces';

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
    const baseURL = this.credentials.dockerUrl || 'http://localhost:11235';

    const client = axios.create({
      baseURL,
      timeout: 120000, // 120 seconds default timeout
    });

    // Add authentication headers if needed
    if (this.credentials.authenticationType) {
      if (this.credentials.authenticationType === 'token' && this.credentials.apiToken) {
        client.defaults.headers.common['Authorization'] = `Bearer ${this.credentials.apiToken}`;
      } else if (this.credentials.authenticationType === 'basic' && this.credentials.username && this.credentials.password) {
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
    if (config.deepCrawlStrategy) {
      return 300000; // 5 minutes for deep crawl
    }
    return 120000;
  }

  /**
   * Parse API error response and return actionable error message
   */
  private parseApiError(error: any, context: string = 'crawl'): string {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return `Cannot connect to Crawl4AI API at ${this.apiClient.defaults.baseURL}. Check that the Docker container is running and the URL is correct.`;
    }

    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return `Request timed out. The crawl operation took longer than the configured timeout. Consider increasing the timeout or simplifying the crawl configuration.`;
    }

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const detail = data?.detail || data?.error || data?.message;

      if (status === 400) {
        return `Invalid request (400): ${detail || 'Bad request format'}. Check your configuration parameters.`;
      }
      if (status === 401) {
        return `Authentication failed (401): ${detail || 'Invalid credentials'}. Check your API token or username/password in credentials.`;
      }
      if (status === 403) {
        return `Access forbidden (403): ${detail || 'Insufficient permissions'}. Check your authentication credentials.`;
      }
      if (status === 404) {
        return `Endpoint not found (404): ${detail || 'The requested endpoint does not exist'}. Verify the Crawl4AI API version.`;
      }
      if (status === 422) {
        return `Validation error (422): ${detail || 'Invalid configuration parameters'}. Review your browser_config or crawler_config settings.`;
      }
      if (status === 429) {
        return `Rate limit exceeded (429): ${detail || 'Too many requests'}. Please wait before retrying.`;
      }
      if (status >= 500) {
        return `Server error (${status}): ${detail || 'Crawl4AI API encountered an internal error'}. The server may be overloaded or experiencing issues.`;
      }
      return `API error (${status}): ${detail || error.response.statusText || 'Unknown error'}`;
    }

    return error instanceof Error ? error.message : 'Unknown error occurred';
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

      if (response.data && Array.isArray(response.data.results) && response.data.results.length > 0) {
        return response.data.results[0];
      }

      return {
        url,
        success: false,
        error_message: 'No result returned from Crawl4AI API. The API responded but did not return any crawl results.',
      };
    } catch (error) {
      return {
        url,
        success: false,
        error_message: this.parseApiError(error, 'crawl'),
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

      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results;
      }

      return urls.map(url => ({
        url,
        success: false,
        error_message: 'No results returned from Crawl4AI API. The API responded but did not return any crawl results.',
      }));
    } catch (error) {
      const errorMessage = this.parseApiError(error, 'crawlMultiple');
      return urls.map(url => ({
        url,
        success: false,
        error_message: errorMessage,
      }));
    }
  }

  /**
   * Stream crawl via POST /crawl/stream — buffers all NDJSON chunks and returns full results
   */
  async crawlStream(urls: string[], config: CrawlerRunConfig): Promise<CrawlResult[]> {
    const readline = await import('readline');

    const response = await this.apiClient.post('/crawl/stream', {
      urls,
      browser_config: this.formatBrowserConfig(config),
      crawler_config: this.formatCrawlerConfig(config),
    }, {
      responseType: 'stream',
      timeout: 300000, // 5 minutes for streaming
    });

    return new Promise<CrawlResult[]>((resolve, reject) => {
      const results: CrawlResult[] = [];
      const rl = readline.createInterface({ input: response.data, crlfDelay: Infinity });

      rl.on('line', (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed);
          // Skip terminal status messages
          if (parsed.status === 'completed' || parsed.status === 'processing') return;
          results.push(parsed as CrawlResult);
        } catch {
          // Ignore non-JSON lines
        }
      });

      rl.on('close', () => resolve(results));
      rl.on('error', (err: Error) => reject(err));
      response.data.on('error', (err: Error) => reject(err));
    });
  }

  /**
   * Submit an async crawl job — POST /crawl/job — returns task_id
   */
  async submitCrawlJob(request: CrawlJobRequest): Promise<string> {
    try {
      const response = await this.apiClient.post('/crawl/job', request);
      const taskId = response.data?.task_id || response.data?.id;
      if (!taskId) {
        throw new Error('No task_id returned from /crawl/job endpoint.');
      }
      return String(taskId);
    } catch (error) {
      throw new Error(this.parseApiError(error, 'submitCrawlJob'));
    }
  }

  /**
   * Get async job status — GET /job/{task_id}
   */
  async getJobStatus(taskId: string): Promise<JobStatusResponse> {
    try {
      const response = await this.apiClient.get(`/job/${taskId}`);
      return response.data as JobStatusResponse;
    } catch (error) {
      throw new Error(this.parseApiError(error, 'getJobStatus'));
    }
  }

  /**
   * Get server health — GET /monitor/health
   */
  async getMonitorHealth(): Promise<MonitorHealth> {
    try {
      const response = await this.apiClient.get('/monitor/health');
      return response.data as MonitorHealth;
    } catch (error) {
      throw new Error(this.parseApiError(error, 'getMonitorHealth'));
    }
  }

  /**
   * Get endpoint stats — GET /monitor/endpoints/stats
   */
  async getEndpointStats(): Promise<Record<string, any>> {
    try {
      const response = await this.apiClient.get('/monitor/endpoints/stats');
      return response.data as Record<string, any>;
    } catch (error) {
      throw new Error(this.parseApiError(error, 'getEndpointStats'));
    }
  }

  /**
   * Submit an async LLM extraction job — POST /llm/job — returns task_id
   */
  async submitLlmJob(request: LlmJobRequest): Promise<string> {
    try {
      const response = await this.apiClient.post('/llm/job', request);
      const taskId = response.data?.task_id || response.data?.id;
      if (!taskId) {
        throw new Error('No task_id returned from /llm/job endpoint.');
      }
      return String(taskId);
    } catch (error) {
      throw new Error(this.parseApiError(error, 'submitLlmJob'));
    }
  }

  /**
   * Process raw HTML content
   */
  async processRawHtml(html: string, baseUrl: string, config: CrawlerRunConfig): Promise<CrawlResult> {
    try {
      const htmlSizeBytes = new TextEncoder().encode(html).length;
      const MAX_HTML_SIZE = 5 * 1024 * 1024; // 5MB
      if (htmlSizeBytes > MAX_HTML_SIZE) {
        return {
          url: baseUrl,
          success: false,
          error_message: `HTML content too large (${(htmlSizeBytes / 1024 / 1024).toFixed(2)}MB). Maximum allowed: 5MB`,
        };
      }

      const rawUrl = `raw:${html}`;
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

      if (response.data && Array.isArray(response.data.results) && response.data.results.length > 0) {
        return response.data.results[0];
      }

      return {
        url: baseUrl,
        success: false,
        error_message: 'No result returned from Crawl4AI API. The API responded but did not return any crawl results.',
      };
    } catch (error) {
      return {
        url: baseUrl,
        success: false,
        error_message: this.parseApiError(error, 'processRawHtml'),
      };
    }
  }

  /**
   * Run an advanced operation (used for Content Extractor operations)
   */
  async arun(url: string, config: CrawlerRunConfig): Promise<CrawlResult> {
    return this.crawlUrl(url, config);
  }

  /**
   * Format browser config for the API (public for use by job-submission operations)
   */
  formatBrowserConfig(config: CrawlerRunConfig): any {
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
    if (cfg.extra_args && Array.isArray(cfg.extra_args) && cfg.extra_args.length > 0) {
      params.extra_args = cfg.extra_args;
    }
    if (cfg.init_scripts && Array.isArray(cfg.init_scripts) && cfg.init_scripts.length > 0) {
      params.init_scripts = cfg.init_scripts;
    }
    if (cfg.proxy_config && typeof cfg.proxy_config === 'object' && Object.keys(cfg.proxy_config).length > 0) {
      params.proxy_config = {
        type: 'dict',
        value: cfg.proxy_config,
      };
    }

    return Object.keys(params).length > 0 ? params : {};
  }

  /**
   * Format crawler config for the API (public for use by job-submission operations)
   */
  formatCrawlerConfig(config: CrawlerRunConfig): any {
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
    if (config.prefetch === true) {
      params.prefetch = true;
    }
    if (config.preserveHttpsForInternalLinks === true) {
      params.preserve_https_for_internal_links = true;
    }

    // Use type/params wrapper ONLY if extraction strategy, deep crawl, or table extraction present
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
      const errorMessage = this.parseApiError(error, 'generatePattern');
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error(`${errorMessage} Check your LLM credentials in the node settings.`);
      }
      throw new Error(errorMessage);
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
