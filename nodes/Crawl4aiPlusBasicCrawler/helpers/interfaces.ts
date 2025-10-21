import { IDataObject } from 'n8n-workflow';

// Credentials interface
export interface Crawl4aiApiCredentials {
  connectionMode: 'direct' | 'docker';
  // Docker settings
  dockerUrl?: string;
  authenticationType?: 'none' | 'token' | 'basic';
  apiToken?: string;
  username?: string;
  password?: string;
  // LLM settings
  enableLlm?: boolean;
  llmProvider?: string;
  llmModel?: string;
  apiKey?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  customProvider?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  // Cache settings
  cacheDir?: string;
}

// Node options interface
export interface Crawl4aiNodeOptions extends IDataObject {
  bypassCache?: boolean;
  includeMedia?: boolean;
  verboseResponse?: boolean;
  cacheMode?: 'ENABLED' | 'BYPASS' | 'DISABLED' | 'READ_ONLY' | 'WRITE_ONLY';
}

// Browser configuration interface
export interface BrowserConfig {
  browser_type?: string;
  headless?: boolean;
  browser_mode?: string;
  use_managed_browser?: boolean;
  cdp_url?: string;
  debugging_port?: number;
  use_persistent_context?: boolean;
  user_data_dir?: string;
  chrome_channel?: string;
  channel?: string;
  proxy?: string;
  viewport_width?: number;
  viewport_height?: number;
  viewport?: {
    width: number;
    height: number;
  };
  accept_downloads?: boolean;
  downloads_path?: string;
  storage_state?: string | object;
  ignore_https_errors?: boolean;
  java_script_enabled?: boolean;
  cookies?: Array<object>;
  headers?: object;
  user_agent?: string;
  user_agent_mode?: string;
  user_agent_generator_config?: object;
  text_mode?: boolean;
  light_mode?: boolean;
  extra_args?: Array<string>;
  host?: string;
  enable_stealth?: boolean;
}

// Crawler run configuration interface
export interface CrawlerRunConfig {
  // Cache and Performance
  cacheMode?: 'ENABLED' | 'BYPASS' | 'DISABLED' | 'READ_ONLY' | 'WRITE_ONLY';
  streamEnabled?: boolean;

  // Timing and Timeouts
  pageTimeout?: number;
  requestTimeout?: number;
  waitUntil?: string;
  waitFor?: string;
  waitForTimeout?: number;
  waitForImages?: boolean;
  delayBeforeReturnHtml?: number;

  // JavaScript and Page Interaction
  jsCode?: string | string[];
  jsOnly?: boolean;
  ignoreBodyVisibility?: boolean;
  scanFullPage?: boolean;
  scrollDelay?: number;
  maxScrollSteps?: number;
  processIframes?: boolean;
  removeOverlayElements?: boolean;
  simulateUser?: boolean;
  overrideNavigator?: boolean;
  magic?: boolean;
  adjustViewportToContent?: boolean;

  // Content Selection and Filtering
  cssSelector?: string;
  targetElements?: string[];
  excludedTags?: string[];
  excludedSelector?: string;
  keepDataAttributes?: boolean;
  keepAttrs?: string[];
  removeForms?: boolean;
  onlyText?: boolean;
  wordCountThreshold?: number;

  // Links and External Resources
  excludeExternalLinks?: boolean;
  excludeInternalLinks?: boolean;
  excludeSocialMediaLinks?: boolean;
  excludeDomains?: string[];
  scoreLinks?: boolean;

  // Media and Screenshots
  screenshot?: boolean;
  screenshotWaitFor?: number;
  screenshotHeightThreshold?: number;
  pdf?: boolean;
  fetchSslCertificate?: boolean;
  imageDescriptionMinWordThreshold?: number;
  imageScoreThreshold?: number;
  excludeExternalImages?: boolean;
  excludeAllImages?: boolean;
  tableScoreThreshold?: number;

  // Network and Connection
  checkRobotsTxt?: boolean;
  userAgentMode?: string;
  userAgentGeneratorConfig?: object;
  method?: string;

  // Session and Context
  sessionId?: string;
  sharedData?: object;
  maxRetries?: number;

  // Browser Configuration passthrough (convenience for API client)
  viewport?: {
    width: number;
    height: number;
  };
  headless?: boolean;

  // Logging and Debug
  verbose?: boolean;
  logConsole?: boolean;
  captureNetworkRequests?: boolean;
  captureConsoleMessages?: boolean;

  // Extraction and Processing
  extractionStrategy?: any;
  chunkingStrategy?: any;
  markdownGenerator?: any;
  scrapingStrategy?: any;
  proxyConfig?: object;
  tableExtraction?: any;

  // Advanced Features
  linkPreviewConfig?: object;
  virtualScrollConfig?: object;
  deepCrawlStrategy?: Record<string, any>;
  experimental?: object;
}

// Crawl result interface
export interface CrawlResult {
  url: string;
  success: boolean;
  status_code?: number;
  title?: string;
  markdown?: string | {
    raw_markdown?: string;
    fit_markdown?: string;
    markdown_with_citations?: string;
    references_markdown?: string;
    fit_html?: string;
  };
  html?: string;
  cleaned_html?: string;
  text?: string;
  links?: {
    internal: Link[];
    external: Link[];
  };
  media?: {
    images: Media[];
    videos: Media[];
    audios?: Media[];
  };
  screenshot?: string; // Base64 encoded
  pdf?: string | Buffer; // Base64 encoded or binary
  ssl_certificate?: SslCertificate;
  extracted_content?: string;
  tables?: TableResult[];
  error_message?: string;
  crawl_time?: number;
  metadata?: Record<string, any>;
}

// SSL Certificate interface
export interface SslCertificate {
  issuer?: Record<string, string>;
  subject?: Record<string, string>;
  valid_from?: string;
  valid_until?: string;
  valid_to?: string;
  fingerprint?: string;
  fingerprint256?: string;
  serialNumber?: string;
  raw?: string;
}

// Link interface
export interface Link {
  href: string;
  text: string;
  title?: string;
}

// Media interface
export interface Media {
  src: string;
  alt?: string;
  title?: string;
  type?: string;
}

// Table result interface
export interface TableResult {
  headers: string[];
  rows: string[][];
  caption?: string;
  metadata?: {
    rowCount: number;
    columnCount: number;
    hasRowspan?: boolean;
    hasColspan?: boolean;
    [key: string]: any;
  };
}

// CSS Selector Schema Field (for Content Extractor)
export interface CssSelectorField {
  name: string;
  selector: string;
  type: 'text' | 'attribute' | 'html';
  attribute?: string;
}

// CSS Selector Schema (for Content Extractor)
export interface CssSelectorSchema {
  name: string;
  baseSelector: string;
  fields: CssSelectorField[];
}

// LLM Extraction Schema Field (for Content Extractor)
export interface LlmSchemaField {
  name: string;
  type: string;
  description?: string;
}

// LLM Extraction Schema (for Content Extractor)
export interface LlmSchema {
  title?: string;
  type: 'object';
  properties: Record<string, LlmSchemaField>;
  required?: string[];
}
