import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// Import helpers and types
import type { Crawl4aiNodeOptions } from '../helpers/interfaces';
import {
  getCrawl4aiClient,
  createCrawlerRunConfig,
  isValidUrl
} from '../helpers/utils';

// --- UI Definition ---
export const description: INodeProperties[] = [
  {
    displayName: 'URL',
    name: 'url',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'https://example.com',
    description: 'The URL to extract SEO metadata from',
    displayOptions: {
      show: {
        operation: ['seoExtractor'],
      },
    },
  },
  {
    displayName: 'Metadata Types',
    name: 'metadataTypes',
    type: 'multiOptions',
    options: [
      {
        name: 'Basic Meta Tags',
        value: 'basic',
        description: 'Title, description, keywords, canonical URL',
      },
      {
        name: 'JSON-LD Structured Data',
        value: 'jsonLd',
        description: 'Schema.org structured data in JSON-LD format',
      },
      {
        name: 'Language & Locale',
        value: 'language',
        description: 'HTML lang, hreflang tags, locale settings',
      },
			{
        name: 'Open Graph (OG) Tags',
        value: 'openGraph',
        description: 'OG title, description, image, type, URL',
      },
      {
        name: 'Robots & Indexing',
        value: 'robots',
        description: 'Robots meta, noindex, nofollow directives',
      },
			{
        name: 'Twitter Cards',
        value: 'twitter',
        description: 'Twitter card metadata',
      },
    ],
    default: ['basic', 'openGraph', 'jsonLd'],
    description: 'Select which types of SEO metadata to extract',
    displayOptions: {
      show: {
        operation: ['seoExtractor'],
      },
    },
  },
  {
    displayName: 'Browser Options',
    name: 'browserOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['seoExtractor'],
      },
    },
    options: [
      {
        displayName: 'Browser Type',
        name: 'browserType',
        type: 'options',
        options: [
          {
            name: 'Chromium',
            value: 'chromium',
            description: 'Use Chromium browser (default, most compatible)',
          },
          {
            name: 'Firefox',
            value: 'firefox',
            description: 'Use Firefox browser',
          },
          {
            name: 'Webkit',
            value: 'webkit',
            description: 'Use Webkit browser (Safari engine)',
          },
        ],
        default: 'chromium',
        description: 'Which browser engine to use for crawling',
      },
      {
        displayName: 'Enable JavaScript',
        name: 'java_script_enabled',
        type: 'boolean',
        default: true,
        description: 'Whether to enable JavaScript execution (recommended for dynamic SEO tags)',
      },
      {
        displayName: 'Headless Mode',
        name: 'headless',
        type: 'boolean',
        default: true,
        description: 'Whether to run browser in headless mode',
      },
      {
        displayName: 'Timeout (MS)',
        name: 'timeout',
        type: 'number',
        default: 30000,
        description: 'Maximum time to wait for the browser to load the page',
      },
      {
        displayName: 'Wait For',
        name: 'waitFor',
        type: 'string',
        default: '',
        placeholder: 'head',
        description: 'CSS selector to wait for before extracting (useful for dynamically injected meta tags)',
      },
    ],
  },
  {
    displayName: 'Options',
    name: 'options',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['seoExtractor'],
      },
    },
    options: [
      {
        displayName: 'Cache Mode',
        name: 'cacheMode',
        type: 'options',
        options: [
          {
            name: 'Bypass (Skip Cache)',
            value: 'BYPASS',
            description: 'Skip cache for this operation, fetch fresh content',
          },
          {
            name: 'Disabled (No Cache)',
            value: 'DISABLED',
            description: 'No caching at all',
          },
          {
            name: 'Enabled (Read/Write)',
            value: 'ENABLED',
            description: 'Use cache if available, save new results to cache',
          },
          {
            name: 'Read Only',
            value: 'READ_ONLY',
            description: 'Only read from cache, do not write new results',
          },
          {
            name: 'Write Only',
            value: 'WRITE_ONLY',
            description: 'Only write to cache, do not read existing cache',
          },
        ],
        default: 'ENABLED',
        description: 'How to use the cache when crawling',
      },
      {
        displayName: 'Include Raw HTML',
        name: 'includeRawHtml',
        type: 'boolean',
        default: false,
        description: 'Whether to include the raw HTML head section in output',
      },
    ],
  },
];

