import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, ExtractionStrategy, FullCrawlConfig } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createCrawlerRunConfig,
	isValidUrl,
	normalizeUrlProtocol,
} from '../../shared/utils';
import { formatExtractionResult } from '../../shared/formatters';
import {
	urlField,
	getBrowserSessionFields,
	getCrawlSettingsFields,
} from '../../shared/descriptions';
import { SEO_FIELDS, extractJsonLd, extractHreflang, extractHead } from '../../shared/seo-helpers';
import type { SeoField } from '../../shared/seo-helpers';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		...urlField,
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
			{ name: 'Basic Meta Tags', value: 'basic', description: 'Title, description, keywords, canonical URL' },
			{ name: 'JSON-LD Structured Data', value: 'jsonLd', description: 'Schema.org structured data in JSON-LD format' },
			{ name: 'Language & Locale', value: 'language', description: 'HTML lang, hreflang tags, locale settings' },
			{ name: 'Open Graph (OG) Tags', value: 'openGraph', description: 'OG title, description, image, type, URL' },
			{ name: 'Robots & Indexing', value: 'robots', description: 'Robots meta, noindex, nofollow directives' },
			{ name: 'Twitter Cards', value: 'twitter', description: 'Twitter card metadata' },
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
				displayName: 'Include Original Text',
				name: 'includeFullText',
				type: 'boolean',
				default: false,
				description: 'Whether to include the original webpage text in output',
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
	...getBrowserSessionFields(['seoExtractor']),
	...getCrawlSettingsFields(['seoExtractor']),
];

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];
	const crawler = await getCrawl4aiClient(this);

	for (let i = 0; i < items.length; i++) {
		try {
			const url = normalizeUrlProtocol(this.getNodeParameter('url', i, '') as string);
			const metadataTypes = this.getNodeParameter('metadataTypes', i, ['basic', 'openGraph', 'jsonLd']) as string[];
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;

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

			// Build CSS extraction strategy inline for meta tags
			const extractionStrategy: ExtractionStrategy | null = fields.length > 0 ? {
				type: 'JsonCssExtractionStrategy' as const,
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

			const config: FullCrawlConfig = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig(cs),
			};

			if (extractionStrategy) {
				config.extractionStrategy = extractionStrategy;
			}

			const result = await crawler.crawlUrl(url, config);

			if (!result.success) {
				throw new NodeOperationError(
					this.getNode(),
					`Failed to crawl URL: ${result.error_message || 'Unknown error'}`,
					{ itemIndex: i },
				);
			}

			// Parse extracted CSS content
			let seoData: IDataObject = {};

			if (result.extracted_content) {
				try {
					const parsed = JSON.parse(result.extracted_content);
					if (Array.isArray(parsed) && parsed.length > 0) {
						seoData = { ...seoData, ...parsed[0] };
					} else if (typeof parsed === 'object') {
						seoData = { ...seoData, ...parsed };
					}
				} catch {
					seoData._cssParseError = true;
					seoData._rawContent = result.extracted_content.substring(0, 500);
				}
			}

			// Extract JSON-LD if requested
			if (metadataTypes.includes('jsonLd')) {
				const { data: jsonLdData, parseErrors: jsonLdParseErrors } = extractJsonLd(result.html || result.cleaned_html || '');
				if (jsonLdData.length > 0) {
					seoData.jsonLd = jsonLdData;
				}
				if (jsonLdParseErrors > 0) {
					seoData._jsonLdParseErrors = jsonLdParseErrors;
				}
			}

			// Extract hreflang tags if language metadata requested
			if (metadataTypes.includes('language')) {
				const hreflangTags = extractHreflang(result.html || result.cleaned_html || '');
				if (hreflangTags.length > 0) {
					seoData.hreflang = hreflangTags;
				}
			}

			const fetchedAt = new Date().toISOString();
			const formattedResult = formatExtractionResult(result, seoData as IDataObject, {
				fetchedAt,
				extractionStrategy: 'SeoExtractor',
				includeFullText: options.includeFullText as boolean,
				includeLinks: false,
			});

			if (options.includeRawHtml) {
				formattedResult.rawHtml = result.html ? extractHead(result.html) : null;
			}

			allResults.push({
				json: formattedResult,
				pairedItem: { item: i },
			});
		} catch (error) {
			if (this.continueOnFail()) {
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(this.getNode(), (error as Error).message, {
						itemIndex: i,
					}),
					pairedItem: { item: i },
				});
				continue;
			}
			throw error;
		}
	}

	return allResults;
}

// SEO helper functions (extractJsonLd, extractHreflang, extractHead) imported from ../../shared/seo-helpers
