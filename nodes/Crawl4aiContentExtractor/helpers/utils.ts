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
import { CssSelectorSchema, LlmSchema } from './interfaces';

/**
 * Create a CSS selector extraction strategy
 * @param schema CSS selector schema
 * @returns Extraction strategy for CSS selectors
 */
export function createCssSelectorExtractionStrategy(schema: CssSelectorSchema): any {
  return {
    type: 'css',
    schema: {
      name: schema.name,
      baseSelector: schema.baseSelector,
      fields: schema.fields.map(field => ({
        name: field.name,
        selector: field.selector,
        type: field.type,
        attribute: field.attribute,
      })),
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
    type: 'llm',
    schema: {
      ...schema,
      properties: Object.entries(schema.properties).reduce((acc, [key, prop]) => {
        acc[key] = {
          type: prop.type,
          description: prop.description,
        };
        return acc;
      }, {} as Record<string, any>),
    },
    instruction,
    provider,
    api_key: apiKey,
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
function cleanText(value: string): string {
	if (!value) return '';

	// Remove extra whitespace, including newlines and tabs
	return value
		.replace(/[\r\n\t]+/g, ' ')    // Replace newlines and tabs with space
		.replace(/\s+/g, ' ')          // Replace multiple spaces with single space
		.trim();                       // Remove leading/trailing whitespace
}

