import type { IExecuteFunctions, ISupplyDataFunctions, IDataObject } from 'n8n-workflow';
import { wrapSuccess, wrapError, formatApiError, ERROR_TYPES } from './error-formatter';
import {
	getCrawl4aiClient,
	buildLlmConfig,
	validateLlmCredentials,
	createLlmExtractionStrategy,
	createCssSelectorExtractionStrategy,
	isValidUrl,
} from '../../shared/utils';
import type { Crawl4aiApiCredentials, ExtractionStrategy, FullCrawlConfig } from '../../shared/interfaces';
import { formatCrawlResult, parseExtractedJson } from '../../shared/formatters';
import { getSimpleDefaults } from '../helpers/utils';
import { SEO_FIELDS, extractJsonLd, extractHreflang } from '../../shared/seo-helpers';
import type { SeoField } from '../../shared/seo-helpers';

import { ALL_OPERATIONS } from './constants';

const RESOURCE = 'crawl4ai';

export const N8N_METADATA_FIELDS = new Set([
	'sessionId', 'action', 'chatInput',
	'root',
	'tool', 'toolName', 'toolCallId',
	'operation',
	'resource',
]);

export async function executeAiTool(
	context: IExecuteFunctions | ISupplyDataFunctions,
	operation: string,
	rawParams: Record<string, unknown>,
): Promise<string> {
	// Strip n8n framework metadata at entry — before any routing logic
	const params: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(rawParams)) {
		if (!N8N_METADATA_FIELDS.has(key)) params[key] = value;
	}

	try {
		switch (operation) {
			case 'crawl': {
				const url = params.url as string;
				if (!url) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'URL is required.', 'Provide a url parameter with the full URL including https://.'));
				}
				if (!isValidUrl(url)) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
						`Invalid URL: ${url}`, 'Provide a valid URL including the protocol (https://).'));
				}

				const includeLinks = params.includeLinks !== false;
				const includeImages = params.includeImages === true;
				const cacheMode = (params.cacheMode as FullCrawlConfig['cacheMode']) ?? 'ENABLED';

				const config: FullCrawlConfig = {
					...getSimpleDefaults(),
					cacheMode,
					...(params.waitFor ? { waitFor: params.waitFor as string } : {}),
				};

				const crawler = await getCrawl4aiClient(context);
				const result = await crawler.crawlUrl(url, config);

				if (!result.success) {
					return JSON.stringify(formatApiError(
						result.error_message || `Failed to crawl ${url}`, RESOURCE, operation));
				}

				const formatted = formatCrawlResult(result, {
					cacheMode,
					includeLinks,
					includeMedia: includeImages,
					fetchedAt: new Date().toISOString(),
				});

				return JSON.stringify(wrapSuccess(RESOURCE, operation, formatted));
			}

			case 'askQuestion': {
				const url = params.url as string;
				const question = params.question as string;
				if (!url) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'URL is required.', 'Provide a url parameter.'));
				}
				if (!question) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'Question is required.', 'Provide a question parameter.'));
				}
				if (!isValidUrl(url)) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
						`Invalid URL: ${url}`, 'Provide a valid URL including the protocol (https://).'));
				}

				const credentials = await context.getCredentials('crawl4aiPlusApi') as unknown as Crawl4aiApiCredentials;
				try {
					validateLlmCredentials(credentials, 'askQuestion operation');
				} catch (e) {
					const detail = e instanceof Error ? e.message : String(e);
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
						`LLM credential issue: ${detail}`,
						'Check the Crawl4AI credentials: ensure LLM is enabled, a provider is selected, and the API key is filled in.'));
				}

				const llmConfig = buildLlmConfig(credentials);
				// Match the exact schema and prompt from askQuestion.operation.ts
				const qaSchema = {
					type: 'object',
					properties: {
						answer: { type: 'string' },
						details: { type: 'array', items: { type: 'string' } },
						source_quotes: { type: 'array', items: { type: 'string' } },
					},
					required: ['answer', 'details', 'source_quotes'],
				};

				const systemPrompt = `Answer the user's question based on the page content. Return a JSON object with exactly these keys:
- "answer": A concise answer to the question (string)
- "details": An array of supporting details or facts (string[])
- "source_quotes": An array of direct quotes from the page that support the answer (string[])

If the page doesn't contain enough information to answer, set "answer" to "I couldn't find enough information on the page to answer this question." and leave details and source_quotes as empty arrays.

Question: ${question}`;

				const extractionStrategy = createLlmExtractionStrategy(
					qaSchema,
					systemPrompt,
					llmConfig.provider,
					llmConfig.apiKey,
					llmConfig.baseUrl,
				);

				const config: FullCrawlConfig = {
					...getSimpleDefaults(),
					extractionStrategy,
				};

				const crawler = await getCrawl4aiClient(context);
				const result = await crawler.crawlUrl(url, config);

				if (!result.success) {
					return JSON.stringify(formatApiError(
						result.error_message || `Failed to crawl ${url}`, RESOURCE, operation));
				}

				const extracted = parseExtractedJson(result);
				if (!extracted) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.NO_RESULTS_FOUND,
						'The page was crawled but no answer could be extracted.',
						'Try rephrasing the question or checking the page has relevant content.',
						{ url, question }));
				}

				return JSON.stringify(wrapSuccess(RESOURCE, operation, {
					url,
					question,
					...extracted,
					fetchedAt: new Date().toISOString(),
				}));
			}

			case 'extractWithLlm': {
				const url = params.url as string;
				const instruction = params.instruction as string;
				if (!url) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'URL is required.', 'Provide a url parameter.'));
				}
				if (!instruction) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'Instruction is required.', 'Provide an instruction parameter describing what to extract.'));
				}
				if (!isValidUrl(url)) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
						`Invalid URL: ${url}`, 'Provide a valid URL including the protocol (https://).'));
				}

				const credentials = await context.getCredentials('crawl4aiPlusApi') as unknown as Crawl4aiApiCredentials;
				try {
					validateLlmCredentials(credentials, 'extractWithLlm operation');
				} catch (e) {
					const detail = e instanceof Error ? e.message : String(e);
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
						`LLM credential issue: ${detail}`,
						'Check the Crawl4AI credentials: ensure LLM is enabled, a provider is selected, and the API key is filled in.'));
				}

				// Parse optional schema
				let schema: Record<string, unknown> | undefined;
				if (params.schema && typeof params.schema === 'string') {
					try {
						schema = JSON.parse(params.schema) as Record<string, unknown>;
					} catch {
						return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
							'Invalid JSON in schema parameter.',
							'Provide valid JSON. Example: {"name":"string","price":"number"}'));
					}
				}

				const llmConfig = buildLlmConfig(credentials);
				const extractionStrategy = createLlmExtractionStrategy(
					schema ?? { data: { type: 'object', description: 'Extracted data' } },
					instruction,
					llmConfig.provider,
					llmConfig.apiKey,
					llmConfig.baseUrl,
				);

				const config: FullCrawlConfig = {
					...getSimpleDefaults(),
					extractionStrategy,
				};

				const crawler = await getCrawl4aiClient(context);
				const result = await crawler.crawlUrl(url, config);

				if (!result.success) {
					return JSON.stringify(formatApiError(
						result.error_message || `Failed to crawl ${url}`, RESOURCE, operation));
				}

				const extracted = parseExtractedJson(result);
				if (!extracted) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.NO_RESULTS_FOUND,
						'The page was crawled but no data could be extracted.',
						'Try adjusting the instruction or check the page has relevant content.',
						{ url, instruction }));
				}

				return JSON.stringify(wrapSuccess(RESOURCE, operation, {
					url,
					instruction,
					extractedData: extracted,
					fetchedAt: new Date().toISOString(),
				}));
			}

			case 'extractWithCss': {
				const url = params.url as string;
				const baseSelector = params.baseSelector as string;
				const fieldsJson = params.fields as string;
				if (!url) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'URL is required.', 'Provide a url parameter.'));
				}
				if (!baseSelector) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'baseSelector is required.', 'Provide a CSS selector for the repeating element.'));
				}
				if (!fieldsJson) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'fields is required.', 'Provide a JSON array of field definitions.'));
				}
				if (!isValidUrl(url)) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
						`Invalid URL: ${url}`, 'Provide a valid URL including the protocol (https://).'));
				}

				let fields: Array<{ name: string; selector: string; type: string; attribute?: string }>;
				try {
					fields = JSON.parse(fieldsJson) as typeof fields;
					if (!Array.isArray(fields) || fields.length === 0) {
						throw new Error('Fields must be a non-empty array');
					}
				} catch (e) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
						`Invalid fields JSON: ${e instanceof Error ? e.message : String(e)}`,
						'Provide a valid JSON array. Example: [{"name":"title","selector":"h3","type":"text"}]'));
				}

				// Validate each field object has required name and selector
				for (let i = 0; i < fields.length; i++) {
					const f = fields[i];
					if (!f || typeof f.name !== 'string' || !f.name) {
						return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
							`Field at index ${i} is missing a required "name" property (string).`,
							'Each field must have: {"name":"fieldName","selector":"css selector","type":"text|html|attribute"}'));
					}
					if (typeof f.selector !== 'string' || !f.selector) {
						return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
							`Field "${f.name}" at index ${i} is missing a required "selector" property (string).`,
							'Each field must have: {"name":"fieldName","selector":"css selector","type":"text|html|attribute"}'));
					}
				}

				const cssSchema = {
					name: 'extracted_items',
					baseSelector,
					fields: fields.map(f => ({
						name: f.name,
						selector: f.selector,
						type: f.type || 'text',
						...(f.attribute ? { attribute: f.attribute } : {}),
					})),
				};

				const extractionStrategy = createCssSelectorExtractionStrategy(cssSchema);
				const config: FullCrawlConfig = {
					...getSimpleDefaults(),
					extractionStrategy,
				};

				const crawler = await getCrawl4aiClient(context);
				const result = await crawler.crawlUrl(url, config);

				if (!result.success) {
					return JSON.stringify(formatApiError(
						result.error_message || `Failed to crawl ${url}`, RESOURCE, operation));
				}

				const extracted = parseExtractedJson(result);
				const items = Array.isArray(extracted) ? extracted : extracted ? [extracted] : [];

				return JSON.stringify(wrapSuccess(RESOURCE, operation, {
					url,
					items,
					itemCount: items.length,
					fetchedAt: new Date().toISOString(),
				}));
			}

			case 'extractSeo': {
				const url = params.url as string;
				if (!url) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'URL is required.', 'Provide a url parameter.'));
				}
				if (!isValidUrl(url)) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
						`Invalid URL: ${url}`, 'Provide a valid URL including the protocol (https://).'));
				}

				// Build CSS extraction for all SEO meta tags
				const allSeoFields: SeoField[] = [];
				for (const category of Object.keys(SEO_FIELDS)) {
					allSeoFields.push(...SEO_FIELDS[category]);
				}

				const extractionStrategy: ExtractionStrategy = {
					type: 'JsonCssExtractionStrategy' as const,
					params: {
						schema: {
							type: 'dict',
							value: {
								name: 'SEO_Metadata',
								baseSelector: 'html',
								fields: allSeoFields.map(field => ({
									name: field.name,
									selector: field.selector,
									type: field.type,
									...(field.attribute ? { attribute: field.attribute } : {}),
								})),
							},
						},
					},
				};

				const config: FullCrawlConfig = {
					...getSimpleDefaults(),
					extractionStrategy,
				};

				const crawler = await getCrawl4aiClient(context);
				const result = await crawler.crawlUrl(url, config);

				if (!result.success) {
					return JSON.stringify(formatApiError(
						result.error_message || `Failed to crawl ${url}`, RESOURCE, operation));
				}

				// Parse CSS-extracted meta tags
				let seoData: IDataObject = {};
				if (result.extracted_content) {
					try {
						const parsed = JSON.parse(result.extracted_content);
						if (Array.isArray(parsed) && parsed.length > 0) {
							seoData = { ...seoData, ...parsed[0] as IDataObject };
						} else if (typeof parsed === 'object') {
							seoData = { ...seoData, ...parsed as IDataObject };
						}
					} catch (e) {
						seoData._cssParseError = true;
						seoData._cssParseErrorMessage = e instanceof Error ? e.message : String(e);
						seoData._rawContent = result.extracted_content.substring(0, 500);
					}
				}

				// Extract JSON-LD structured data
				const html = result.html || result.cleaned_html || '';
				const { data: jsonLdData, parseErrors: jsonLdParseErrors } = extractJsonLd(html);
				if (jsonLdData.length > 0) {
					seoData.jsonLd = jsonLdData;
				}
				if (jsonLdParseErrors > 0) {
					seoData._jsonLdParseErrors = jsonLdParseErrors;
				}

				// Extract hreflang tags
				const hreflangTags = extractHreflang(html);
				if (hreflangTags.length > 0) {
					seoData.hreflang = hreflangTags;
				}

				return JSON.stringify(wrapSuccess(RESOURCE, operation, {
					url,
					...seoData,
					fetchedAt: new Date().toISOString(),
				}));
			}

			case 'discoverLinks': {
				const url = params.url as string;
				if (!url) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'URL is required.', 'Provide a url parameter.'));
				}
				if (!isValidUrl(url)) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.VALIDATION_ERROR,
						`Invalid URL: ${url}`, 'Provide a valid URL including the protocol (https://).'));
				}

				const linkTypes = (params.linkTypes as string) ?? 'both';

				const config: FullCrawlConfig = {
					...getSimpleDefaults(),
					cacheMode: 'ENABLED',
					scoreLinks: true,
				};

				const crawler = await getCrawl4aiClient(context);
				const result = await crawler.crawlUrl(url, config);

				if (!result.success) {
					return JSON.stringify(formatApiError(
						result.error_message || `Failed to crawl ${url}`, RESOURCE, operation));
				}

				const internalLinks = result.links?.internal ?? [];
				const externalLinks = result.links?.external ?? [];

				const links: Record<string, unknown> = { url };

				if (linkTypes === 'internal' || linkTypes === 'both') {
					links.internalLinks = internalLinks.map(l => ({
						href: l.href, text: l.text || undefined, title: l.title || undefined,
					}));
					links.internalCount = internalLinks.length;
				}
				if (linkTypes === 'external' || linkTypes === 'both') {
					links.externalLinks = externalLinks.map(l => ({
						href: l.href, text: l.text || undefined, title: l.title || undefined,
					}));
					links.externalCount = externalLinks.length;
				}

				links.totalLinks = (linkTypes === 'internal' ? internalLinks.length
					: linkTypes === 'external' ? externalLinks.length
					: internalLinks.length + externalLinks.length);
				links.fetchedAt = new Date().toISOString();

				return JSON.stringify(wrapSuccess(RESOURCE, operation, links));
			}

			case 'healthCheck': {
				const crawler = await getCrawl4aiClient(context);

				let healthData: Record<string, unknown> = {};
				let healthError: string | undefined;
				try {
					const h = await crawler.getMonitorHealth();
					healthData = { ...h };
				} catch (e) {
					healthError = e instanceof Error ? e.message : String(e);
				}

				let statsData: Record<string, unknown> = {};
				let statsError: string | undefined;
				try {
					statsData = await crawler.getEndpointStats();
				} catch (e) {
					statsError = e instanceof Error ? e.message : String(e);
				}

				if (healthError) {
					return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.API_ERROR,
						`Health check failed: ${healthError}`,
						'Verify the Crawl4AI server is running and accessible.',
						{
							...(Object.keys(statsData).length > 0 ? { endpointStats: statsData } : {}),
							...(statsError ? { statsError } : {}),
							checkedAt: new Date().toISOString(),
						}));
				}

				return JSON.stringify(wrapSuccess(RESOURCE, operation, {
					...healthData,
					endpointStats: statsData,
					...(statsError ? { statsError } : {}),
					checkedAt: new Date().toISOString(),
				}));
			}

			default:
				return JSON.stringify(wrapError(RESOURCE, operation, ERROR_TYPES.INVALID_OPERATION,
					`Unknown operation: ${operation}`,
					`Use one of: ${ALL_OPERATIONS.join(', ')}`));
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		// Distinguish programming errors from API errors for better diagnostics
		if (error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError) {
			return JSON.stringify(wrapError(RESOURCE, operation, 'INTERNAL_ERROR',
				`Internal tool error: ${msg}`,
				'This appears to be a bug in the tool. Do not retry with the same parameters.'));
		}
		return JSON.stringify(formatApiError(msg, RESOURCE, operation));
	}
}
