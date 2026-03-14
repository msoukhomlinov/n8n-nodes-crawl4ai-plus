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
  }

  if (options.headless === false) {
    config.headless = false;
  } else if (options.headless === true) {
    config.headless = true;
  }

  if (options.browserMode) {
    (config as any).browserMode = String(options.browserMode);
  }

  if (options.useManagedBrowser === true) {
    (config as any).useManagedBrowser = true;
  }

  if (options.debuggingPort !== undefined) {
    (config as any).debuggingPort = Number(options.debuggingPort);
  }

  if (options.chromeChannel) {
    (config as any).chromeChannel = String(options.chromeChannel);
  }

  if (options.channel) {
    config.channel = String(options.channel);
  }

  if (options.viewportWidth !== undefined || options.viewportHeight !== undefined) {
    config.viewport = {
      ...(options.viewportWidth !== undefined ? { width: Number(options.viewportWidth) } : {}),
      ...(options.viewportHeight !== undefined ? { height: Number(options.viewportHeight) } : {}),
    } as BrowserConfig['viewport'];
  }

  if (options.javaScriptEnabled === false) {
    config.java_script_enabled = false;
  } else if (options.javaScriptEnabled === true) {
    config.java_script_enabled = true;
  }

  if (options.userAgent) {
    config.user_agent = String(options.userAgent);
  }

  if (options.ignoreHttpsErrors === true) {
    config.ignore_https_errors = true;
  } else if (options.ignoreHttpsErrors === false) {
    config.ignore_https_errors = false;
  }

  if (options.cookies) {
    if (Array.isArray(options.cookies) && options.cookies.length > 0) {
      // Raw array (from type: 'json' input in cssExtractor / llmExtractor)
      config.cookies = options.cookies as Array<object>;
    } else if (typeof options.cookies === 'object') {
      // fixedCollection format used by cosineExtractor, jsonExtractor, seoExtractor
      const cookiesObj = options.cookies as any;
      if (cookiesObj.cookieValues && Array.isArray(cookiesObj.cookieValues) && cookiesObj.cookieValues.length > 0) {
        config.cookies = cookiesObj.cookieValues as Array<object>;
      }
    }
  }

  if (options.headers && typeof options.headers === 'object' && Object.keys(options.headers as object).length > 0) {
    config.headers = options.headers as object;
  }

  if (options.textMode === true) {
    config.text_mode = true;
  }

  if (options.lightMode === true) {
    config.light_mode = true;
  }

  if (options.extraArgs && Array.isArray(options.extraArgs) && options.extraArgs.length > 0) {
    config.extra_args = options.extraArgs as string[];
  }

  if (options.enableStealth === true) {
    config.enable_stealth = true;
  }

  // init_scripts: pre-page-load JS injection (0.8.0)
  if (options.initScripts) {
    const initScripts = options.initScripts as any;
    // Handle fixedCollection format: { scripts: [{ value: '...' }, ...] }
    if (initScripts.scripts && Array.isArray(initScripts.scripts)) {
      const scripts = initScripts.scripts.map((s: any) => s.value).filter((v: string) => v);
      if (scripts.length > 0) {
        config.init_scripts = scripts;
      }
    } else if (Array.isArray(initScripts)) {
      const scripts = (initScripts as string[]).filter((v) => v);
      if (scripts.length > 0) {
        config.init_scripts = scripts;
      }
    }
  }

  // proxy_config (replaces deprecated proxy string field)
  if (options.proxyConfig && typeof options.proxyConfig === 'object') {
    const pc = options.proxyConfig as any;
    if (pc.server) {
      const proxyObj: any = { server: pc.server };
      if (pc.username) proxyObj.username = pc.username;
      if (pc.password) proxyObj.password = pc.password;
      config.proxy_config = proxyObj;
    }
  }

  // User agent mode and generator
  if (options.userAgentMode) {
    config.user_agent_mode = String(options.userAgentMode);
  }

  if (options.userAgentGeneratorConfig && typeof options.userAgentGeneratorConfig === 'object') {
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
  } else if (options.timeout !== undefined) {
    // 'timeout' is the UI field name used by all ContentExtractor browser options
    config.pageTimeout = Number(options.timeout);
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
    let strategy = options.deepCrawlStrategy as Record<string, any>;
    // Inject resume_state into strategy object if provided
    if (options.resumeState && typeof options.resumeState === 'string' && options.resumeState.trim()) {
      try {
        const resumeObj = JSON.parse(options.resumeState.trim());
        strategy = { ...strategy, resume_state: resumeObj };
      } catch (e) {
        throw new Error(`Invalid Resume State JSON: ${(e as Error).message}`);
      }
    }
    config.deepCrawlStrategy = strategy;
  }

  if (options.prefetch === true) {
    config.prefetch = true;
  }

  if (options.preserveHttpsForInternalLinks === true) {
    config.preserveHttpsForInternalLinks = true;
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

/**
 * LLM config result from buildLlmConfig
 */
export interface LlmConfigResult {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  llmConfig: any;
}

/**
 * Build LLM configuration from credentials
 * Centralises the duplicated LLM config building logic
 * @param credentials Crawl4AI credentials object
 * @returns LLM config result with provider, apiKey, and formatted llmConfig
 */
export function buildLlmConfig(credentials: any): LlmConfigResult {
  let provider = 'openai/gpt-4o';
  let apiKey = '';
  let baseUrl: string | undefined;

  if (credentials.llmProvider === 'openai') {
    const model = credentials.llmModel || 'gpt-4o';
    provider = `openai/${model}`;
    apiKey = credentials.apiKey || '';
  } else if (credentials.llmProvider === 'anthropic') {
    const model = credentials.llmModel || 'claude-3-haiku-20240307';
    provider = `anthropic/${model}`;
    apiKey = credentials.apiKey || '';
  } else if (credentials.llmProvider === 'groq') {
    const model = credentials.llmModel || 'llama3-70b-8192';
    provider = `groq/${model}`;
    apiKey = credentials.apiKey || '';
  } else if (credentials.llmProvider === 'ollama') {
    const model = credentials.ollamaModel || 'llama3';
    provider = `ollama/${model}`;
    baseUrl = credentials.ollamaUrl || 'http://localhost:11434';
    // Ollama doesn't require API key
  } else if (credentials.llmProvider === 'other') {
    provider = credentials.customProvider || 'custom/model';
    apiKey = credentials.customApiKey || '';
    baseUrl = credentials.customBaseUrl || undefined;
  }

  // Build the llmConfig object for API requests
  const llmConfig: any = {
    type: 'LLMConfig',
    params: {
      provider,
      ...(apiKey ? { api_token: apiKey } : {}),
      ...(baseUrl ? { api_base: baseUrl } : {}),
    }
  };

  return {
    provider,
    apiKey,
    baseUrl,
    llmConfig,
  };
}

/**
 * Validate LLM credentials and throw appropriate error if invalid
 * @param credentials Crawl4AI credentials object
 * @param context Context string for error message (e.g., "LLM extraction", "content filtering")
 * @throws Error if LLM is not enabled or API key is missing
 */
export function validateLlmCredentials(credentials: any, context: string = 'LLM features'): void {
  if (!credentials.enableLlm) {
    throw new Error(
      `LLM features must be enabled in Crawl4AI credentials to use ${context}.`
    );
  }

  // Validate API key for non-Ollama providers
  if (credentials.llmProvider !== 'ollama') {
    let apiKey = '';
    if (credentials.llmProvider === 'other') {
      apiKey = credentials.customApiKey || '';
    } else {
      apiKey = credentials.apiKey || '';
    }

    if (!apiKey) {
      throw new Error(
        `API key is required for ${credentials.llmProvider} provider. Please configure it in the Crawl4AI credentials.`
      );
    }
  }
}

/**
 * Create LLM extraction strategy configuration
 * @param schema JSON schema for extraction
 * @param instruction Extraction instruction for the LLM
 * @param provider LLM provider string (e.g., "openai/gpt-4o")
 * @param apiKey API key for the provider
 * @param baseUrl Optional base URL for the API
 * @param inputFormat Optional input format ('markdown', 'html', 'fit_markdown')
 * @returns LLM extraction strategy configuration object
 */
export function createLlmExtractionStrategy(
  schema: any,
  instruction: string,
  provider?: string,
  apiKey?: string,
  baseUrl?: string,
  inputFormat?: 'markdown' | 'html' | 'fit_markdown'
): any {
  return {
    type: 'LLMExtractionStrategy',
    params: {
      llm_config: {
        type: 'LLMConfig',
        params: {
          provider: provider || 'openai/gpt-4o',
          ...(apiKey ? { api_token: apiKey } : {}),
          ...(baseUrl ? { api_base: baseUrl } : {}),
        }
      },
      schema: { type: 'dict', value: schema },
      instruction,
      extraction_type: 'schema',
      ...(inputFormat ? { input_format: inputFormat } : {}),
    },
  };
}

/**
 * Create CSS selector extraction strategy configuration
 * @param schema CSS selector schema with baseSelector and fields
 * @returns CSS extraction strategy configuration object
 */
export function createCssSelectorExtractionStrategy(schema: any): any {
  return {
    type: 'JsonCssExtractionStrategy',
    params: {
      schema: {
        type: 'dict',
        value: {
          name: schema.name || 'ExtractedData',
          baseSelector: schema.baseSelector,
          fields: schema.fields,
        },
      },
    },
  };
}

/**
 * Clean extracted data by normalizing whitespace in string values
 * @param data Extracted data object or array
 * @returns Cleaned data with normalized whitespace
 */
export function cleanExtractedData(data: any): any {
  if (typeof data === 'string') {
    return cleanText(data);
  }

  if (Array.isArray(data)) {
    return data.map(item => cleanExtractedData(item));
  }

  if (typeof data === 'object' && data !== null) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(data)) {
      cleaned[key] = cleanExtractedData(value);
    }
    return cleaned;
  }

  return data;
}
