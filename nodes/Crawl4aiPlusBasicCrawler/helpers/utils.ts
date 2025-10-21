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
  const credentials = await executeFunctions.getCredentials('crawl4aiPlusApi') as unknown as Crawl4aiApiCredentials;

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
  const config: BrowserConfig = {};

  if (options.browserType) {
    (config as any).browserType = String(options.browserType);
    config.browser_type = String(options.browserType);
  }

  if (options.headless === false) {
    config.headless = false;
  } else if (options.headless === true) {
    config.headless = true;
  }

  if (options.browserMode) {
    (config as any).browserMode = String(options.browserMode);
    config.browser_mode = String(options.browserMode);
  }

  if (options.useManagedBrowser === true) {
    (config as any).useManagedBrowser = true;
    config.use_managed_browser = true;
  }

  if (options.debuggingPort !== undefined) {
    (config as any).debuggingPort = Number(options.debuggingPort);
    config.debugging_port = Number(options.debuggingPort);
  }

  if (options.chromeChannel) {
    (config as any).chromeChannel = String(options.chromeChannel);
    config.chrome_channel = String(options.chromeChannel);
  }

  if (options.channel) {
    (config as any).channel = String(options.channel);
    config.channel = String(options.channel);
  }

  if (options.viewportWidth !== undefined || options.viewportHeight !== undefined) {
    config.viewport = {
      ...(options.viewportWidth !== undefined ? { width: Number(options.viewportWidth) } : {}),
      ...(options.viewportHeight !== undefined ? { height: Number(options.viewportHeight) } : {}),
    } as BrowserConfig['viewport'];
  }

  if (options.javaScriptEnabled === false) {
    (config as any).javaScriptEnabled = false;
    config.java_script_enabled = false;
  } else if (options.javaScriptEnabled === true) {
    (config as any).javaScriptEnabled = true;
    config.java_script_enabled = true;
  }

  if (options.userAgent) {
    (config as any).userAgent = String(options.userAgent);
    config.user_agent = String(options.userAgent);
  }

  if (options.ignoreHttpsErrors === true) {
    (config as any).ignoreHttpsErrors = true;
    config.ignore_https_errors = true;
  } else if (options.ignoreHttpsErrors === false) {
    (config as any).ignoreHttpsErrors = false;
    config.ignore_https_errors = false;
  }

  if (options.cookies && Array.isArray(options.cookies) && options.cookies.length > 0) {
    config.cookies = options.cookies as Array<object>;
  }

  if (options.headers && typeof options.headers === 'object' && Object.keys(options.headers as object).length > 0) {
    config.headers = options.headers as object;
  }

  if (options.textMode === true) {
    (config as any).textMode = true;
    config.text_mode = true;
  }

  if (options.lightMode === true) {
    (config as any).lightMode = true;
    config.light_mode = true;
  }

  if (options.extraArgs && Array.isArray(options.extraArgs) && options.extraArgs.length > 0) {
    (config as any).extraArgs = options.extraArgs as string[];
    config.extra_args = options.extraArgs as string[];
  }

  if (options.enableStealth === true) {
    (config as any).enableStealth = true;
    config.enable_stealth = true;
  }

  // User agent mode and generator
  if (options.userAgentMode) {
    (config as any).userAgentMode = String(options.userAgentMode);
    config.user_agent_mode = String(options.userAgentMode);
  }

  if (options.userAgentGeneratorConfig && typeof options.userAgentGeneratorConfig === 'object') {
    (config as any).userAgentGeneratorConfig = options.userAgentGeneratorConfig;
    config.user_agent_generator_config = options.userAgentGeneratorConfig as object;
  }

  // Session and authentication options
  if (options.storageState) {
    // storageState can be JSON string or object
    if (typeof options.storageState === 'string' && options.storageState.trim() !== '') {
      try {
        config.storage_state = JSON.parse(options.storageState.trim());
      } catch (e) {
        // If parsing fails, pass as-is (might be a file path)
        config.storage_state = options.storageState.trim();
      }
    } else if (typeof options.storageState === 'object') {
      config.storage_state = options.storageState;
    }
  }

  if (options.usePersistentContext === true) {
    (config as any).usePersistentContext = true;
    config.use_persistent_context = true;
  }

  if (options.userDataDir && typeof options.userDataDir === 'string' && options.userDataDir.trim() !== '') {
    (config as any).userDataDir = String(options.userDataDir).trim();
    config.user_data_dir = String(options.userDataDir).trim();
  }

  return config;
}

