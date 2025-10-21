// Re-export from BasicCrawler for consistency
export {
  getCrawl4aiClient,
  createBrowserConfig,
  createCrawlerRunConfig,
  safeJsonParse,
  cleanText,
  isValidUrl
} from '../../Crawl4aiPlusBasicCrawler/helpers/utils';

import { IDataObject } from 'n8n-workflow';
import { cleanText } from '../../Crawl4aiPlusBasicCrawler/helpers/utils';
import { CssSelectorSchema, LlmSchema } from './interfaces';

/**
 * Create a CSS selector extraction strategy
 * @param schema CSS selector schema
 * @returns Extraction strategy for CSS selectors
 */
export function createCssSelectorExtractionStrategy(schema: CssSelectorSchema): any {
  return {
    type: 'JsonCssExtractionStrategy',
    params: {
      schema: {
        type: 'dict',
        value: {
          name: schema.name,
          baseSelector: schema.baseSelector,
          fields: schema.fields.map(field => ({
            name: field.name,
            selector: field.selector,
            type: field.type,
            attribute: field.attribute,
          })),
        },
      },
    },
  };
}

/**
 * Create an LLM extraction strategy
 * @param schema LLM extraction schema
 * @param instruction Instructions for LLM extraction
 * @param provider LLM provider name
 * @param apiKey API key for LLM provider
 * @param baseUrl Custom base URL for LLM provider (optional, for external LiteLLM proxies or custom endpoints)
 * @param inputFormat Input format for extraction (markdown, html, fit_markdown)
 * @returns Extraction strategy for LLM
 */
export function createLlmExtractionStrategy(
  schema: LlmSchema,
  instruction: string,
  provider: string,
  apiKey?: string,
  baseUrl?: string,
  inputFormat?: 'markdown' | 'html' | 'fit_markdown',
): any {
  const llmConfigParams: any = {
    provider: provider || 'openai/gpt-4o',
    api_token: apiKey,
  };

  // Add custom base URL if provided (for external LiteLLM proxies or custom endpoints)
  if (baseUrl && baseUrl.trim() !== '') {
    llmConfigParams.api_base = baseUrl;
  }

  const strategyParams: any = {
    llm_config: {
      type: 'LLMConfig',
      params: llmConfigParams,
    },
    instruction,
    schema: {
      type: 'dict',
      value: schema,
    },
    extraction_type: 'schema',
    apply_chunking: false,
    force_json_response: true,
  };

  // Add input_format if specified (API uses default 'markdown' if omitted)
  if (inputFormat && inputFormat !== 'markdown') {
    strategyParams.input_format = inputFormat;
  }

  return {
    type: 'LLMExtractionStrategy',
    params: strategyParams,
  };
}

/**
 * Create a Cosine extraction strategy for semantic similarity clustering
 * @param semanticFilter Keywords or topic for content filtering
 * @param options Clustering configuration options
 * @returns Extraction strategy for Cosine similarity
 */
export function createCosineExtractionStrategy(
  semanticFilter: string,
  options: IDataObject = {},
): any {
  const strategyParams: any = {
    semantic_filter: semanticFilter,
  };

  // Add optional parameters if provided
  if (options.wordCountThreshold !== undefined) {
    strategyParams.word_count_threshold = Number(options.wordCountThreshold);
  }

  if (options.simThreshold !== undefined) {
    strategyParams.sim_threshold = Number(options.simThreshold);
  }

  if (options.maxDist !== undefined) {
    strategyParams.max_dist = Number(options.maxDist);
  }

  if (options.linkageMethod !== undefined && options.linkageMethod !== '') {
    strategyParams.linkage_method = String(options.linkageMethod);
  }

  if (options.topK !== undefined) {
    strategyParams.top_k = Number(options.topK);
  }

  if (options.modelName !== undefined && options.modelName !== '') {
    strategyParams.model_name = String(options.modelName);
  }

  if (options.verbose === true) {
    strategyParams.verbose = true;
  }

  return {
    type: 'CosineStrategy',
    params: strategyParams,
  };
}

/**
 * Clean extracted data by removing extra whitespace
 */
export function cleanExtractedData(data: IDataObject): IDataObject {
  if (!data) return {};

  const cleanedData: IDataObject = {};

  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'string') {
      cleanedData[key] = cleanText(value);
    } else if (Array.isArray(value)) {
      cleanedData[key] = value.map(item => {
        if (typeof item === 'string') {
          return cleanText(item);
        } else if (typeof item === 'object' && item !== null) {
          return cleanExtractedData(item as IDataObject);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      cleanedData[key] = cleanExtractedData(value as IDataObject);
    } else {
      cleanedData[key] = value;
    }
  });

  return cleanedData;
}
