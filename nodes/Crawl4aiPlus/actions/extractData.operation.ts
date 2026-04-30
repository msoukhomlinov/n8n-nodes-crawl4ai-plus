import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { findNumbers, isSupportedCountry, type CountryCode } from 'libphonenumber-js';

import type { Crawl4aiApiCredentials, Crawl4aiNodeOptions, CrawlResult, FullCrawlConfig } from '../../shared/interfaces';
import { checkLlmExtractionError } from '../../shared/formatters';
import { Crawl4aiClient } from '../../shared/apiClient';
import {
	assertValidHttpUrl,
	getCrawl4aiClient,
	getSimpleDefaults,
	executeCrawl,
	validateLlmCredentials,
	buildLlmConfig,
	createLlmExtractionStrategy,
	resolveRequestHeaders,
} from '../helpers/utils';
import { formatExtractedDataResult } from '../helpers/formatters';
import { extractJsonLd } from '../../shared/seo-helpers';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const FINANCIAL_PATTERNS: Record<string, RegExp[]> = {
	currencies: [/[$\u00A3\u20AC\u00A5]\s?\d{1,3}(?:[,. ]\d{3})*(?:[.,]\d{1,2})?/g],
	creditCards: [/\b(?:\d[ -]*?){13,19}\b/g],
	ibans: [/[A-Z]{2}\d{2}[\s-]?[\dA-Z]{4}[\s-]?(?:[\dA-Z]{4}[\s-]?){2,7}[\dA-Z]{1,4}/g],
	percentages: [/\d+(?:\.\d+)?%/g],
	numbers: [/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g],
};

const LOCATION_URL_KEYWORDS = [
    'about', 'about-us', 'branches', 'campus', 'contact', 'contact-us',
    'dealers', 'directions', 'distributors', 'find-a-store', 'find-us',
    'get-in-touch', 'global', 'imprint', 'impressum', 'locations',
    'offices', 'our-company', 'reach-us', 'regions', 'retailers',
    'stockists', 'store-finder', 'stores', 'visit-us', 'where-to-buy',
    'where-to-find', 'worldwide',
];

const LOCATION_CONTENT_KEYWORDS = [
    ' avenue', ' floor ', ' level ', ' road', ' street', ' suite ',
    'branch', 'campus', 'factory', 'head office', 'headquarter',
    'postcode', 'showroom', 'warehouse', 'zip code',
];

const LOCATION_CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function extractContactInfo(
	results: CrawlResult[],
	defaultCountry: string,
): { emails: string[]; phones: string[] } {
	const emails = new Set<string>();
	const phoneMap = new Map<string, string>(); // E.164 → formatted

	for (const result of results) {
		let text = '';
		if (typeof result.markdown === 'object' && result.markdown !== null) {
			text = result.markdown.raw_markdown || '';
		} else if (typeof result.markdown === 'string') {
			text = result.markdown;
		}
		if (!text) continue;

		// Emails
		EMAIL_PATTERN.lastIndex = 0;
		const emailMatches = text.match(EMAIL_PATTERN);
		if (emailMatches) {
			for (const e of emailMatches) emails.add(e.toLowerCase());
		}

		// Phones via libphonenumber-js — finds and validates in one pass
		const normalizedCountry = String(defaultCountry || '').toUpperCase();
		const findOpts = isSupportedCountry(normalizedCountry as CountryCode)
			? { defaultCountry: normalizedCountry as CountryCode, v2: true as const }
			: { v2: true as const };
		const found = findNumbers(text, findOpts);
		for (const match of found) {
			if (match.number.isValid()) {
				const e164 = match.number.format('E.164');
				if (!phoneMap.has(e164)) {
					phoneMap.set(e164, match.number.formatInternational());
				}
			}
		}
	}

	return {
		emails: [...emails],
		phones: [...phoneMap.values()],
	};
}

const LLM_VALIDATION_SCHEMA: IDataObject = {
	type: 'object',
	properties: {
		emails: {
			type: 'array',
			items: { type: 'string' },
			description: 'Validated email addresses — real contact emails only, no noreply/system addresses unless clearly a contact',
		},
		phones: {
			type: 'array',
			items: { type: 'string' },
			description: 'Validated phone numbers in international format (+XX XX XXXX XXXX)',
		},
	},
	required: ['emails', 'phones'],
};

const LLM_VALIDATION_INSTRUCTION = `You are a contact information validator. You receive a list of extracted emails and phone numbers that may contain false positives. Your task:
1. Remove any items that are clearly NOT real contact details (e.g. example@domain.com, placeholder numbers, version strings mistaken for phones)
2. Remove duplicate entries (same number in different formats)
3. Format phone numbers consistently in international format (+XX XX XXXX XXXX)
4. Return only genuine contact information
Return the cleaned data as JSON matching the provided schema.`;

