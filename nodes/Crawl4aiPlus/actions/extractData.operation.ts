import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { findNumbers, isSupportedCountry, type CountryCode } from 'libphonenumber-js';

import type { Crawl4aiApiCredentials, Crawl4aiNodeOptions, CrawlResult, ExtractionStrategy, FullCrawlConfig } from '../../shared/interfaces';
import { checkLlmExtractionError } from '../../shared/formatters';
import { Crawl4aiClient } from '../../shared/apiClient';
import {
	assertValidHttpUrl,
	getCrawl4aiClient,
	getSimpleDefaults,
	executeCrawl,
	executeSmartUrlCrawl,
	validateLlmCredentials,
	buildLlmConfig,
	createLlmExtractionStrategy,
	resolveRequestHeaders,
} from '../helpers/utils';
import type { SmartUrlSelectionMeta } from '../helpers/utils';
import { formatExtractedDataResult } from '../helpers/formatters';
import { extractJsonLd } from '../../shared/seo-helpers';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const ABOUT_ORG_DEFAULT_PROMPT =
	`Extract a concise description of this organisation in 60 words or fewer. ` +
	`Include: the type of organisation and what it offers, the products or services it provides, and who it serves. ` +
	`Write in plain, direct Australian English. Do not quote the organisation name. ` +
	`Do not use vague, promotional or fluffy language. Return only the description text, no headings or labels.`;

const ORG_NAME_SCHEMA: IDataObject = {
	type: 'object',
	properties: {
		officialName: {
			type: 'string',
			description: 'The official registered or trading name of the organisation, exactly as it appears on the page. null if not determinable.',
		},
		confidence: {
			type: 'string',
			enum: ['high', 'medium', 'low'],
			description: 'high: name in title/header/copyright; medium: appears once in body; low: inferred from context',
		},
	},
	required: ['officialName', 'confidence'],
};

const ORG_NAME_INSTRUCTION =
	`You are extracting the official name of an organisation from a web page. ` +
	`Return the official registered or trading name as it appears on the page — not a description. ` +
	`Prefer the name from the page title, header, or copyright notice over body text mentions. ` +
	`If multiple names appear, return the most formal or legal-sounding one. ` +
	`If no organisation name can be determined, return null for officialName.`;

async function runOrgNameExtraction(
	this: IExecuteFunctions,
	results: CrawlResult[],
	credentials: Crawl4aiApiCredentials,
	crawler: Crawl4aiClient,
	modelOverride: string | undefined,
	itemIndex: number,
): Promise<{ officialName: string | null; confidence: 'high' | 'medium' | 'low' }> {
	const combinedText = results.map((r) => {
		if (typeof r.markdown === 'object' && r.markdown !== null) return r.markdown.raw_markdown || '';
		if (typeof r.markdown === 'string') return r.markdown;
		return '';
	}).filter(Boolean).join('\n\n---\n\n');

	if (!combinedText) return { officialName: null, confidence: 'low' };

	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);
	const truncated = combinedText.slice(0, 20000);
	const escaped = truncated.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const rawUrl = `raw:<pre>${escaped}</pre>`;

	const config: FullCrawlConfig = {
		extractionStrategy: createLlmExtractionStrategy(
			ORG_NAME_SCHEMA, ORG_NAME_INSTRUCTION, provider, apiKey, baseUrl,
		),
	};

	try {
		const result = await crawler.crawlUrl(rawUrl, config);
		if (!result.success || !result.extracted_content) return { officialName: null, confidence: 'low' };
		const parsed = JSON.parse(result.extracted_content) as unknown;
		const items = Array.isArray(parsed)
			? (parsed as IDataObject[]).filter((c) => !c.error)
			: parsed ? [parsed as IDataObject] : [];
		if (items.length === 0) return { officialName: null, confidence: 'low' };
		const item = items[0];
		return {
			officialName: (item.officialName as string | null) ?? null,
			confidence: (item.confidence as 'high' | 'medium' | 'low') || 'low',
		};
	} catch {
		return { officialName: null, confidence: 'low' };
	}
}

const EMAIL_NAME_SCHEMA: IDataObject = {
	type: 'object',
	properties: {
		emails: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					email: { type: 'string', description: 'The email address' },
					suggestedName: {
						type: 'string',
						description: "Person name, role, or office/location label associated with this email (e.g. 'John Smith', 'Sydney Office', 'Accounts'). null if unknown.",
					},
				},
				required: ['email'],
			},
		},
	},
	required: ['emails'],
};

