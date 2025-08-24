// Re-export from BasicCrawler for consistency
export {
  getCrawl4aiClient,
  createBrowserConfig,
  createCrawlerRunConfig,
  safeJsonParse,
  cleanText,
  isValidUrl
} from '../../Crawl4aiBasicCrawler/helpers/utils';

import { IDataObject } from 'n8n-workflow';
import { cleanText } from '../../Crawl4aiBasicCrawler/helpers/utils';
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
 * @returns Extraction strategy for LLM
 */
export function createLlmExtractionStrategy(
  schema: LlmSchema,
  instruction: string,
  provider: string,
  apiKey?: string,
): any {
  return {
    type: 'LLMExtractionStrategy',
    params: {
      llm_config: {
        type: 'LLMConfig',
        params: {
          provider: provider || 'openai/gpt-4o',
          api_token: apiKey,
        },
      },
      instruction,
      schema: {
        type: 'dict',
        value: schema,
      },
      extraction_type: 'schema',
      apply_chunking: false,
      force_json_response: true,
    },
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