/**
 * Convert n8n options to Crawl4AI crawler run configuration
 * @param options Node options from n8n
 * @returns Crawler run configuration for Crawl4AI
 */
export function createCrawlerRunConfig(options: IDataObject): CrawlerRunConfig {
  const config: CrawlerRunConfig = {};

  if (options.cacheMode) {
    config.cacheMode = options.cacheMode as CrawlerRunConfig['cacheMode'];
  }

  if (options.streamEnabled === true) {
    config.streamEnabled = true;
  }

  if (options.pageTimeout !== undefined) {
    config.pageTimeout = Number(options.pageTimeout);
  }

  if (options.requestTimeout !== undefined) {
    config.requestTimeout = Number(options.requestTimeout);
  }

  if (options.waitUntil) {
    config.waitUntil = String(options.waitUntil);
  }

  if (options.waitFor) {
    config.waitFor = String(options.waitFor);
  }

  if (options.jsCode) {
    config.jsCode = options.jsCode as string | string[];
  }

  if (options.jsOnly === true) {
    config.jsOnly = true;
  }

  if (options.cssSelector) {
    config.cssSelector = String(options.cssSelector);
  }

  const excludedTags: string[] = [];
  if (options.excludedTags) {
    if (typeof options.excludedTags === 'string') {
      excludedTags.push(
        ...String(options.excludedTags)
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0)
      );
    } else if (Array.isArray(options.excludedTags)) {
      excludedTags.push(...(options.excludedTags as string[]));
    }
  }
  if (excludedTags.length > 0) {
    config.excludedTags = excludedTags;
  }

  if (options.excludeExternalLinks === true) {
    config.excludeExternalLinks = true;
  }

  if (options.checkRobotsTxt === true) {
    config.checkRobotsTxt = true;
  }

  if (options.wordCountThreshold !== undefined) {
    const threshold = Number(options.wordCountThreshold);
    if (!Number.isNaN(threshold)) {
      config.wordCountThreshold = threshold;
    }
  }

  if (options.sessionId) {
    config.sessionId = String(options.sessionId);
  }

  if (options.maxRetries !== undefined) {
    config.maxRetries = Number(options.maxRetries);
  }

  if (options.deepCrawlStrategy) {
    config.deepCrawlStrategy = options.deepCrawlStrategy as Record<string, any>;
  }

  // Output format options
  if (options.screenshot === true) {
    config.screenshot = true;
  }

  if (options.pdf === true) {
    config.pdf = true;
  }

  if (options.fetchSslCertificate === true) {
    config.fetchSslCertificate = true;
  }

  // Link and media filtering
  if (options.excludeSocialMediaLinks === true) {
    config.excludeSocialMediaLinks = true;
  }

  if (options.excludeExternalImages === true) {
    config.excludeExternalImages = true;
  }

  // Anti-bot and simulation features
  if (options.magic === true) {
    config.magic = true;
  }

  if (options.simulateUser === true) {
    config.simulateUser = true;
  }

  if (options.overrideNavigator === true) {
    config.overrideNavigator = true;
  }

  // Timing controls
  if (options.delayBeforeReturnHtml !== undefined) {
    config.delayBeforeReturnHtml = Number(options.delayBeforeReturnHtml);
  }

  if (options.waitUntil) {
    config.waitUntil = String(options.waitUntil);
  }

  // Verbose/debug mode
  if (options.verbose === true) {
    config.verbose = true;
  }

  // Markdown generator with content filters
  if (options.markdownGenerator) {
    config.markdownGenerator = options.markdownGenerator;
  }

  return config;
}

/**
 * Create markdown generator with content filter
 * @param filterConfig Content filter configuration
 * @returns Markdown generator configuration
 */