const EMAIL_NAME_INSTRUCTION =
	`You are annotating a list of email addresses found on a web page. ` +
	`For each email address, find any associated name from the surrounding page context. ` +
	`The name may be a person's full name, a role title (e.g. "Accounts", "Reception"), or an office/location label (e.g. "Sydney Office"). ` +
	`Set suggestedName to null when no name can be determined from context. ` +
	`Do not fabricate names. Only use names clearly associated with the email on the page.`;

async function runEmailNameSuggestion(
	this: IExecuteFunctions,
	emails: string[],
	results: CrawlResult[],
	credentials: Crawl4aiApiCredentials,
	crawler: Crawl4aiClient,
	modelOverride: string | undefined,
	itemIndex: number,
): Promise<Array<{ email: string; suggestedName?: string }>> {
	if (emails.length === 0) return [];

	const combinedText = results.map((r) => {
		if (typeof r.markdown === 'object' && r.markdown !== null) return r.markdown.raw_markdown || '';
		if (typeof r.markdown === 'string') return r.markdown;
		return '';
	}).filter(Boolean).join('\n\n---\n\n');

	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);
	const emailListJson = JSON.stringify({ emails }, null, 2);
	const truncatedContent = combinedText.slice(0, 15000);
	const combined = `EMAILS TO ANNOTATE:\n${emailListJson}\n\nPAGE CONTENT:\n${truncatedContent}`;
	const escaped = combined.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const rawUrl = `raw:<pre>${escaped}</pre>`;

	const config: FullCrawlConfig = {
		extractionStrategy: createLlmExtractionStrategy(
			EMAIL_NAME_SCHEMA, EMAIL_NAME_INSTRUCTION, provider, apiKey, baseUrl,
		),
	};

	try {
		const result = await crawler.crawlUrl(rawUrl, config);
		if (!result.success || !result.extracted_content) return emails.map((email) => ({ email }));
		const parsed = JSON.parse(result.extracted_content) as unknown;
		const items = Array.isArray(parsed)
			? (parsed as IDataObject[]).filter((c) => !c.error)
			: parsed ? [parsed as IDataObject] : [];
		if (items.length === 0) return emails.map((email) => ({ email }));

		const resultEmails = items[0].emails as Array<{ email: string; suggestedName?: string }> | undefined;
		if (!Array.isArray(resultEmails)) return emails.map((email) => ({ email }));

		const resultMap = new Map(resultEmails.map((e) => [e.email.toLowerCase(), e]));
		return emails.map((email) => {
			const match = resultMap.get(email.toLowerCase());
			return match?.suggestedName
				? { email, suggestedName: match.suggestedName }
				: { email };
		});
	} catch {
		return emails.map((email) => ({ email }));
	}
}

const ABOUT_ORG_SCHEMA: IDataObject = {
	type: 'object',
	properties: {
		description: {
			type: 'string',
			description: 'Concise organisation description matching the prompt instructions',
		},
	},
	required: ['description'],
};

async function runAboutOrgExtraction(
	this: IExecuteFunctions,
	results: CrawlResult[],
	credentials: Crawl4aiApiCredentials,
	crawler: Crawl4aiClient,
	modelOverride: string | undefined,
	instruction: string,
	itemIndex: number,
): Promise<string | null> {
	const combinedText = results.map((r) => {
		if (typeof r.markdown === 'object' && r.markdown !== null) return r.markdown.raw_markdown || '';
		if (typeof r.markdown === 'string') return r.markdown;
		return '';
	}).filter(Boolean).join('\n\n---\n\n');

	if (!combinedText) return null;

	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);
	const truncated = combinedText.slice(0, 20000);
	const escaped = truncated.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const rawUrl = `raw:<pre>${escaped}</pre>`;

	const config: FullCrawlConfig = {
		extractionStrategy: createLlmExtractionStrategy(
			ABOUT_ORG_SCHEMA, instruction, provider, apiKey, baseUrl,
		),
	};

	try {
		const result = await crawler.crawlUrl(rawUrl, config);
		if (!result.success || !result.extracted_content) return null;
		const parsed = JSON.parse(result.extracted_content) as unknown;
		const items = Array.isArray(parsed)
			? (parsed as IDataObject[]).filter((c) => !c.error)
			: parsed ? [parsed as IDataObject] : [];
		if (items.length === 0) return null;
		return (items[0].description as string) || null;
	} catch {
		return null;
	}
}

