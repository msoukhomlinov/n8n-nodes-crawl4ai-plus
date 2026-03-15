import { IExecuteFunctions, IDataObject, NodeOperationError } from 'n8n-workflow';
import {
  Crawl4aiApiCredentials,
  BrowserConfig,
  CrawlerRunConfig,
  DeepCrawlStrategy,
  FullCrawlConfig,
  WebhookConfig,
  MarkdownGeneratorConfig,
  TableExtractionStrategy,
  ExtractionStrategy,
} from './interfaces';
import { Crawl4aiClient, createCrawlerInstance } from './apiClient';

/**
 * Get Crawl4AI client instance from context
 */
export async function getCrawl4aiClient(
  executeFunctions: IExecuteFunctions,
): Promise<Crawl4aiClient> {
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
export function createBrowserConfig(options: IDataObject): FullCrawlConfig {
  const config: FullCrawlConfig = {};

  if (options.browserType) {
    config.browserType = String(options.browserType);
  }

  if (options.headless === false) {
    config.headless = false;
  } else if (options.headless === true) {
    config.headless = true;
  }

  if (options.useManagedBrowser === true) {
    config.useManagedBrowser = true;
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
    if (typeof options.cookies === 'string' && options.cookies.trim()) {
      // type: 'json' fields may pass the value as a raw JSON string
      try {
        const parsed = JSON.parse(options.cookies);
        if (Array.isArray(parsed) && parsed.length > 0) {
          config.cookies = parsed as Array<object>;
        }
      } catch (e) {
        throw new Error(`Invalid cookies JSON: ${(e as Error).message}. Please check the cookie format.`);
      }
    } else if (Array.isArray(options.cookies) && options.cookies.length > 0) {
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

  if (options.headers) {
    if (typeof options.headers === 'string' && options.headers.trim()) {
      try {
        const parsed = JSON.parse(options.headers);
        if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) {
          config.headers = parsed as object;
        }
      } catch (e) {
        throw new Error(`Invalid headers JSON: ${(e as Error).message}`);
      }
    } else if (typeof options.headers === 'object' && Object.keys(options.headers as object).length > 0) {
      config.headers = options.headers as object;
    }
  }

  if (options.textMode === true) {
    config.text_mode = true;
  }

  if (options.lightMode === true) {
    config.light_mode = true;
  }

  if (options.extraArgs) {
    if (typeof options.extraArgs === 'string') {
      const args = (options.extraArgs as string).split('\n').map(a => a.trim()).filter(a => a.length > 0);
      if (args.length > 0) config.extra_args = args;
    } else if (Array.isArray(options.extraArgs) && options.extraArgs.length > 0) {
      config.extra_args = options.extraArgs as string[];
    }
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
    } else if (typeof initScripts === 'string') {
      // Handle textarea string input (newline-separated scripts)
      const scripts = (initScripts as string).split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
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
  if (options.proxyConfig) {
    let pc: any = options.proxyConfig;
    if (typeof pc === 'string' && pc.trim()) {
      try {
        pc = JSON.parse(pc);
      } catch (e) {
        throw new Error(`Invalid proxyConfig JSON: ${(e as Error).message}`);
      }
    }
    if (typeof pc === 'object' && pc !== null) {
      if (!pc.server) {
        throw new Error('proxyConfig requires a "server" field (e.g., {"server":"http://proxy:8080"}).');
      }
      const proxyObj: any = { server: pc.server };
      if (pc.username) proxyObj.username = pc.username;
      if (pc.password) proxyObj.password = pc.password;
      config.proxy_config = proxyObj;
    }
  }

  // Session and authentication options
  if (options.storageState) {
    // storageState can be JSON string or object
    if (typeof options.storageState === 'string' && options.storageState.trim() !== '') {
      try {
        config.storage_state = JSON.parse(options.storageState.trim());
      } catch (e) {
        // Only treat as file path if it looks like one
        const trimmed = options.storageState.trim();
        if (trimmed.startsWith('/') || trimmed.match(/^[a-zA-Z]:/) || trimmed.startsWith('./') || trimmed.startsWith('..')) {
          config.storage_state = trimmed;
        } else {
          throw new Error(`Invalid storageState JSON: ${(e as Error).message}. If this is a file path, use an absolute path.`);
        }
      }
    } else if (typeof options.storageState === 'object') {
      config.storage_state = options.storageState;
    }
  }

  // sessionId lives in the Browser & Session UI collection but is a CrawlerRunConfig param.
  // Pass it through so it survives the merge into the final config object.
  if (options.sessionId) {
    config.sessionId = String(options.sessionId);
  }

  if (options.usePersistentContext === true) {
    config.use_persistent_context = true;
  }

  if (options.userDataDir && typeof options.userDataDir === 'string' && options.userDataDir.trim() !== '') {
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
    // 'timeout' is the UI field name used in Browser & Session collection
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
    const strategy = options.deepCrawlStrategy as DeepCrawlStrategy;
    // Inject resume_state into strategy object if provided
    if (options.resumeState && typeof options.resumeState === 'string' && options.resumeState.trim()) {
      try {
        const resumeObj = JSON.parse(options.resumeState.trim());
        (strategy.params as Record<string, unknown>).resume_state = resumeObj;
      } catch (e) {
        throw new Error(`Invalid Resume State JSON: ${(e as Error).message}`);
      }
    }
    config.deepCrawlStrategy = strategy;
  }

  if (options.prefetch === true) {
    config.prefetch = true;
  }

  if (options.scoreLinks !== undefined) {
    config.scoreLinks = Boolean(options.scoreLinks);
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

  // Verbose/debug mode
  if (options.verbose === true) {
    config.verbose = true;
  }

  // Markdown generator with content filters
  if (options.markdownGenerator) {
    config.markdownGenerator = options.markdownGenerator as MarkdownGeneratorConfig;
  }

  return config;
}

/**
 * Create markdown generator with content filter
 * @param filterConfig Content filter configuration
 * @returns Markdown generator configuration
 */
export function createMarkdownGenerator(filterConfig: IDataObject): MarkdownGeneratorConfig {
  const generator: MarkdownGeneratorConfig = {
    type: 'DefaultMarkdownGenerator',
    params: {},
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
          ...(filterConfig.llmVerbose !== undefined ?
            { verbose: Boolean(filterConfig.llmVerbose) } : {})
        }
      };
    }
  }

  return generator;
}

/**
 * Create table extraction strategy
 * @param strategyConfig Table extraction configuration
 * @returns Table extraction strategy configuration
 */
export function createTableExtractionStrategy(strategyConfig: IDataObject): TableExtractionStrategy | undefined {
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
 * Apply output filtering config (content filter + table extraction) to a CrawlerRunConfig.
 * Extracts the duplicated boilerplate from crawlUrl, crawlMultipleUrls, and processRawHtml.
 *
 * @param of The outputFiltering IDataObject from n8n parameters
 * @param context The IExecuteFunctions context (needed for credential access if LLM filter/table is used)
 * @param itemIndex The current item index (for error reporting)
 * @returns Object with optional markdownGenerator and tableExtraction properties
 */
export async function applyOutputFilteringConfig(
  of: IDataObject,
  context: IExecuteFunctions,
  itemIndex: number,
): Promise<{ markdownGenerator?: MarkdownGeneratorConfig; tableExtraction?: TableExtractionStrategy }> {
  const result: { markdownGenerator?: MarkdownGeneratorConfig; tableExtraction?: TableExtractionStrategy } = {};

  // Hoist credential fetch for LLM features (avoids double fetch when both are active)
  let credentials: Crawl4aiApiCredentials | undefined;
  if (of.contentFilter === 'llm' || of.tableExtraction === 'llm') {
    credentials = await context.getCredentials('crawl4aiPlusApi') as unknown as Crawl4aiApiCredentials;
    if (!credentials.enableLlm) {
      throw new NodeOperationError(
        context.getNode(),
        'LLM features must be enabled in Crawl4AI credentials to use LLM content filtering or table extraction.',
        { itemIndex },
      );
    }
  }

  // Content filter -> markdown generator
  if (of.contentFilter && of.contentFilter !== 'none') {
    const filterConfig: IDataObject = { filterType: of.contentFilter };

    if (of.contentFilter === 'pruning') {
      if (of.threshold !== undefined) filterConfig.threshold = of.threshold;
      if (of.thresholdType) filterConfig.thresholdType = of.thresholdType;
      if (of.minWordThreshold !== undefined) filterConfig.minWordThreshold = of.minWordThreshold;
    } else if (of.contentFilter === 'bm25') {
      filterConfig.userQuery = of.userQuery || '';
      if (of.bm25Threshold !== undefined) filterConfig.bm25Threshold = of.bm25Threshold;
    } else if (of.contentFilter === 'llm') {
      const { llmConfig } = buildLlmConfig(credentials!);
      filterConfig.llmConfig = llmConfig;
      filterConfig.llmInstruction = of.llmInstruction || '';
      if (of.chunkTokenThreshold !== undefined) filterConfig.chunkTokenThreshold = of.chunkTokenThreshold;
      if (of.llmVerbose !== undefined) filterConfig.llmVerbose = of.llmVerbose;
    }

    result.markdownGenerator = createMarkdownGenerator(filterConfig);
  }

  // Table extraction
  if (of.tableExtraction && of.tableExtraction !== 'none') {
    const tableConfig: IDataObject = { strategyType: of.tableExtraction };

    if (of.tableExtraction === 'default') {
      if (of.tableScoreThreshold !== undefined) tableConfig.tableScoreThreshold = of.tableScoreThreshold;
      if (of.tableVerbose !== undefined) tableConfig.verbose = of.tableVerbose;
    } else if (of.tableExtraction === 'llm') {
      const { llmConfig } = buildLlmConfig(credentials!);
      tableConfig.llmConfig = llmConfig;
      if (of.tableCssSelector) tableConfig.cssSelector = of.tableCssSelector;
      if (of.tableMaxTries !== undefined) tableConfig.maxTries = of.tableMaxTries;
      if (of.tableEnableChunking !== undefined) tableConfig.enableChunking = of.tableEnableChunking;
      if (of.tableChunkTokenThreshold !== undefined) tableConfig.chunkTokenThreshold = of.tableChunkTokenThreshold;
      if (of.tableMinRowsPerChunk !== undefined) tableConfig.minRowsPerChunk = of.tableMinRowsPerChunk;
      if (of.tableMaxParallelChunks !== undefined) tableConfig.maxParallelChunks = of.tableMaxParallelChunks;
      if (of.tableLlmVerbose !== undefined) tableConfig.verbose = of.tableLlmVerbose;
    }

    result.tableExtraction = createTableExtractionStrategy(tableConfig);
  }

  return result;
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
  llmConfig: { type: 'LLMConfig'; params: Record<string, unknown> };
}

/**
 * Build LLM configuration from credentials
 * Centralises the duplicated LLM config building logic
 * @param credentials Crawl4AI credentials object
 * @returns LLM config result with provider, apiKey, and formatted llmConfig
 */
export function buildLlmConfig(credentials: Crawl4aiApiCredentials): LlmConfigResult {
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
  const llmConfig: LlmConfigResult['llmConfig'] = {
    type: 'LLMConfig',
    params: {
      provider,
      ...(apiKey ? { api_token: apiKey } : {}),
      ...(baseUrl ? { api_base: baseUrl } : {}),
    },
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
export function validateLlmCredentials(credentials: Crawl4aiApiCredentials, context: string = 'This operation'): void {
  if (!credentials.enableLlm) {
    throw new Error(
      `${context} requires LLM features. Configure an LLM provider in your Crawl4AI Plus credentials.`
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
 * @param maxTokens Optional maximum tokens for the LLM response
 * @param temperature Optional temperature for the LLM (0-1)
 * @returns LLM extraction strategy configuration object
 */
export function createLlmExtractionStrategy(
  schema: Record<string, unknown>,
  instruction: string,
  provider?: string,
  apiKey?: string,
  baseUrl?: string,
  inputFormat?: 'markdown' | 'html' | 'fit_markdown',
  maxTokens?: number,
  temperature?: number,
): ExtractionStrategy {
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
      ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    },
  };
}

/**
 * Create CSS selector extraction strategy configuration
 * @param schema CSS selector schema with baseSelector and fields
 * @returns CSS extraction strategy configuration object
 */
export function createCssSelectorExtractionStrategy(schema: { name?: string; baseSelector: string; fields: unknown[] }): ExtractionStrategy {
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
 * Build a WebhookConfig from the n8n webhookConfig collection options.
 * Returns undefined if no webhook URL is provided.
 *
 * @param webhookConfigOptions The IDataObject from getNodeParameter('webhookConfig', i, {})
 * @returns WebhookConfig or undefined
 */
export function buildWebhookConfig(webhookConfigOptions: IDataObject): WebhookConfig | undefined {
  if (!webhookConfigOptions.webhookUrl) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  const webhookHeaders = webhookConfigOptions.webhookHeaders as any;
  if (webhookHeaders?.header && Array.isArray(webhookHeaders.header)) {
    for (const h of webhookHeaders.header) {
      if (h.key && h.value) headers[h.key] = h.value;
    }
  }

  return {
    webhook_url: String(webhookConfigOptions.webhookUrl),
    webhook_data_in_payload: webhookConfigOptions.webhookDataInPayload !== false,
    ...(Object.keys(headers).length > 0 ? { webhook_headers: headers } : {}),
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