async function runLlmContactValidation(
	this: IExecuteFunctions,
	contacts: { emails: string[]; phones: string[] },
	credentials: Crawl4aiApiCredentials,
	crawler: Crawl4aiClient,
	modelOverride: string | undefined,
	itemIndex: number,
): Promise<{ emails: string[]; phones: string[] }> {
	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);

	const jsonStr = JSON.stringify(contacts, null, 2)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const syntheticHtml = `<pre>${jsonStr}</pre>`;
	const rawUrl = `raw:${syntheticHtml}`;

	const config: FullCrawlConfig = {
		extractionStrategy: createLlmExtractionStrategy(
			LLM_VALIDATION_SCHEMA,
			LLM_VALIDATION_INSTRUCTION,
			provider,
			apiKey,
			baseUrl,
		),
	};

	try {
		const result = await crawler.crawlUrl(rawUrl, config);
		if (!result.success) {
			throw new NodeOperationError(
				this.getNode(),
				`LLM validation failed: ${result.error_message || 'crawl request failed'}`,
				{ itemIndex },
			);
		}
		const llmError = checkLlmExtractionError(result);
		if (llmError) {
			throw new NodeOperationError(
				this.getNode(),
				`LLM validation failed: ${llmError}`,
				{ itemIndex },
			);
		}
		if (!result.extracted_content) return contacts;
		const parsed = JSON.parse(result.extracted_content) as unknown;
		const items = Array.isArray(parsed)
			? (parsed as IDataObject[]).filter((c) => !c.error)
			: parsed && !(parsed as IDataObject).error
				? [(parsed as IDataObject)]
				: [];
		if (items.length === 0) return contacts;
		const merged = {
			emails: [...new Set(items.flatMap((c) => Array.isArray(c.emails) ? (c.emails as string[]) : []))],
			phones: [...new Set(items.flatMap((c) => Array.isArray(c.phones) ? (c.phones as string[]) : []))],
		};
		const anyHas = (key: string) => items.some((c) => Array.isArray(c[key]));
		return {
			emails: anyHas('emails') ? merged.emails : contacts.emails,
			phones: anyHas('phones') ? merged.phones : contacts.phones,
		};
	} catch (err) {
		if (err instanceof NodeOperationError) throw err;
		return contacts;
	}
}

function scorePageForLocations(result: CrawlResult): number {
    let score = 0;
    const urlLower = result.url.toLowerCase();
    for (const kw of LOCATION_URL_KEYWORDS) {
        if (urlLower.includes(kw)) score += 2;
    }
    const text =
        (typeof result.markdown === 'object' && result.markdown !== null
            ? result.markdown.raw_markdown
            : typeof result.markdown === 'string'
                ? result.markdown
                : '') || '';
    const textLower = text.toLowerCase();
    for (const kw of LOCATION_CONTENT_KEYWORDS) {
        const count = textLower.split(kw).length - 1;
        score += Math.min(count, 3);
    }
    return score;
}

function selectLocationRelevantPages(pages: CrawlResult[]): CrawlResult[] {
    if (pages.length <= 2) return pages;
    const scored = pages.map((r) => ({ r, s: scorePageForLocations(r) }));
    scored.sort((a, b) => b.s - a.s);
    const withScore = scored.filter((x) => x.s > 0);
    // Take up to 8 location-relevant pages; if none scored, take top 3 by score
    return (withScore.length > 0 ? withScore.slice(0, 8) : scored.slice(0, 3)).map((x) => x.r);
}

const JSON_LD_LOCATION_TYPES = new Set([
    'AutoDealer', 'AutomotiveBusiness', 'ChildCare', 'Corporation',
    'DryCleaningOrLaundry', 'EducationalOrganization', 'EmergencyService',
    'EmploymentAgency', 'EntertainmentBusiness', 'FinancialService',
    'FoodEstablishment', 'GovernmentOffice', 'HealthAndBeautyBusiness',
    'HomeAndConstructionBusiness', 'LegalService', 'LocalBusiness',
    'LodgingBusiness', 'MedicalBusiness', 'Organization', 'Place',
    'ProfessionalService', 'RealEstateAgent', 'RecyclingCenter',
    'SelfStorage', 'ShoppingCenter', 'SportsActivityLocation', 'Store',
    'TouristInformationCenter', 'TravelAgency',
]);

function mapJsonLdPostalAddress(
    orgName: string | undefined,
    addr: IDataObject,
    telephone: string | undefined,
    includePhones: boolean,
): IDataObject | null {
    const street = String(addr.streetAddress || '').trim();
    const city = String(addr.addressLocality || '').trim();
    const country = String(addr.addressCountry || '').trim();
    // Require at least a street or a city — pure country-only entries are noise
    if (!street && !city) return null;
    const state = String(addr.addressRegion || '').trim();
    const postcode = String(addr.postalCode || '').trim();
    const fullAddress = city
        ? (street ? `${street}, ${city}${state ? ` ${state}` : ''}${postcode ? ` ${postcode}` : ''}` : `${city}${state ? `, ${state}` : ''}${postcode ? ` ${postcode}` : ''}`)
        : [street, state, postcode].filter(Boolean).join(', ');
    const loc: IDataObject = {
        name: orgName || (city ? `${city} Location` : 'Location'),
        address: fullAddress,
        city,
        country,
        confidence: 'high',
        source: 'json-ld',
    };
    if (state) loc.state = state;
    if (postcode) loc.postcode = postcode;
    if (includePhones && telephone) loc.phone = telephone;
    return loc;
}