const CUSTOM_EXTRACTION_SCHEMA: IDataObject = {
	type: 'object',
	properties: {
		value: {
			type: 'string',
			description: 'The extracted content as specified in the instruction',
		},
	},
	required: ['value'],
};

async function runCustomExtraction(
	this: IExecuteFunctions,
	results: CrawlResult[],
	credentials: Crawl4aiApiCredentials,
	crawler: Crawl4aiClient,
	modelOverride: string | undefined,
	instruction: string,
	itemIndex: number,
): Promise<string | null> {
	const combinedText = results.map((r) => {
		if (typeof r.markdown === 'object' && r.markdown !== null) return r.markdown.raw_markdown || '';
		if (typeof r.markdown === 'string') return r.markdown;
		return '';
	}).filter(Boolean).join('\n\n---\n\n');

	if (!combinedText) return null;

	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);
	const truncated = combinedText.slice(0, 20000);
	const escaped = truncated.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const rawUrl = `raw:<pre>${escaped}</pre>`;

	const config: FullCrawlConfig = {
		extractionStrategy: createLlmExtractionStrategy(
			CUSTOM_EXTRACTION_SCHEMA, instruction, provider, apiKey, baseUrl,
		),
	};

	try {
		const result = await crawler.crawlUrl(rawUrl, config);
		if (!result.success || !result.extracted_content) return null;
		const parsed = JSON.parse(result.extracted_content) as unknown;
		const items = Array.isArray(parsed)
			? (parsed as IDataObject[]).filter((c) => !c.error)
			: parsed ? [parsed as IDataObject] : [];
		if (items.length === 0) return null;
		return (items[0].value as string) || null;
	} catch {
		return null;
	}
}

const LOCATION_QUERY_KEYWORDS = [
	'address', 'avenue', 'boulevard', 'branch', 'branches', 'campus', 'centre', 'center',
	'clinic', 'contact', 'depot', 'directions', 'distributor', 'facility', 'factory',
	'find-us', 'floor', 'get-in-touch', 'headquarters', 'hub', 'imprint', 'impressum',
	'level', 'location', 'locations', 'map', 'office', 'offices', 'outlet', 'pharmacy',
	'postcode', 'reach-us', 'road', 'showroom', 'stockist', 'store', 'stores', 'street',
	'suburb', 'suite', 'unit', 'visit-us', 'warehouse', 'where-to-buy', 'zip-code',
];