// --- SEO Field Definitions ---

interface SeoField {
  name: string;
  selector: string;
  type: 'text' | 'attribute' | 'html';
  attribute?: string;
}

const SEO_FIELDS: Record<string, SeoField[]> = {
  basic: [
    { name: 'title', selector: 'title', type: 'text' },
    { name: 'metaDescription', selector: 'meta[name="description"]', type: 'attribute', attribute: 'content' },
    { name: 'metaKeywords', selector: 'meta[name="keywords"]', type: 'attribute', attribute: 'content' },
    { name: 'canonicalUrl', selector: 'link[rel="canonical"]', type: 'attribute', attribute: 'href' },
    { name: 'author', selector: 'meta[name="author"]', type: 'attribute', attribute: 'content' },
    { name: 'viewport', selector: 'meta[name="viewport"]', type: 'attribute', attribute: 'content' },
  ],
  openGraph: [
    { name: 'ogTitle', selector: 'meta[property="og:title"]', type: 'attribute', attribute: 'content' },
    { name: 'ogDescription', selector: 'meta[property="og:description"]', type: 'attribute', attribute: 'content' },
    { name: 'ogImage', selector: 'meta[property="og:image"]', type: 'attribute', attribute: 'content' },
    { name: 'ogType', selector: 'meta[property="og:type"]', type: 'attribute', attribute: 'content' },
    { name: 'ogUrl', selector: 'meta[property="og:url"]', type: 'attribute', attribute: 'content' },
    { name: 'ogSiteName', selector: 'meta[property="og:site_name"]', type: 'attribute', attribute: 'content' },
    { name: 'ogLocale', selector: 'meta[property="og:locale"]', type: 'attribute', attribute: 'content' },
  ],
  twitter: [
    { name: 'twitterCard', selector: 'meta[name="twitter:card"]', type: 'attribute', attribute: 'content' },
    { name: 'twitterTitle', selector: 'meta[name="twitter:title"]', type: 'attribute', attribute: 'content' },
    { name: 'twitterDescription', selector: 'meta[name="twitter:description"]', type: 'attribute', attribute: 'content' },
    { name: 'twitterImage', selector: 'meta[name="twitter:image"]', type: 'attribute', attribute: 'content' },
    { name: 'twitterSite', selector: 'meta[name="twitter:site"]', type: 'attribute', attribute: 'content' },
    { name: 'twitterCreator', selector: 'meta[name="twitter:creator"]', type: 'attribute', attribute: 'content' },
  ],
  robots: [
    { name: 'robots', selector: 'meta[name="robots"]', type: 'attribute', attribute: 'content' },
    { name: 'googlebot', selector: 'meta[name="googlebot"]', type: 'attribute', attribute: 'content' },
    { name: 'bingbot', selector: 'meta[name="bingbot"]', type: 'attribute', attribute: 'content' },
  ],
  language: [
    { name: 'htmlLang', selector: 'html', type: 'attribute', attribute: 'lang' },
    { name: 'contentLanguage', selector: 'meta[http-equiv="content-language"]', type: 'attribute', attribute: 'content' },
  ],
};