function extractLocationsFromJsonLd(html: string, includePhones: boolean): IDataObject[] {
    if (!html) return [];
    const { data } = extractJsonLd(html);
    const locations: IDataObject[] = [];

    function processNode(node: IDataObject): void {
        // Walk @graph arrays recursively
        if (Array.isArray(node['@graph'])) {
            for (const child of node['@graph'] as IDataObject[]) {
                processNode(child);
            }
        }

        const rawType = node['@type'];
        const types: string[] = Array.isArray(rawType)
            ? (rawType as string[])
            : rawType ? [String(rawType)] : [];

        const isLocationNode = types.some(
            (t) => JSON_LD_LOCATION_TYPES.has(t) || t.endsWith('Business') || t.endsWith('Store'),
        );
        if (!isLocationNode) return;

        const orgName = node.name ? String(node.name) : undefined;
        const telephone = node.telephone ? String(node.telephone) : undefined;
        const rawAddress = node.address;
        if (!rawAddress) return;

        // address can be a single PostalAddress object or an array (multi-location)
        const addrs = Array.isArray(rawAddress)
            ? (rawAddress as IDataObject[])
            : [rawAddress as IDataObject];

        for (const addr of addrs) {
            if (typeof addr !== 'object' || !addr) continue;
            // Accept PostalAddress nodes; also accept plain objects with streetAddress
            const addrTypes = Array.isArray(addr['@type'])
                ? (addr['@type'] as string[])
                : addr['@type'] ? [String(addr['@type'])] : [];
            if (addrTypes.length > 0 && !addrTypes.includes('PostalAddress')) continue;
            const loc = mapJsonLdPostalAddress(orgName, addr, telephone, includePhones);
            if (loc) locations.push(loc);
        }

        // Walk hasPOS (point-of-sale) and location arrays for chain stores
        if (Array.isArray(node.hasPOS)) {
            for (const pos of node.hasPOS as IDataObject[]) processNode(pos);
        }
        if (Array.isArray(node.location)) {
            for (const loc of node.location as IDataObject[]) processNode(loc);
        }
        if (Array.isArray(node.containsPlace)) {
            for (const place of node.containsPlace as IDataObject[]) processNode(place);
        }
    }

    for (const item of data) processNode(item);
    return locations;
}

const ADDRESS_ABBREVIATIONS: Array<[RegExp, string]> = [
    [/\bst\.?\b/gi, 'street'],
    [/\brd\.?\b/gi, 'road'],
    [/\bave?\.?\b/gi, 'avenue'],
    [/\bblvd\.?\b/gi, 'boulevard'],
    [/\bln\.?\b/gi, 'lane'],
    [/\bdr\.?\b/gi, 'drive'],
    [/\bcr?t\.?\b/gi, 'court'],
    [/\bcres\.?\b/gi, 'crescent'],
    [/\bhwy\.?\b/gi, 'highway'],
    [/\bpde\.?\b/gi, 'parade'],
    [/\bpl\.?\b/gi, 'place'],
    [/\bsq\.?\b/gi, 'square'],
    [/\btce\.?\b/gi, 'terrace'],
    [/\bcct\.?\b/gi, 'circuit'],
    [/\bcl\.?\b/gi, 'close'],
    [/\bgrv\.?\b/gi, 'grove'],
];