const LOCATION_CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function extractContactInfo(
	results: CrawlResult[],
	defaultCountry: string,
): { emails: string[]; phones: string[] } {
	const emails = new Set<string>();
	const phoneMap = new Map<string, string>();

	for (const result of results) {
		let text = '';
		if (typeof result.markdown === 'object' && result.markdown !== null) {
			text = result.markdown.raw_markdown || '';
		} else if (typeof result.markdown === 'string') {
			text = result.markdown;
		}
		if (!text) continue;

		EMAIL_PATTERN.lastIndex = 0;
		const emailMatches = text.match(EMAIL_PATTERN);
		if (emailMatches) {
			for (const e of emailMatches) emails.add(e.toLowerCase());
		}

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

function splitStreetAddress(streetAddress: string): { address1: string; address2?: string } {
	// "Level 2/343 Collins St" → address1="343 Collins St", address2="Level 2"
	const slashMatch = streetAddress.match(/^(level|floor|fl?)\s*\d+\s*\//i);
	if (slashMatch) {
		const slashIdx = streetAddress.indexOf('/');
		return {
			address1: streetAddress.slice(slashIdx + 1).trim(),
			address2: streetAddress.slice(0, slashIdx).trim(),
		};
	}
	// "Level 2, Suites 214/215, 343 Collins St" → strip all leading unit qualifiers, collect in parts
	const prefixRe = /^((?:level|floor|fl?|suite|suites?|unit|apt|flat|ste|room)\s+[^,]+),\s*/i;
	let remaining = streetAddress;
	const parts: string[] = [];
	let m: RegExpMatchArray | null;
	while ((m = remaining.match(prefixRe))) {
		parts.push(m[1].trim());
		remaining = remaining.slice(m[0].length).trim();
	}
	if (parts.length > 0) {
		return { address1: remaining, address2: parts.join(', ') };
	}
	return { address1: streetAddress };
}

function mapJsonLdPostalAddress(
	orgName: string | undefined,
	addr: IDataObject,
	telephone: string | undefined,
	includePhones: boolean,
): IDataObject | null {
	const street = String(addr.streetAddress || '').trim();
	const city = String(addr.addressLocality || '').trim();
	const country = String(addr.addressCountry || '').trim();
	if (!street) return null; // city-only entries cause dedup collisions; LLM handles partial addresses
	const state = String(addr.addressRegion || '').trim();
	const postcode = String(addr.postalCode || '').trim();
	const { address1, address2 } = splitStreetAddress(street);
	const loc: IDataObject = {
		name: orgName || (city ? `${city} Location` : 'Location'),
		city,
		country,
		confidence: 'high',
		source: 'json-ld',
	};
	if (address1) loc.address1 = address1;
	if (address2) loc.address2 = address2;
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

		// Walk child properties BEFORE checking address — parent may have no address
		// but its hasPOS/location/containsPlace children hold the actual PostalAddress nodes
		for (const prop of ['hasPOS', 'location', 'containsPlace'] as const) {
			const val = node[prop];
			if (!val) continue;
			const children = Array.isArray(val) ? (val as IDataObject[]) : [val as IDataObject];
			for (const child of children) processNode(child);
		}

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
	}

	for (const item of data) {
		// Some JSON-LD scripts emit an array of objects at the top level
		if (Array.isArray(item)) {
			for (const child of item as IDataObject[]) processNode(child);
		} else {
			processNode(item);
		}
	}
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
		address1: {
			type: 'string',
			description: 'Street number and street name only — no unit, level, or floor (e.g. "343 Little Collins Street")',
		},
		address2: {
			type: 'string',
			description: 'Unit, level, floor, or suite designation (e.g. "Level 2" or "Suite 5"). Omit if not present.',
		},
		city: { type: 'string', description: 'Suburb or city' },
		state: { type: 'string', description: 'State, province, or region (abbreviated or full, e.g. "VIC" or "Victoria")' },
		postcode: { type: 'string', description: 'Postal code or ZIP code' },
		country: { type: 'string', description: 'Country name or ISO 3166-1 alpha-2 code' },
		additionalNotes: {
			type: 'string',
			description: 'Any additional notable details about this location (e.g. opening hours, landmark, parking). Omit if none.',
		},
		confidence: {
			type: 'string',
			enum: ['high', 'medium', 'low'],
			description: 'high = address1 + postcode + city present; medium = missing postcode or state; low = city/country only',
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
	(itemProperties as Record<string, IDataObject>).emails = {
		type: 'array',
		items: { type: 'string' },
		description: 'Email addresses found in the same contact block as this location address. Omit if none — do not include site-wide header/footer emails.',
	};
	return {
		type: 'object',
		properties: {
			locations: {
				type: 'array',
				description: 'All physical locations found on the page',
				items: {
					type: 'object',
					properties: itemProperties,
					required: ['name', 'address1', 'city', 'country', 'confidence', 'sourceSnippet'],
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
	const emailStepNum = includePhones ? '6' : '5';
	const emailStep = `\n${emailStepNum}. If email addresses are found in the same content block as this address (e.g. a contact card, sidebar section, or footer block specific to this location), include them in the emails array. Do not include site-wide emails from page headers, navigation, or unrelated sections. Omit the field if none found.`;
	const urlContext = pageUrl ? `\n\nSource page: ${pageUrl}` : '';
	const phoneFewShot = includePhones ? ', "phone": "+61 3 9000 0000"' : '';
	// Second example omits phone — teaches LLM to skip field when unknown
	const phoneFewShot2 = '';
	return `You are a location data extractor. Find ALL physical locations (offices, branches, stores, showrooms, warehouses, headquarters, distributors, stockists, dealers) mentioned on this page.${urlContext}

For each location:
1. Extract address1 (street number + street name only, e.g. "200 Collins Street"), address2 (unit/level/floor/suite if present, e.g. "Level 12"), city, state, postcode, and country separately.
2. Assign a unique name: use the explicit label if present (e.g. "Melbourne Office", "Head Office"); if no label, derive one from city/suburb with a generic suffix — use Office, Location, or Branch (never Facility, Site, Plant, or similar industry-specific terms). Every name MUST be unique.
3. Assign confidence: "high" if address1 + postcode + city present; "medium" if missing postcode or state; "low" if city/country only.
4. Copy the exact verbatim text snippet (1–2 sentences) from the page that contains or supports the address into sourceSnippet.${phoneStep}${emailStep}

Include: offices, branches, stores, showrooms, warehouses, distribution centres, factories, partner/dealer/stockist locations (if an address is given).
Exclude: P.O. boxes, virtual offices, registered agent addresses, locations with no street address.
If no physical locations are found, return: {"locations": []}

Examples:

Input: "Our Melbourne office is at Level 12, 200 Collins Street, Melbourne VIC 3000."
Output: {"locations":[{"name":"Melbourne Office","address1":"200 Collins Street","address2":"Level 12","city":"Melbourne","state":"VIC","postcode":"3000","country":"Australia","confidence":"high","sourceSnippet":"Our Melbourne office is at Level 12, 200 Collins Street, Melbourne VIC 3000."${phoneFewShot}}]}

Input: "Visit our Sydney showroom at 42 George Street, Sydney. Open weekdays 9–5."
Output: {"locations":[{"name":"Sydney Showroom","address1":"42 George Street","city":"Sydney","country":"Australia","confidence":"medium","sourceSnippet":"Visit our Sydney showroom at 42 George Street, Sydney."${phoneFewShot2}}]}`;
}

function mergeLocationsIntoMap(
	locations: IDataObject[],
	locationMap: Map<string, IDataObject>,
): void {
	for (const loc of locations) {
		if (!loc || (loc as IDataObject & { error?: unknown }).error) continue;
		const addr1 = String(loc.address1 || '');
		const postcode = String(loc.postcode || '').trim();
		const city = String(loc.city || '').toLowerCase().replace(/\s+/g, ' ').trim();
		const addrKey = canonicalizeAddress(addr1, postcode || undefined);
		const key = addrKey ? (city ? `${city}|${addrKey}` : addrKey) : city;
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

function extractStreetNum(address1: string): string {
	const m = address1.toLowerCase().replace(/\s+/g, ' ').trim().match(/(\d{1,5})/);
	return m ? m[1] : '';
}

function extractStreetNameKey(address1: string): string {
	// "343 Little Collins Street" → "little collins street" (full canonicalized street name)
	let s = address1.toLowerCase().replace(/^\d+\s*/, '').trim();
	for (const [pattern, replacement] of ADDRESS_ABBREVIATIONS) {
		s = s.replace(pattern, replacement);
	}
	return s.replace(/[.,#\-/]/g, ' ').replace(/\s+/g, ' ').trim();
}

function computeLocationKeys(loc: IDataObject): string[] {
	const keys: string[] = [];
	const addr1 = String(loc.address1 || '');
	const streetNum = extractStreetNum(addr1);
	const streetNameKey = extractStreetNameKey(addr1);
	const postcode = String(loc.postcode || '').trim();
	const city = String(loc.city || '').toLowerCase().replace(/\s+/g, ' ').trim();
	if (postcode && streetNum && streetNameKey) keys.push(`pc:${postcode}:${streetNum}:${streetNameKey}`);
	if (city && streetNum && streetNameKey) keys.push(`ci:${city}:${streetNum}:${streetNameKey}`);
	if (keys.length === 0 && addr1) {
		keys.push(`ca:${canonicalizeAddress(addr1, postcode || undefined)}`);
	}
	return keys;
}

function selectBestLocation(group: IDataObject[]): IDataObject {
	if (group.length === 1) return group[0];
	const sorted = [...group].sort((a, b) => {
		const ra = LOCATION_CONFIDENCE_RANK[String(a.confidence || 'low')] ?? 0;
		const rb = LOCATION_CONFIDENCE_RANK[String(b.confidence || 'low')] ?? 0;
		if (rb !== ra) return rb - ra;
		const sa = a.source === 'json-ld' ? 1 : 0;
		const sb = b.source === 'json-ld' ? 1 : 0;
		if (sb !== sa) return sb - sa;
		return String(b.address1 || '').length - String(a.address1 || '').length;
	});
	const best = { ...sorted[0] };
	for (const candidate of sorted.slice(1)) {
		for (const [k, v] of Object.entries(candidate)) {
			if (v !== null && v !== undefined && v !== '' && (best[k] === null || best[k] === undefined || best[k] === '')) {
				best[k] = v;
			}
		}
	}
	return best;
}

function deduplicateLocations(locations: IDataObject[]): IDataObject[] {
	if (locations.length <= 1) return locations;
	const parent = locations.map((_, i) => i);
	function find(i: number): number {
		if (parent[i] !== i) parent[i] = find(parent[i]);
		return parent[i];
	}
	const keyToIndices = new Map<string, number[]>();
	for (let idx = 0; idx < locations.length; idx++) {
		for (const key of computeLocationKeys(locations[idx])) {
			if (!keyToIndices.has(key)) keyToIndices.set(key, []);
			keyToIndices.get(key)!.push(idx);
		}
	}
	for (const indices of keyToIndices.values()) {
		for (let k = 1; k < indices.length; k++) {
			const ri = find(indices[0]);
			const rk = find(indices[k]);
			if (ri !== rk) parent[ri] = rk;
		}
	}
	const groups = new Map<number, IDataObject[]>();
	for (let i = 0; i < locations.length; i++) {
		const root = find(i);
		if (!groups.has(root)) groups.set(root, []);
		groups.get(root)!.push(locations[i]);
	}
	return [...groups.values()].map(selectBestLocation);
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
	const textNorm = normalizeForGrounding(text);
	const llmLocations: IDataObject[] = [];

	for (const chunk of chunks) {
		if (chunk.error) continue;
		const rawLocs = Array.isArray(chunk.locations) ? (chunk.locations as IDataObject[]) : [];
		for (const loc of rawLocs) {
			const snippet = String(loc.sourceSnippet || '').trim();
			if (!snippet) continue;
			if (!snippetIsGrounded(snippet, textNorm)) continue;
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { sourceSnippet: _ss, ...cleanLoc } = loc as Record<string, unknown>;
			llmLocations.push({ ...(cleanLoc as IDataObject), source: 'llm' });
		}
	}

	return { jsonLdLocations, llmLocations };
}

function normalizeForGrounding(s: string): string {
	return s
		.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
		.toLowerCase()
		.replace(/[*_`#>[\]()]/g, ' ')
		.replace(/[,.:;\-–—]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

// Sliding token-window fallback so framing prefixes/suffixes ("Our address is … Australia") don't
// cause valid snippets to fail — any ≥60% consecutive token run of ≥20 chars must appear in source.
function snippetIsGrounded(snippet: string, textNorm: string): boolean {
	const normSnippet = normalizeForGrounding(snippet);
	if (!normSnippet) return false;
	if (textNorm.includes(normSnippet)) return true;

	const tokens = normSnippet.split(' ').filter((t) => t.length > 0);
	if (tokens.length < 3) return false;

	// Require any window covering at least 60% of snippet tokens AND ≥20 chars to land verbatim in source.
	// Anchors a "real" copied phrase even when the LLM wraps the address with framing words.
	const minWindowTokens = Math.max(3, Math.floor(tokens.length * 0.6));
	for (let windowSize = tokens.length; windowSize >= minWindowTokens; windowSize--) {
		for (let start = 0; start + windowSize <= tokens.length; start++) {
			const window = tokens.slice(start, start + windowSize).join(' ');
			if (window.length < 20) continue;
			if (textNorm.includes(window)) return true;
		}
	}
	return false;
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

	const pagesToProcess = results;

	for (const result of pagesToProcess) {
		const { jsonLdLocations, llmLocations, error } = await extractLocationsFromPage(
			result, includePhones, provider, apiKey, baseUrl, crawler,
		);
		if (error) errors.push(error);
		mergeLocationsIntoMap(jsonLdLocations, locationMap);
		mergeLocationsIntoMap(llmLocations, locationMap);
	}

	if (locationMap.size === 0 && errors.length > 0) {
		throw new NodeOperationError(
			this.getNode(),
			`Locations extraction failed on all pages: ${errors[0]}`,
			{ itemIndex },
		);
	}

	return deduplicateLocations([...locationMap.values()]);
}


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
		displayName: 'Max Pages',
		name: 'maxPages',
		type: 'number',
		default: 10,
		description: 'Maximum number of pages to crawl',
		displayOptions: {
			show: {
				operation: ['extractData'],
				crawlScope: ['followLinks', 'fullSite'],
			},
		},
	},
	{
		displayName: 'Include Location Details',
		name: 'includeLocationDetails',
		type: 'boolean',
		default: false,
		description: 'Whether to group contact info by location — adds a locations array where each entry has address, phone, and any location-specific emails. Requires LLM credentials.',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['contactInfo'],
			},
		},
	},
	{
		displayName:
			'Include Location Details requires LLM credentials to be configured in the Crawl4AI Plus credentials.',
		name: 'includeLocationDetailsLlmNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['contactInfo'],
				includeLocationDetails: [true],
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
				operation: ['extractData'],
				extractionType: ['locationsAddresses'],
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
				operation: ['extractData'],
				extractionType: ['contactInfo'],
			},
		},
	},
	{
		displayName: 'Smart URL Selection',
		name: 'smartUrlSelection',
		type: 'boolean',
		default: false,
		description: 'Whether to use LLM to select the most relevant pages before crawling. Crawls the seed page first, extracts all links, then asks the LLM to pick the most relevant URLs. Requires LLM credentials.',
		displayOptions: {
			show: {
				operation: ['extractData'],
				crawlScope: ['followLinks', 'fullSite'],
			},
		},
	},
	{
		displayName: 'Smart URL selection requires LLM credentials to be configured in the Crawl4AI Plus credentials.',
		name: 'smartUrlLlmNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['extractData'],
				smartUrlSelection: [true],
				extractionType: ['contactInfo', 'financialData'],
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
				displayName: 'Avoid Ads',
				name: 'avoidAds',
				type: 'boolean',
				default: false,
				description: 'Whether to block ad-related network requests during crawl (reduces noise, speeds up page load)',
			},
			{
				displayName: 'Avoid CSS',
				name: 'avoidCss',
				type: 'boolean',
				default: false,
				description: 'Whether to block CSS resource requests during crawl (faster for text-only extraction)',
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
					{ name: 'Chromium (Default)', value: 'chromium' },
					{ name: 'Firefox', value: 'firefox' },
					{ name: 'WebKit', value: 'webkit' },
				],
				default: 'chromium',
				description: 'Browser engine to use. Firefox has a different TLS fingerprint to Chromium and can bypass bot-detection systems that block headless Chrome.',
			},
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
				displayName: 'Delay Before Return (Ms)',
				name: 'delayBeforeReturnHtml',
				type: 'number',
				default: 0,
				description: 'Milliseconds to wait after page load before returning HTML. Use for pages where content loads after the initial render (e.g. AJAX-heavy sites).',
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
				displayName: 'Explore Depth',
				name: 'exploreDepth',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 1, maxValue: 3 },
				description: 'How many levels deep to crawl explore-hint sections suggested by the LLM. Default 1 crawls one level into a section (e.g. /about/ to /about/contact/).',
				displayOptions: {
					show: {
						'/smartUrlSelection': [true],
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
						'/extractionType': ['contactInfo', 'customLlm', 'financialData', 'locationsAddresses'],
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
			{
				displayName: 'Wait Until',
				name: 'waitUntil',
				type: 'options',
				options: [
					{ name: 'Commit (First Byte)', value: 'commit', description: 'Return as soon as the first byte of the response is received' },
					{ name: 'DOM Content Loaded', value: 'domcontentloaded', description: 'Wait for the DOMContentLoaded event' },
					{ name: 'Load', value: 'load', description: 'Wait for the load event (default browser behaviour)' },
					{ name: 'Network Idle', value: 'networkidle', description: 'Wait until no network requests for 500ms — best for AJAX/SPA sites' },
				],
				default: 'load',
				description: 'Navigation event to wait for before extracting content. Use Network Idle for JS-heavy or AJAX-rendered pages.',
			},
		],
	},
];

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
			const smartUrlSelection = this.getNodeParameter('smartUrlSelection', i, false) as boolean;
			const maxPages = this.getNodeParameter('maxPages', i, 10) as number;
			const includePhones = this.getNodeParameter('includePhones', i, false) as boolean;
			const llmValidation = this.getNodeParameter('llmValidation', i, false) as boolean;
			const includeLocationDetails = this.getNodeParameter('includeLocationDetails', i, false) as boolean;
			const instruction = extractionType === 'customLlm'
				? this.getNodeParameter('instruction', i, '') as string
				: '';

			assertValidHttpUrl(url, this.getNode(), i);

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

			if (options.waitUntil) {
				config.waitUntil = String(options.waitUntil);
			}
			if (options.delayBeforeReturnHtml != null) {
				config.delayBeforeReturnHtml = Number(options.delayBeforeReturnHtml) / 1000;
			}

			if (options.avoidAds === true) {
				config.avoidAds = true;
			}
			if (options.avoidCss === true) {
				config.avoidCss = true;
			}

			// Validate LLM credentials before crawl — surfaces credential errors without consuming a crawl request.
			if (extractionType === 'locationsAddresses') {
				try {
					validateLlmCredentials(credentials, 'Locations extraction');
				} catch (err) {
					throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
				}
			}

			if (smartUrlSelection === true && crawlScope !== 'singlePage' &&
				(extractionType === 'contactInfo' || extractionType === 'financialData')) {
				try {
					validateLlmCredentials(credentials, 'Smart URL selection');
				} catch (err) {
					throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
				}
			}

			if (extractionType === 'customLlm') {
				try {
					validateLlmCredentials(credentials, 'Custom extraction');
				} catch (err) {
					throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
				}

				if (!instruction) {
					throw new NodeOperationError(
						this.getNode(),
						'Extraction instruction cannot be empty.',
						{ itemIndex: i },
					);
				}

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

				// No fields configured — generic schema prevents API rejection of an empty properties object.
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

			// Strategy detached so the seed crawl fetches plain markdown; reattached via executeSmartUrlCrawl for the final crawl only.
			let finalExtractionStrategy: ExtractionStrategy | undefined;
			if (smartUrlSelection === true && crawlScope !== 'singlePage' &&
				extractionType === 'customLlm' && config.extractionStrategy) {
				finalExtractionStrategy = config.extractionStrategy;
				delete config.extractionStrategy;
			}

			const useSmartUrlSelection = smartUrlSelection === true && crawlScope !== 'singlePage';

			let results: CrawlResult[];
			let smartUrlMeta: SmartUrlSelectionMeta | undefined;

			if (useSmartUrlSelection) {
				const exploreDepth = Math.max(1, Math.min(3, Number(options.exploreDepth ?? 1)));
				const modelOverride = options.llmModel as string | undefined;
				const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride || undefined);

				const extractionContextMap: Record<string, string> = {
					contactInfo: 'email addresses and phone numbers',
					financialData: 'prices, financial figures, or transaction data',
					locationsAddresses: 'physical addresses, offices, branches, or store locations',
					customLlm: `Find pages most likely to be helpful in answering or completing: ${instruction}`,
				};

				const smartResult = await executeSmartUrlCrawl(
					client,
					url,
					config,
					{
						maxPages: maxPages ?? 10,
						excludePatterns: options.excludePatterns as string | undefined,
					},
					{
						extractionContext: extractionContextMap[extractionType] ?? 'relevant content',
						exploreDepth,
						provider,
						apiKey,
						baseUrl,
						keywords: extractionType === 'locationsAddresses' ? LOCATION_QUERY_KEYWORDS : undefined,
						finalExtractionStrategy,
					},
					this.getNode(),
					i,
				);
				results = smartResult.results;
				smartUrlMeta = smartResult.meta;
			} else {
				results = await executeCrawl(
					client,
					url,
					crawlScope as 'singlePage' | 'followLinks' | 'fullSite',
					config,
					{
						maxPages: maxPages ?? undefined,
						excludePatterns: options.excludePatterns as string | undefined,
						keywords: extractionType === 'locationsAddresses' ? LOCATION_QUERY_KEYWORDS : undefined,
					},
				);
			}

			let data: IDataObject | IDataObject[];

			if (extractionType === 'contactInfo') {
				const defaultCountry = (options.defaultCountry as string) || 'AU';
				let contacts = extractContactInfo(results, defaultCountry);

				if (llmValidation === true) {
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

				if (includeLocationDetails === true) {
					try {
						validateLlmCredentials(credentials, 'location details extraction');
					} catch (err) {
						throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
					}
					const modelOverride = options.llmModel as string | undefined;
					const locations = await runLocationsExtraction.call(
						this, results, credentials, client, modelOverride || undefined, true, i,
					);
					data = { emails: contacts.emails, phones: contacts.phones, locations };
				} else {
					data = contacts;
				}
			} else if (extractionType === 'financialData') {
				data = extractWithRegex(results, FINANCIAL_PATTERNS);
			} else if (extractionType === 'locationsAddresses') {
				const modelOverride = options.llmModel as string | undefined;
				const isZeroUrlFallback = smartUrlMeta?.warnings.some(
					(w) => w.startsWith('LLM returned no candidate URLs'),
				) ?? false;
				if (isZeroUrlFallback) {
					try {
						data = await runLocationsExtraction.call(
							this, results, credentials, client, modelOverride || undefined, includePhones, i,
						);
					} catch (err) {
						if (smartUrlMeta) smartUrlMeta.warnings.push(`Locations extraction error: ${(err as Error).message}`);
						data = [];
					}
				} else {
					data = await runLocationsExtraction.call(
						this, results, credentials, client, modelOverride || undefined, includePhones, i,
					);
				}
			} else {
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

				if (parseFailures > 0 && typeof data === 'object' && !Array.isArray(data)) {
					(data as IDataObject)._parseWarning = `${parseFailures} page(s) returned content that could not be parsed as JSON`;
				}
			}

			const formatted = formatExtractedDataResult(results, data, extractionType, smartUrlMeta);

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