// --- Execution Logic ---
export async function execute(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
  const allResults: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      // Get parameters for the current item
      const url = this.getNodeParameter('url', i, '') as string;
      const metadataTypes = this.getNodeParameter('metadataTypes', i, ['basic', 'openGraph', 'jsonLd']) as string[];
      const browserOptions = this.getNodeParameter('browserOptions', i, {}) as IDataObject;
      const options = this.getNodeParameter('options', i, {}) as IDataObject;

      if (!url) {
        throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
      }

      if (!isValidUrl(url)) {
        throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
      }

      if (!metadataTypes || metadataTypes.length === 0) {
        throw new NodeOperationError(this.getNode(), 'At least one metadata type must be selected.', { itemIndex: i });
      }

      // Build combined field list based on selected metadata types
      const fields: SeoField[] = [];
      for (const metaType of metadataTypes) {
        if (metaType !== 'jsonLd' && SEO_FIELDS[metaType]) {
          fields.push(...SEO_FIELDS[metaType]);
        }
      }

      // Build CSS extraction strategy for meta tags
      const extractionStrategy: any = fields.length > 0 ? {
        type: 'JsonCssExtractionStrategy',
        params: {
          schema: {
            type: 'dict',
            value: {
              name: 'SEO_Metadata',
              baseSelector: 'html',
              fields: fields.map(field => ({
                name: field.name,
                selector: field.selector,
                type: field.type,
                ...(field.attribute ? { attribute: field.attribute } : {}),
              })),
            },
          },
        },
      } : null;

      // Build crawler config
      const crawlerOptions: any = {
        ...browserOptions,
        cacheMode: options.cacheMode || 'ENABLED',
        waitFor: browserOptions.waitFor,
      };

      const crawlerConfig = createCrawlerRunConfig(crawlerOptions);

      // Set extraction strategy if we have fields
      if (extractionStrategy) {
        crawlerConfig.extractionStrategy = extractionStrategy;
      }

      // Get crawler instance
      const crawler = await getCrawl4aiClient(this);

      // Run the crawl
      const result = await crawler.arun(url, crawlerConfig);

      if (!result.success) {
        throw new NodeOperationError(
          this.getNode(),
          `Failed to crawl URL: ${result.error_message || 'Unknown error'}`,
          { itemIndex: i }
        );
      }

      // Parse extracted content
      let seoData: IDataObject = {};

      if (result.extracted_content) {
        try {
          const parsed = JSON.parse(result.extracted_content);
          // CSS extraction returns an array, take the first item
          if (Array.isArray(parsed) && parsed.length > 0) {
            seoData = { ...seoData, ...parsed[0] };
          } else if (typeof parsed === 'object') {
            seoData = { ...seoData, ...parsed };
          }
        } catch (e) {
          // Ignore parse errors, continue with other extractions
        }
      }

      // Extract JSON-LD if requested
      if (metadataTypes.includes('jsonLd')) {
        const jsonLdData = extractJsonLd(result.html || result.cleaned_html || '');
        if (jsonLdData.length > 0) {
          seoData.jsonLd = jsonLdData;
        }
      }

      // Extract hreflang tags if language metadata requested
      if (metadataTypes.includes('language')) {
        const hreflangTags = extractHreflang(result.html || result.cleaned_html || '');
        if (hreflangTags.length > 0) {
          seoData.hreflang = hreflangTags;
        }
      }

      // Build result
      const formattedResult: IDataObject = {
        url,
        success: true,
        seo: seoData,
        ...(options.includeRawHtml ? { rawHtml: extractHead(result.html || '') } : {}),
      };

      // Add the result to the output array
      allResults.push({
        json: formattedResult,
        pairedItem: { item: i },
      });

    } catch (error) {
      // Handle continueOnFail or re-throw
      if (this.continueOnFail()) {
        const node = this.getNode();
        const errorItemIndex = (error as any).itemIndex ?? i;
        allResults.push({
          json: items[i].json,
          error: new NodeOperationError(node, (error as Error).message, { itemIndex: errorItemIndex }),
          pairedItem: { item: i },
        });
        continue;
      }
      // If not continueOnFail, re-throw the error
      throw error;
    }
  }

  return allResults;
}

// --- Helper Functions ---

/**
 * Extract JSON-LD structured data from HTML
 */
function extractJsonLd(html: string): any[] {
  const jsonLdData: any[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      jsonLdData.push(data);
    } catch (e) {
      // Skip invalid JSON-LD blocks
    }
  }

  return jsonLdData;
}

/**
 * Extract hreflang tags from HTML
 */
function extractHreflang(html: string): Array<{ lang: string; href: string }> {
  const hreflangTags: Array<{ lang: string; href: string }> = [];
  const regex = /<link[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
  const regex2 = /<link[^>]*hreflang=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
  const regex3 = /<link[^>]*href=["']([^"']+)["'][^>]*hreflang=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*\/?>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    hreflangTags.push({ lang: match[1], href: match[2] });
  }

  while ((match = regex2.exec(html)) !== null) {
    hreflangTags.push({ lang: match[1], href: match[2] });
  }

  while ((match = regex3.exec(html)) !== null) {
    hreflangTags.push({ lang: match[2], href: match[1] });
  }

  // Remove duplicates
  const seen = new Set<string>();
  return hreflangTags.filter(tag => {
    const key = `${tag.lang}:${tag.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract <head> section from HTML
 */
function extractHead(html: string): string {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return match ? match[1] : '';
}