export function createMarkdownGenerator(filterConfig: IDataObject): any {
  const generator: any = {
    type: 'DefaultMarkdownGenerator',
    params: {}
  };

  if (filterConfig.filterType && filterConfig.filterType !== 'none') {
    if (filterConfig.filterType === 'pruning') {
      // Pruning content filter
      generator.params.content_filter = {
        type: 'PruningContentFilter',
        params: {
          threshold: filterConfig.threshold !== undefined ? Number(filterConfig.threshold) : 0.48,
          threshold_type: filterConfig.thresholdType || 'fixed',
          ...(filterConfig.minWordThreshold !== undefined ? { min_word_threshold: Number(filterConfig.minWordThreshold) } : {})
        }
      };
    } else if (filterConfig.filterType === 'bm25') {
      // BM25 content filter
      generator.params.content_filter = {
        type: 'BM25ContentFilter',
        params: {
          user_query: filterConfig.userQuery || '',
          bm25_threshold: filterConfig.bm25Threshold !== undefined ? Number(filterConfig.bm25Threshold) : 1.0
        }
      };
    } else if (filterConfig.filterType === 'llm') {
      // LLM content filter
      generator.params.content_filter = {
        type: 'LLMContentFilter',
        params: {
          llm_config: filterConfig.llmConfig,  // Passed from execution
          instruction: filterConfig.llmInstruction || '',
          ...(filterConfig.chunkTokenThreshold !== undefined ?
            { chunk_token_threshold: Number(filterConfig.chunkTokenThreshold) } : {}),
          ...(filterConfig.ignoreCache !== undefined ?
            { ignore_cache: Boolean(filterConfig.ignoreCache) } : {}),
          ...(filterConfig.llmVerbose !== undefined ?
            { verbose: Boolean(filterConfig.llmVerbose) } : {})
        }
      };
    }
  }

  // Markdown generation options
  if (filterConfig.ignoreLinks === true) {
    generator.params.options = {
      ...(generator.params.options || {}),
      ignore_links: true
    };
  }

  return generator;
}

/**
 * Create table extraction strategy
 * @param strategyConfig Table extraction configuration
 * @returns Table extraction strategy configuration
 */
export function createTableExtractionStrategy(strategyConfig: IDataObject): any {
  const strategyType = strategyConfig.strategyType;

  if (!strategyType || strategyType === 'none') {
    return undefined;
  }

  if (strategyType === 'llm') {
    // LLM Table Extraction
    return {
      type: 'LLMTableExtraction',
      params: {
        llm_config: strategyConfig.llmConfig,  // Passed from execution
        ...(strategyConfig.cssSelector ? { css_selector: strategyConfig.cssSelector } : {}),
        ...(strategyConfig.verbose !== undefined ? { verbose: Boolean(strategyConfig.verbose) } : {}),
        ...(strategyConfig.maxTries !== undefined ? { max_tries: Number(strategyConfig.maxTries) } : {}),
        ...(strategyConfig.enableChunking !== undefined ? { enable_chunking: Boolean(strategyConfig.enableChunking) } : {}),
        ...(strategyConfig.chunkTokenThreshold !== undefined ?
          { chunk_token_threshold: Number(strategyConfig.chunkTokenThreshold) } : {}),
        ...(strategyConfig.minRowsPerChunk !== undefined ?
          { min_rows_per_chunk: Number(strategyConfig.minRowsPerChunk) } : {}),
        ...(strategyConfig.maxParallelChunks !== undefined ?
          { max_parallel_chunks: Number(strategyConfig.maxParallelChunks) } : {})
      }
    };
  } else if (strategyType === 'default') {
    // Default Table Extraction
    return {
      type: 'DefaultTableExtraction',
      params: {
        ...(strategyConfig.tableScoreThreshold !== undefined ?
          { table_score_threshold: Number(strategyConfig.tableScoreThreshold) } : {}),
        ...(strategyConfig.verbose !== undefined ? { verbose: Boolean(strategyConfig.verbose) } : {})
      }
    };
  }

  return undefined;
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