function canonicalizeAddress(address: string, postcode?: string): string {
    let s = address.toLowerCase();
    for (const [pattern, replacement] of ADDRESS_ABBREVIATIONS) {
        s = s.replace(pattern, replacement);
    }
    s = s.replace(/[.,#\-/]/g, ' ').replace(/\s+/g, ' ').trim();
    // Strip leading unit/suite/level when postcode is present (same building, different unit = same location)
    if (postcode) {
        s = s.replace(/^(unit|suite|level|ste|apt|flat|floor)\s+[\w\d-]+\s*/i, '');
    }
    const pc = postcode ? String(postcode).replace(/\s/g, '').toLowerCase() : '';
    return pc ? `${s}|${pc}` : s;
}

function buildLocationsSchema(includePhones: boolean): IDataObject {
	const itemProperties: IDataObject = {
		name: {
			type: 'string',
			description: 'Unique location identifier, e.g. "Melbourne Office", "Sydney Branch". Every name must be unique across all locations.',
		},
		address: {
			type: 'string',
			description: 'Full postal address including street number, street name, suburb/city, state/region, postcode',
		},
		city: { type: 'string', description: 'City or suburb' },
		country: { type: 'string', description: 'Country name' },
		confidence: {
			type: 'string',
			enum: ['high', 'medium', 'low'],
			description: 'high = complete address with postcode and city; medium = partial address missing postcode or state; low = city/country only or inferred from context',
		},
		sourceSnippet: {
			type: 'string',
			description: 'Exact verbatim text from the page (1–2 sentences) that contains or directly supports this location. Must be copy-pasted from the content, not paraphrased.',
		},
	};
	if (includePhones) {
		(itemProperties as Record<string, IDataObject>).phone = {
			type: 'string',
			description: 'Direct phone number for this location in international format (e.g. +61 3 9000 0000)',
		};
	}
	return {
		type: 'object',
		properties: {
			locations: {
				type: 'array',
				description: 'All physical locations found on the page',
				items: {
					type: 'object',
					properties: itemProperties,
					required: ['name', 'address', 'city', 'country', 'confidence', 'sourceSnippet'],
				},
			},
		},
		required: ['locations'],
	} as IDataObject;
}

function buildLocationsInstruction(includePhones: boolean, pageUrl?: string): string {
	const phoneStep = includePhones
		? '\n5. Extract the phone number specific to this location (not a general/central number unless it is the only one).'
		: '';
	const urlContext = pageUrl ? `\n\nSource page: ${pageUrl}` : '';
	const phoneFewShot = includePhones ? ', "phone": "+61 3 9000 0000"' : '';
	return `You are a location data extractor. Find ALL physical locations (offices, branches, stores, showrooms, warehouses, headquarters, distributors, stockists, dealers) mentioned on this page.${urlContext}

For each location:
1. Extract the complete postal address including street, city, state/region, and postcode.
2. Assign a unique name: use the explicit label if present (e.g. "Melbourne Office", "Head Office"); if no label, derive one from city/suburb. Every name MUST be unique.
3. Assign confidence: "high" if full address with postcode and city; "medium" if partial (missing postcode or state); "low" if city/country only.
4. Copy the exact verbatim text snippet (1–2 sentences) from the page that contains or supports the address into sourceSnippet.${phoneStep}

Include: offices, branches, stores, showrooms, warehouses, distribution centres, factories, partner/dealer/stockist locations (if an address is given).
Exclude: P.O. boxes, virtual offices, registered agent addresses, locations with no street address.
If no physical locations are found, return: {"locations": []}

Examples:

Input: "Our Melbourne office is at Level 12, 200 Collins Street, Melbourne VIC 3000."
Output: {"locations":[{"name":"Melbourne Office","address":"Level 12, 200 Collins Street, Melbourne VIC 3000","city":"Melbourne","country":"Australia","confidence":"high","sourceSnippet":"Our Melbourne office is at Level 12, 200 Collins Street, Melbourne VIC 3000."${phoneFewShot}}]}

Input: "Visit our Sydney showroom at 42 George Street, Sydney. Open weekdays 9–5."
Output: {"locations":[{"name":"Sydney Showroom","address":"42 George Street, Sydney","city":"Sydney","country":"Australia","confidence":"medium","sourceSnippet":"Visit our Sydney showroom at 42 George Street, Sydney."${phoneFewShot ? phoneFewShot.replace(/"\+61.*?"/, '"(not stated)"') : ''}}]}`;
}

function mergeLocationsIntoMap(
	locations: IDataObject[],
	locationMap: Map<string, IDataObject>,
): void {
	for (const loc of locations) {
		if (!loc || (loc as IDataObject & { error?: unknown }).error) continue;
		const key = canonicalizeAddress(
			String(loc.address || ''),
			loc.postcode as string | undefined,
		);
		if (!key) continue;
		if (!locationMap.has(key)) {
			locationMap.set(key, { ...loc });
		} else {
			const existing = locationMap.get(key)!;
			for (const [k, value] of Object.entries(loc)) {
				if (value !== null && value !== undefined && value !== '' && !existing[k]) {
					existing[k] = value;
				}
			}
			const existingRank = LOCATION_CONFIDENCE_RANK[existing.confidence as string] ?? 0;
			const newRank = LOCATION_CONFIDENCE_RANK[loc.confidence as string] ?? 0;
			if (newRank > existingRank) existing.confidence = loc.confidence;
		}
	}
}

async function extractLocationsFromPage(
	result: CrawlResult,
	includePhones: boolean,
	provider: string,
	apiKey: string,
	baseUrl: string | undefined,
	crawler: Crawl4aiClient,
): Promise<{ jsonLdLocations: IDataObject[]; llmLocations: IDataObject[]; error?: string }> {
	const jsonLdLocations = extractLocationsFromJsonLd(result.html || '', includePhones);

	const text =
		(typeof result.markdown === 'object' && result.markdown !== null
			? result.markdown.raw_markdown || result.markdown.fit_markdown
			: typeof result.markdown === 'string'
				? result.markdown
				: '') || '';

	if (!text.trim()) return { jsonLdLocations, llmLocations: [] };

	const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const rawUrl = `raw:<pre>${escaped}</pre>`;

	const config: FullCrawlConfig = {
		extractionStrategy: createLlmExtractionStrategy(
			buildLocationsSchema(includePhones),
			buildLocationsInstruction(includePhones, result.url),
			provider,
			apiKey,
			baseUrl,
		),
	};

	let llmResult: CrawlResult;
	try {
		llmResult = await crawler.crawlUrl(rawUrl, config);
	} catch (err) {
		return { jsonLdLocations, llmLocations: [], error: (err as Error).message };
	}

	if (!llmResult.success) {
		return { jsonLdLocations, llmLocations: [], error: llmResult.error_message || 'crawl request failed' };
	}
	const llmErr = checkLlmExtractionError(llmResult);
	if (llmErr) return { jsonLdLocations, llmLocations: [], error: llmErr };
	if (!llmResult.extracted_content) return { jsonLdLocations, llmLocations: [] };

	let parsed: unknown;
	try {
		parsed = JSON.parse(llmResult.extracted_content);
	} catch {
		return { jsonLdLocations, llmLocations: [], error: 'failed to parse extracted_content as JSON' };
	}

	const chunks = Array.isArray(parsed) ? (parsed as IDataObject[]) : [(parsed as IDataObject)];
	const textLower = text.toLowerCase().replace(/\s+/g, ' ');
	const llmLocations: IDataObject[] = [];

	for (const chunk of chunks) {
		if (chunk.error) continue;
		const rawLocs = Array.isArray(chunk.locations) ? (chunk.locations as IDataObject[]) : [];
		for (const loc of rawLocs) {
			const snippet = String(loc.sourceSnippet || '').trim();
			if (snippet) {
				const normSnippet = snippet.toLowerCase().replace(/\s+/g, ' ');
				let found = textLower.includes(normSnippet);
				if (!found && normSnippet.length > 30) {
					found = textLower.includes(normSnippet.slice(0, 30));
				}
				if (!found) continue;
			}
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { sourceSnippet: _ss, ...cleanLoc } = loc as Record<string, unknown>;
			llmLocations.push({ ...(cleanLoc as IDataObject), source: 'llm' });
		}
	}

	return { jsonLdLocations, llmLocations };
}

async function runLocationsExtraction(
	this: IExecuteFunctions,
	results: CrawlResult[],
	credentials: Crawl4aiApiCredentials,
	crawler: Crawl4aiClient,
	modelOverride: string | undefined,
	includePhones: boolean,
	itemIndex: number,
): Promise<IDataObject[]> {
	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);
	const locationMap = new Map<string, IDataObject>();
	const errors: string[] = [];

	const candidates = selectLocationRelevantPages(results);
	const pagesToProcess = candidates.length > 0 ? candidates : results.slice(0, 8);

	for (const result of pagesToProcess) {
		const { jsonLdLocations, llmLocations, error } = await extractLocationsFromPage(
			result, includePhones, provider, apiKey, baseUrl, crawler,
		);
		if (error) errors.push(error);
		mergeLocationsIntoMap(jsonLdLocations, locationMap);
		mergeLocationsIntoMap(llmLocations, locationMap);
	}

	if (locationMap.size === 0 && pagesToProcess.length < results.length) {
		const remaining = results
			.filter((r) => !pagesToProcess.includes(r))
			.slice(0, 5);
		for (const result of remaining) {
			const { jsonLdLocations, llmLocations, error } = await extractLocationsFromPage(
				result, includePhones, provider, apiKey, baseUrl, crawler,
			);
			if (error) errors.push(error);
			mergeLocationsIntoMap(jsonLdLocations, locationMap);
			mergeLocationsIntoMap(llmLocations, locationMap);
		}
	}

	if (locationMap.size === 0 && errors.length > 0) {
		throw new NodeOperationError(
			this.getNode(),
			`Locations extraction failed on all pages: ${errors[0]}`,
			{ itemIndex },
		);
	}

	return [...locationMap.values()];
}

/**
 * Extract data using regex patterns from markdown content
 */
function extractWithRegex(
	results: CrawlResult[],
	patterns: Record<string, RegExp[]>,
): IDataObject {
	const extracted: Record<string, string[]> = {};

	for (const [category, regexList] of Object.entries(patterns)) {
		const matches = new Set<string>();

		for (const result of results) {
			// Get markdown text from result
			let text = '';
			if (typeof result.markdown === 'object' && result.markdown !== null) {
				text = result.markdown.raw_markdown || '';
			} else if (typeof result.markdown === 'string') {
				text = result.markdown;
			}
			for (const regex of regexList) {
				// Reset regex lastIndex for global patterns
				regex.lastIndex = 0;
				const found = text.match(regex);
				if (found) {
					for (const match of found) {
						matches.add(match.trim());
					}
				}
			}
		}

		extracted[category] = [...matches];
	}

	// Mask credit card numbers for security
	if (extracted.creditCards) {
		extracted.creditCards = extracted.creditCards.map((card) => {
			const digits = card.replace(/[\s-]/g, '');
			if (digits.length >= 13) {
				return '*'.repeat(digits.length - 4) + digits.slice(-4);
			}
			return card;
		});
	}

	return extracted as unknown as IDataObject;
}

/**
 * Merge extracted data from multiple pages, deduplicating arrays by value
 */
function mergeExtractedData(items: IDataObject[]): IDataObject {
	const merged: IDataObject = {};

	for (const item of items) {
		for (const [key, value] of Object.entries(item)) {
			if (Array.isArray(value)) {
				const existing = (merged[key] as string[] | undefined) || [];
				const combined = [...existing, ...(value as string[])];
				merged[key] = [...new Set(combined)];
			} else if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
				merged[key] = value;
			}
		}
	}

	return merged;
}

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com',
		description: 'The URL to extract data from',
		displayOptions: {
			show: {
				operation: ['extractData'],
			},
		},
	},
	{
		displayName: 'Extraction Type',
		name: 'extractionType',
		type: 'options',
		options: [
			{
				name: 'Contact Info',
				value: 'contactInfo',
				description: 'Extract emails and phone numbers (no LLM required)',
			},
			{
				name: 'Financial Data',
				value: 'financialData',
				description: 'Extract currencies, credit cards, IBANs, percentages (no LLM required)',
			},
			{
				name: 'Locations & Addresses',
				value: 'locationsAddresses',
				description: 'Find all physical locations (offices, branches, stores) with unique names and addresses. Requires LLM.',
			},
			{
				name: 'Custom (LLM)',
				value: 'customLlm',
				description: 'Define custom extraction with natural language instructions (requires LLM)',
			},
		],
		default: 'contactInfo',
		description: 'What type of data to extract',
		displayOptions: {
			show: {
				operation: ['extractData'],
			},
		},
	},
	{
		displayName: 'Extraction Instructions',
		name: 'instruction',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		placeholder: 'Extract product names and prices',
		description: 'Natural language description of what to extract',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['customLlm'],
			},
		},
	},
	{
		displayName: 'Schema Fields',
		name: 'schemaFields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		description: 'Define the fields to extract',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['customLlm'],
			},
		},
		options: [
			{
				name: 'fields',
				displayName: 'Field',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						required: true,
						default: '',
						placeholder: 'productName',
						description: 'Field name in the output',
					},
					{
						displayName: 'Type',
						name: 'fieldType',
						type: 'options',
						options: [
							{ name: 'String', value: 'string' },
							{ name: 'Number', value: 'number' },
							{ name: 'Boolean', value: 'boolean' },
							{ name: 'Array', value: 'array' },
						],
						default: 'string',
						description: 'Data type of the field',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						placeholder: 'The name of the product',
						description: 'Description of what this field should contain',
					},
				],
			},
		],
	},
	{
		displayName:
			'Custom extraction requires LLM credentials to be configured in the Crawl4AI Plus credentials.',
		name: 'llmNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['customLlm'],
			},
		},
	},
	{
		displayName:
			'LLM validation requires LLM credentials to be configured in the Crawl4AI Plus credentials.',
		name: 'llmValidationNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['contactInfo'],
			},
		},
	},
	{
		displayName:
			'Locations extraction requires LLM credentials to be configured in the Crawl4AI Plus credentials.',
		name: 'locationsLlmNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['locationsAddresses'],
			},
		},
	},
	{
		displayName: 'Crawl Scope',
		name: 'crawlScope',
		type: 'options',
		options: [
			{
				name: 'Single Page',
				value: 'singlePage',
				description: 'Extract from just this one page',
			},
			{
				name: 'Follow Links',
				value: 'followLinks',
				description: 'Extract across this page and same-domain linked pages (depth 1); external links are excluded',
			},
			{
				name: 'Full Site',
				value: 'fullSite',
				description: 'Extract across the entire same-domain website (depth 3); external links are excluded',
			},
		],
		default: 'singlePage',
		description: 'How many pages to extract data from',
		displayOptions: {
			show: {
				operation: ['extractData'],
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
				operation: ['extractData'],
			},
		},
		options: [
			{
				displayName: 'Bypass Bot Detection',
				name: 'stealthMode',
				type: 'boolean',
				default: false,
				description: 'Whether to enable stealth and magic mode to help bypass bot detection (use if the site blocks automated crawlers)',
			},
			{
				displayName: 'Cache Mode',
				name: 'cacheMode',
				type: 'options',
				options: [
					{ name: 'Bypass (Skip Cache)', value: 'BYPASS' },
					{ name: 'Disabled (No Cache)', value: 'DISABLED' },
					{ name: 'Enabled (Read/Write)', value: 'ENABLED' },
					{ name: 'Read Only', value: 'READ_ONLY' },
					{ name: 'Write Only', value: 'WRITE_ONLY' },
				],
				default: 'ENABLED',
				description: 'How to use the cache when crawling',
			},
			{
				displayName: 'Browser Profile',
				name: 'browserProfile',
				type: 'options',
				options: [
					{ name: 'Chrome (Android)', value: 'chrome_android' },
					{ name: 'Chrome (Linux)', value: 'chrome_linux' },
					{ name: 'Chrome (macOS)', value: 'chrome_macos' },
					{ name: 'Chrome (Windows)', value: 'chrome_windows' },
					{ name: 'Custom', value: 'custom' },
					{ name: 'Edge (Windows)', value: 'edge_windows' },
					{ name: 'Firefox (macOS)', value: 'firefox_macos' },
					{ name: 'Firefox (Windows)', value: 'firefox_windows' },
					{ name: 'Googlebot', value: 'googlebot' },
					{ name: 'None', value: 'none' },
					{ name: 'Safari (iOS)', value: 'safari_ios' },
					{ name: 'Safari (macOS)', value: 'safari_macos' },
				],
				default: 'none',
				description: 'Preset browser headers to send with the request. Helps bypass server-side bot detection. Select Custom to enter your own headers.',
			},
			{
				displayName: 'Browser Type',
				name: 'browserType',
				type: 'options',
				options: [
					{ name: 'Chromium (default)', value: 'chromium' },
					{ name: 'Firefox', value: 'firefox' },
					{ name: 'WebKit', value: 'webkit' },
				],
				default: 'chromium',
				description: 'Browser engine to use. Firefox has a different TLS fingerprint to Chromium and can bypass bot-detection systems that block headless Chrome.',
			},
			{
				displayName: 'Custom Headers',
				name: 'customHeaders',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				placeholder: 'User-Agent: Mozilla/5.0 ...\nAccept-Language: en-AU,en;q=0.9',
				description: 'HTTP headers in Key: Value format, one per line',
				displayOptions: {
					show: {
						browserProfile: ['custom'],
					},
				},
			},
			{
				displayName: 'Default Country Code',
				name: 'defaultCountry',
				type: 'string',
				default: 'AU',
				placeholder: 'AU',
				description: 'ISO 3166-1 alpha-2 country code (two uppercase letters) used to interpret local phone numbers that have no country prefix. Examples: AU, US, GB, NZ, DE.',
				displayOptions: {
					show: {
						'/extractionType': ['contactInfo'],
					},
				},
			},
			{
				displayName: 'Exclude URL Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: '*/admin/*,*/login/*',
				description: 'Comma-separated URL patterns to exclude from crawling',
				displayOptions: {
					show: {
						'/crawlScope': ['followLinks', 'fullSite'],
					},
				},
			},
			{
				displayName: 'Include Phones',
				name: 'includePhones',
				type: 'boolean',
				default: false,
				description: 'Whether to extract phone numbers for each location in addition to address details',
				displayOptions: {
					show: {
						'/extractionType': ['locationsAddresses'],
					},
				},
			},
			{
				displayName: 'LLM Validation',
				name: 'llmValidation',
				type: 'boolean',
				default: false,
				description: 'Whether to send extracted contacts to the configured LLM for a final validation and cleanup pass. Removes false positives and normalises formats. Requires LLM credentials.',
				displayOptions: {
					show: {
						'/extractionType': ['contactInfo'],
					},
				},
			},
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				default: 10,
				description: 'Maximum number of pages to crawl',
				displayOptions: {
					show: {
						'/crawlScope': ['followLinks', 'fullSite'],
					},
				},
			},
			{
				displayName: 'Model Name or ID',
				name: 'llmModel',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getLlmModels',
				},
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: {
					show: {
						'/extractionType': ['contactInfo', 'customLlm', 'locationsAddresses'],
					},
				},
			},
			{
				displayName: 'Wait For',
				name: 'waitFor',
				type: 'string',
				default: '',
				placeholder: '.content-loaded or js:() => document.readyState === "complete"',
				description:
					'CSS selector or JS expression (prefixed with js:) to wait for before extracting content',
			},
		],
	},
];

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];
	const client = await getCrawl4aiClient(this);
	const credentials = (await this.getCredentials('crawl4aiPlusApi')) as unknown as Crawl4aiApiCredentials;

	for (let i = 0; i < items.length; i++) {
		try {
			const url = this.getNodeParameter('url', i, '') as string;
			const extractionType = this.getNodeParameter('extractionType', i, 'contactInfo') as string;
			const crawlScope = this.getNodeParameter('crawlScope', i, 'singlePage') as string;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			assertValidHttpUrl(url, this.getNode(), i);

			// Build base config
			const config: FullCrawlConfig = {
				...getSimpleDefaults(),
				cacheMode: (options.cacheMode as FullCrawlConfig['cacheMode']) || 'ENABLED',
			};

			if (options.browserType) {
				config.browserType = String(options.browserType);
			}

			if (options.stealthMode === true) {
				config.enable_stealth = true;
				config.magic = true;
				config.simulateUser = true;
				config.overrideNavigator = true;
			}

			const resolvedHeaders = resolveRequestHeaders(
				options.browserProfile as string | undefined,
				options.browserProfile === 'custom' ? options.customHeaders as string | undefined : undefined,
			);
			if (resolvedHeaders) config.headers = resolvedHeaders;

			if (options.waitFor) {
				config.waitFor = String(options.waitFor);
			}

			// Pre-flight LLM credential checks — before any crawl is initiated
			if (extractionType === 'locationsAddresses') {
				try {
					validateLlmCredentials(credentials, 'Locations extraction');
				} catch (err) {
					throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
				}
			}

			// For customLlm, build LLM extraction strategy
			if (extractionType === 'customLlm') {
				try {
					validateLlmCredentials(credentials, 'Custom extraction');
				} catch (err) {
					throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
				}

				const instruction = this.getNodeParameter('instruction', i, '') as string;
				if (!instruction) {
					throw new NodeOperationError(
						this.getNode(),
						'Extraction instruction cannot be empty.',
						{ itemIndex: i },
					);
				}

				// Build schema from fields
				const schemaFieldsRaw = this.getNodeParameter(
					'schemaFields.fields',
					i,
					[],
				) as IDataObject[];
				const properties: Record<string, IDataObject> = {};
				const required: string[] = [];

				for (const field of schemaFieldsRaw) {
					const name = field.name as string;
					const fieldType = field.fieldType as string;
					if (!name) continue;

					const prop: IDataObject = {};
					if (fieldType === 'array') {
						prop.type = 'array';
						prop.items = { type: 'string' };
					} else {
						prop.type = fieldType;
					}
					if (field.description) {
						prop.description = field.description;
					}
					properties[name] = prop;
					required.push(name);
				}

				// Fallback generic schema if no fields defined
				if (Object.keys(properties).length === 0) {
					properties.data = { type: 'array', items: { type: 'string' } };
					required.push('data');
				}

				const schema = { type: 'object', properties, required };
				const modelOverride = options.llmModel as string | undefined;
				const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride || undefined);

				config.extractionStrategy = createLlmExtractionStrategy(
					schema,
					instruction,
					provider,
					apiKey,
					baseUrl,
				);
			}

			const results = await executeCrawl(
				client,
				url,
				crawlScope as 'singlePage' | 'followLinks' | 'fullSite',
				config,
				{
					maxPages: options.maxPages as number | undefined,
					excludePatterns: options.excludePatterns as string | undefined,
				},
			);

			// Extract data based on type
			let data: IDataObject | IDataObject[];

			if (extractionType === 'contactInfo') {
				const defaultCountry = (options.defaultCountry as string) || 'AU';
				let contacts = extractContactInfo(results, defaultCountry);

				if (options.llmValidation === true) {
					try {
						validateLlmCredentials(credentials, 'LLM validation');
					} catch (err) {
						throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
					}
					const modelOverride = options.llmModel as string | undefined;
					contacts = await runLlmContactValidation.call(
						this,
						contacts,
						credentials,
						client,
						modelOverride,
						i,
					);
				}

				data = contacts;
			} else if (extractionType === 'financialData') {
				data = extractWithRegex(results, FINANCIAL_PATTERNS);
			} else if (extractionType === 'locationsAddresses') {
				const includePhones = options.includePhones === true;
				const modelOverride = options.llmModel as string | undefined;
				data = await runLocationsExtraction.call(
					this,
					results,
					credentials,
					client,
					modelOverride || undefined,
					includePhones,
					i,
				);
			} else {
				// customLlm — parse extracted JSON from each result and merge
				const extractedItems: IDataObject[] = [];
				let parseFailures = 0;
				const llmPageErrors: string[] = [];
				let pagesWithContent = 0;
				for (const result of results) {
					if (result.extracted_content) {
						pagesWithContent++;
						const llmError = checkLlmExtractionError(result);
						if (llmError) {
							llmPageErrors.push(llmError);
						} else {
							try {
								const parsed = JSON.parse(result.extracted_content) as IDataObject | IDataObject[];
								// LLM extraction returns an array of chunk results; flatten and skip error envelopes
								const items = Array.isArray(parsed) ? parsed : [parsed];
								for (const item of items) {
									// Skip Crawl4AI error envelopes (error:true + string content + tags array)
									if (item && !(item.error === true && typeof item.content === 'string' && Array.isArray(item.tags))) {
										extractedItems.push(item);
									}
								}
							} catch {
								parseFailures++;
							}
						}
					}
				}
				// Only throw when every page with content returned LLM errors (no usable data at all)
				if (llmPageErrors.length > 0 && llmPageErrors.length === pagesWithContent) {
					throw new NodeOperationError(this.getNode(), `LLM extraction failed: ${llmPageErrors[0]}`, { itemIndex: i });
				}

				if (extractedItems.length > 1) {
					data = mergeExtractedData(extractedItems);
				} else if (extractedItems.length === 1) {
					data = extractedItems[0];
				} else {
					data = {
						extractionSuccess: false,
						warning: 'Failed to parse extracted content as JSON',
					};
				}

				// Surface parse failures so users know some pages' data was lost
				if (parseFailures > 0 && typeof data === 'object' && !Array.isArray(data)) {
					(data as IDataObject)._parseWarning = `${parseFailures} page(s) returned content that could not be parsed as JSON`;
				}
			}

			const formatted = formatExtractedDataResult(results, data, extractionType);

			allResults.push({
				json: formatted,
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
