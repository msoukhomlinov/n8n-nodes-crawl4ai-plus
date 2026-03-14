import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, CrawlerRunConfig } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createCrawlerRunConfig,
	isValidUrl,
} from '../../shared/utils';
import { formatExtractionResult } from '../../shared/formatters';
import {
	urlField,
	getBrowserSessionFields,
	getCrawlSettingsFields,
} from '../../shared/descriptions';

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
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		try {
			const url = this.getNodeParameter('url', i, '') as string;
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

			const config: CrawlerRunConfig = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig(cs),
			};

			if (extractionStrategy) {
				config.extractionStrategy = extractionStrategy;
			}

			const crawler = await getCrawl4aiClient(this);
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

			const fetchedAt = new Date().toISOString();
			const formattedResult = formatExtractionResult(result, seoData as any, {
				fetchedAt,
				extractionStrategy: 'SeoExtractor',
				includeLinks: false,
			});

			if (options.includeRawHtml) {
				(formattedResult as any).rawHtml = extractHead(result.html || '');
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
						itemIndex: (error as any).itemIndex ?? i,
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

// --- Helper Functions ---

function extractJsonLd(html: string): any[] {
	const jsonLdData: any[] = [];
	const scriptTagRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let match;

	while ((match = scriptTagRegex.exec(html)) !== null) {
		try {
			const data = JSON.parse(match[1].trim());
			jsonLdData.push(data);
		} catch {
			// Skip invalid JSON-LD blocks
		}
	}

	return jsonLdData;
}

function extractHreflang(html: string): Array<{ lang: string; href: string }> {
	const hreflangTags: Array<{ lang: string; href: string }> = [];
	const patternA = /<link[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
	const patternB = /<link[^>]*hreflang=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
	const patternC = /<link[^>]*href=["']([^"']+)["'][^>]*hreflang=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*\/?>/gi;

	let match;

	while ((match = patternA.exec(html)) !== null) {
		hreflangTags.push({ lang: match[1], href: match[2] });
	}

	while ((match = patternB.exec(html)) !== null) {
		hreflangTags.push({ lang: match[1], href: match[2] });
	}

	while ((match = patternC.exec(html)) !== null) {
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

function extractHead(html: string): string {
	const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
	return match ? match[1] : '';
}
