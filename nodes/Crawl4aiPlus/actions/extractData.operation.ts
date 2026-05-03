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
	executeSmartUrlCrawl,
	validateLlmCredentials,
	buildLlmConfig,
	createLlmExtractionStrategy,
} from '../helpers/utils';
import type { SmartUrlSelectionMeta } from '../helpers/utils';
import { formatExtractedDataResult } from '../helpers/formatters';
import { extractJsonLd } from '../../shared/seo-helpers';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const RESERVED_DATA_KEYS = new Set([
	'orgName', 'orgNameConfidence', 'phones', 'emails', 'locations', 'aboutOrg',
]);

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

const COMBINED_TEXT_BUDGET = 60000; // chars — distributed evenly across pages

// Combine page text with per-page budget so every page gets representation.
// Fixed-size slicing (e.g. slice(0, 20000)) silently drops later pages on multi-page crawls.
function combinePagesWithBudget(results: CrawlResult[], budget = COMBINED_TEXT_BUDGET): string {
	const texts = results.map((r) => {
		if (typeof r.markdown === 'object' && r.markdown !== null) return (r.markdown as { raw_markdown?: string }).raw_markdown || '';
		if (typeof r.markdown === 'string') return r.markdown;
		return '';
	}).filter(Boolean);
	if (texts.length === 0) return '';
	const perPageCap = Math.floor(budget / texts.length);
	return texts.map((t) => t.slice(0, perPageCap)).join('\n\n---\n\n');
}

async function runOrgNameExtraction(
	this: IExecuteFunctions,
	results: CrawlResult[],
	credentials: Crawl4aiApiCredentials,
	crawler: Crawl4aiClient,
	modelOverride: string | undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_itemIndex: number,
): Promise<{ officialName: string | null; confidence: 'high' | 'medium' | 'low' }> {
	const combinedText = combinePagesWithBudget(results);
	if (!combinedText) return { officialName: null, confidence: 'low' };

	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);
	const escaped = combinedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_itemIndex: number,
): Promise<Array<{ email: string; suggestedName?: string }>> {
	if (emails.length === 0) return [];

	const pageContent = combinePagesWithBudget(results);
	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);
	const emailListJson = JSON.stringify({ emails }, null, 2);
	const combined = `EMAILS TO ANNOTATE:\n${emailListJson}\n\nPAGE CONTENT:\n${pageContent}`;
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
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_itemIndex: number,
): Promise<string | null> {
	const combinedText = combinePagesWithBudget(results);
	if (!combinedText) return null;

	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);
	const escaped = combinedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const rawUrl = `raw:<pre>${escaped}</pre>`;

	const config: FullCrawlConfig = {
		extractionStrategy: createLlmExtractionStrategy(
			ABOUT_ORG_SCHEMA, instruction, provider, apiKey, baseUrl,
		),
	};

	try {
		const result = await crawler.crawlUrl(rawUrl, config);
		if (!result.success || !result.extracted_content) return null;
		const llmErr = checkLlmExtractionError(result);
		if (llmErr) return null;
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
	const combinedText = combinePagesWithBudget(results);
	if (!combinedText) return null;

	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);
	const escaped = combinedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const rawUrl = `raw:<pre>${escaped}</pre>`;

	const config: FullCrawlConfig = {
		extractionStrategy: createLlmExtractionStrategy(
			CUSTOM_EXTRACTION_SCHEMA, instruction, provider, apiKey, baseUrl,
		),
	};

	try {
		const result = await crawler.crawlUrl(rawUrl, config);
		if (!result.success || !result.extracted_content) {
			throw new NodeOperationError(
				this.getNode(),
				`Custom extraction failed: ${result.error_message || 'crawl request returned no content'}`,
				{ itemIndex },
			);
		}
		const llmErr = checkLlmExtractionError(result);
		if (llmErr) {
			throw new NodeOperationError(
				this.getNode(),
				`Custom extraction failed: ${llmErr}`,
				{ itemIndex },
			);
		}
		const parsed = JSON.parse(result.extracted_content) as unknown;
		const items = Array.isArray(parsed)
			? (parsed as IDataObject[]).filter((c) => !c.error)
			: parsed ? [parsed as IDataObject] : [];
		if (items.length === 0) return null;
		return (items[0].value as string) || null;
	} catch (err) {
		if (err instanceof NodeOperationError) throw err;
		throw new NodeOperationError(
			this.getNode(),
			`Custom extraction failed: ${(err as Error).message || 'unknown error'}`,
			{ itemIndex },
		);
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
		isPrimary: {
			type: 'boolean',
			description: 'true if this is the main or head office / primary registered address / HQ; false for branches, campuses, showrooms, satellite offices, or any secondary location. If only one location is found, set true.',
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
			description: 'Notable details about this location: opening hours, landmark, parking, or — when multiple locations exist — a brief note on how this one differs from others (e.g. "City campus; main suburban campus is in Chadstone"). Omit if none.',
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
					required: ['name', 'isPrimary', 'address1', 'city', 'country', 'confidence', 'sourceSnippet'],
				},
			},
		},
		required: ['locations'],
	} as IDataObject;
}

function buildLocationsInstruction(includePhones: boolean, pageUrl?: string): string {
	const urlContext = pageUrl ? `\n\nSource page: ${pageUrl}` : '';
	const phoneStep = includePhones
		? '\n5. Extract the phone number specific to this location (not a general/central number unless it is the only one).'
		: '';
	const emailStep = includePhones
		? '\n6. If email addresses are found in the same content block as this address, include them in the emails array. Do not include site-wide emails from page headers or navigation. Omit the field if none found.'
		: '\n5. If email addresses are found in the same content block as this address, include them in the emails array. Do not include site-wide emails from page headers or navigation. Omit the field if none found.';
	const isPrimaryStep = includePhones ? '\n7.' : '\n6.';
	const additionalNotesStep = includePhones ? '\n8.' : '\n7.';
	const phoneFewShot = includePhones ? ', "phone": "+61 3 9000 0000"' : '';
	return `You are a location data extractor. Find ALL physical locations (offices, branches, stores, showrooms, warehouses, headquarters, distributors, stockists, dealers) mentioned on this page.${urlContext}

For each location:
1. Extract address1 (street number + street name only, e.g. "200 Collins Street"), address2 (unit/level/floor/suite if present, e.g. "Level 12"), city, state, postcode, and country separately.
2. Assign a unique name: use the explicit label if present (e.g. "Melbourne Office", "Head Office"); if no label, derive one from city/suburb with a generic suffix — use Office, Location, or Branch (never Facility, Site, Plant, or similar industry-specific terms). Every name MUST be unique.
3. Assign confidence: "high" if address1 + postcode + city present; "medium" if missing postcode or state; "low" if city/country only.
4. Copy the exact verbatim text snippet (1–2 sentences) from the page that contains or supports the address into sourceSnippet.${phoneStep}${emailStep}${isPrimaryStep} Set isPrimary to true if this is the main or head office / primary registered address / HQ — the one a visitor or regulator would treat as the primary contact point. Set false for all branches, campuses, showrooms, or secondary locations. If only one location is found, set it to true.${additionalNotesStep} In additionalNotes, include: opening hours, landmark info, parking, or — when multiple locations exist — a brief distinguishing note (e.g. "City campus; main suburban campus is in Chadstone", "Head office; warehouse is in Dandenong"). Omit if nothing notable.

Include: offices, branches, stores, showrooms, warehouses, distribution centres, factories, partner/dealer/stockist locations (if an address is given).
Exclude: P.O. boxes, virtual offices, registered agent addresses, locations with no street address.
If no physical locations are found, return: {"locations": []}

Examples:

Input: "Our Melbourne office is at Level 12, 200 Collins Street, Melbourne VIC 3000. Head office."
Output: {"locations":[{"name":"Melbourne Office","isPrimary":true,"address1":"200 Collins Street","address2":"Level 12","city":"Melbourne","state":"VIC","postcode":"3000","country":"Australia","confidence":"high","sourceSnippet":"Our Melbourne office is at Level 12, 200 Collins Street, Melbourne VIC 3000."${phoneFewShot}}]}

Input: "Visit our Sydney showroom at 42 George Street, Sydney. Open weekdays 9–5."
Output: {"locations":[{"name":"Sydney Showroom","isPrimary":false,"address1":"42 George Street","city":"Sydney","country":"Australia","confidence":"medium","sourceSnippet":"Visit our Sydney showroom at 42 George Street, Sydney.","additionalNotes":"Open weekdays 9–5."}]}`;
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
	// isPrimary: true wins over false/undefined across the group
	if (group.some((loc) => loc.isPrimary === true)) best.isPrimary = true;
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
): Promise<{ primary: IDataObject[]; additional: IDataObject[] }> {
	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);
	const locationMap = new Map<string, IDataObject>();
	const errors: string[] = [];

	// Process pages sequentially — Crawl4AI LLM processing is not truly concurrent;
	// parallel page requests queue on the server and add scheduling overhead.
	for (const result of results) {
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

	const deduped = deduplicateLocations([...locationMap.values()]);

	// Single location is always primary regardless of LLM classification
	if (deduped.length === 1) deduped[0].isPrimary = true;

	// Strip internal classifier field; split into primary/additional
	const primary: IDataObject[] = [];
	const additional: IDataObject[] = [];
	for (const loc of deduped) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { isPrimary, ...rest } = loc as Record<string, unknown>;
		(isPrimary === true ? primary : additional).push(rest as IDataObject);
	}

	return { primary, additional };
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
		displayOptions: { show: { operation: ['extractData'] } },
	},
	{
		displayName: 'About Organisation',
		name: 'extractAboutOrg',
		type: 'boolean',
		default: false,
		description: 'Whether to generate a concise description of what the organisation does and who it serves. Requires LLM credentials.',
		displayOptions: { show: { operation: ['extractData'] } },
	},
	{
		displayName: 'About Organisation Prompt',
		name: 'aboutOrgPrompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: ABOUT_ORG_DEFAULT_PROMPT,
		description: 'Instructions for the LLM to generate the organisation description. Edit to adjust focus, length, or style.',
		displayOptions: { show: { operation: ['extractData'], extractAboutOrg: [true] } },
	},
	{
		displayName: 'Custom (LLM)',
		name: 'extractCustom',
		type: 'boolean',
		default: false,
		description: 'Whether to run a custom LLM extraction. Provide a field name for the output and instructions for what to extract. Requires LLM credentials.',
		displayOptions: { show: { operation: ['extractData'] } },
	},
	{
		displayName: 'Custom Field Name',
		name: 'customFieldName',
		type: 'string',
		required: true,
		default: 'customData',
		placeholder: 'productList',
		description: 'Key name used in the output JSON for the custom extracted value',
		displayOptions: { show: { operation: ['extractData'], extractCustom: [true] } },
	},
	{
		displayName: 'Custom Extraction Prompt',
		name: 'customPrompt',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		placeholder: 'Extract all product names and their prices',
		description: 'Instructions for the LLM describing what to extract from the page',
		displayOptions: { show: { operation: ['extractData'], extractCustom: [true] } },
	},
	{
		displayName: 'Email Addresses',
		name: 'extractEmails',
		type: 'boolean',
		default: false,
		description: 'Whether to extract email addresses. When LLM credentials are configured, each email is annotated with the associated person name or office label found in context.',
		displayOptions: { show: { operation: ['extractData'] } },
	},
	{
		displayName: 'Locations',
		name: 'extractLocations',
		type: 'boolean',
		default: false,
		description: 'Whether to extract all physical locations (offices, branches, stores) with addresses, phone numbers, and emails per location. Also returns global phone numbers and emails. Requires LLM credentials.',
		displayOptions: { show: { operation: ['extractData'] } },
	},
	{
		displayName: 'Official Org Name',
		name: 'extractOrgName',
		type: 'boolean',
		default: false,
		description: 'Whether to identify the official registered or trading name of the organisation. Requires LLM credentials.',
		displayOptions: { show: { operation: ['extractData'] } },
	},
	{
		displayName: 'Phone Numbers',
		name: 'extractPhones',
		type: 'boolean',
		default: false,
		description: 'Whether to extract all phone numbers found on the page',
		displayOptions: { show: { operation: ['extractData'] } },
	},
	{
		displayName: 'LLM credentials must be configured in Crawl4AI Plus credentials for: Official Org Name, Locations, About Organisation, and Custom (LLM) extractions. Email name annotation also uses LLM when available.',
		name: 'llmNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { operation: ['extractData'] } },
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
		displayOptions: { show: { operation: ['extractData'] } },
	},
	{
		displayName: 'Max Pages',
		name: 'maxPages',
		type: 'number',
		default: 10,
		description: 'Maximum number of pages to crawl',
		displayOptions: { show: { operation: ['extractData'], crawlScope: ['followLinks', 'fullSite'] } },
	},
	{
		displayName: 'Smart URL Selection',
		name: 'smartUrlSelection',
		type: 'boolean',
		default: false,
		description: 'Whether to use LLM to select the most relevant pages before crawling. Crawls the seed page first, extracts all links, then asks the LLM to pick the most relevant URLs. Requires LLM credentials.',
		displayOptions: { show: { operation: ['extractData'], crawlScope: ['followLinks', 'fullSite'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { operation: ['extractData'] } },
		options: [
			{
				displayName: 'Crawl Mode',
				name: 'crawlMode',
				type: 'options',
				options: [
					{
						name: 'Standard',
						value: 'standard',
						description: 'For most websites — 60 s timeout, simulate user, remove consent popups',
					},
					{
						name: 'Anti-Bot (Cloudflare)',
						value: 'antiBotCloudflare',
						description: 'For Cloudflare-protected sites — patchright browser, stealth + magic mode, 120 s timeout',
					},
				],
				default: 'standard',
				description: 'Choose Standard for most sites; Anti-Bot for Cloudflare or bot-protected sites',
			},
			{
				displayName: 'Exclude URL Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: '*/admin/*,*/login/*',
				description: 'Comma-separated URL patterns to exclude from crawling (only for multi-page)',
				displayOptions: {
					show: {
						'/crawlScope': ['followLinks', 'fullSite'],
					},
				},
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
			const rawUrl = this.getNodeParameter('url', i, '') as string;
			const crawlScope = this.getNodeParameter('crawlScope', i, 'singlePage') as string;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const smartUrlSelection = this.getNodeParameter('smartUrlSelection', i, false) as boolean;
			const maxPages = this.getNodeParameter('maxPages', i, 10) as number;

			const extractOrgName = this.getNodeParameter('extractOrgName', i, false) as boolean;
			const extractPhones = this.getNodeParameter('extractPhones', i, false) as boolean;
			const extractEmails = this.getNodeParameter('extractEmails', i, false) as boolean;
			const extractLocations = this.getNodeParameter('extractLocations', i, false) as boolean;
			const extractAboutOrg = this.getNodeParameter('extractAboutOrg', i, false) as boolean;
			const extractCustom = this.getNodeParameter('extractCustom', i, false) as boolean;

			const aboutOrgPrompt = extractAboutOrg
				? ((this.getNodeParameter('aboutOrgPrompt', i, ABOUT_ORG_DEFAULT_PROMPT) as string) || ABOUT_ORG_DEFAULT_PROMPT)
				: '';
			const customFieldName = extractCustom
				? ((this.getNodeParameter('customFieldName', i, 'customData') as string) || 'customData')
				: '';
			const customPrompt = extractCustom
				? (this.getNodeParameter('customPrompt', i, '') as string)
				: '';

			if (extractCustom && RESERVED_DATA_KEYS.has(customFieldName)) {
				throw new NodeOperationError(
					this.getNode(),
					`Custom Field Name "${customFieldName}" conflicts with a built-in extraction key (${[...RESERVED_DATA_KEYS].join(', ')}). Choose a different name.`,
					{ itemIndex: i },
				);
			}

			if (!extractOrgName && !extractPhones && !extractEmails && !extractLocations && !extractAboutOrg && !extractCustom) {
				throw new NodeOperationError(
					this.getNode(),
					'Select at least one data type to extract.',
					{ itemIndex: i },
				);
			}

			if (extractCustom && !customPrompt) {
				throw new NodeOperationError(
					this.getNode(),
					'Custom Extraction Prompt cannot be empty.',
					{ itemIndex: i },
				);
			}

			const url = assertValidHttpUrl(rawUrl, this.getNode(), i);

			// Validate LLM credentials upfront for features that require them
			const needsLlm = extractOrgName || extractLocations || extractAboutOrg || extractCustom;
			if (needsLlm) {
				try {
					validateLlmCredentials(credentials, 'This extraction type');
				} catch (err) {
					throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
				}
			}

			if (smartUrlSelection === true && crawlScope !== 'singlePage') {
				try {
					validateLlmCredentials(credentials, 'Smart URL selection');
				} catch (err) {
					throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
				}
			}

			const crawlMode = (options.crawlMode as string) || 'standard';
			const config: FullCrawlConfig = {
				...getSimpleDefaults(),
				cacheMode: 'ENABLED',
			};

			if (crawlMode === 'antiBotCloudflare') {
				config.headless = false;
				config.enable_stealth = true;
				config.chrome_channel = 'patchright';
				config.pageTimeout = 120000;
				config.simulateUser = true;
				config.magic = true;
				config.removeConsentPopups = true;
			} else {
				config.pageTimeout = 60000;
				config.simulateUser = true;
				config.removeConsentPopups = true;
			}

			const modelOverride = undefined;
			const defaultCountry = 'AU';
			const useSmartUrlSelection = smartUrlSelection === true && crawlScope !== 'singlePage';

			// Build combined smart URL context from all enabled extraction types
			const contextParts: string[] = [];
			if (extractPhones || extractEmails || extractLocations) contextParts.push('email addresses and phone numbers');
			if (extractLocations) contextParts.push('physical addresses, offices, branches, and store locations');
			if (extractOrgName) contextParts.push('official organisation name');
			if (extractAboutOrg) contextParts.push('organisation description and services offered');
			if (extractCustom) contextParts.push(customPrompt);
			const extractionContext = contextParts.join('; ') || 'relevant content';

			// Use location keywords when locations extraction is enabled
			const keywords = extractLocations ? LOCATION_QUERY_KEYWORDS : undefined;

			let results: CrawlResult[];
			let smartUrlMeta: SmartUrlSelectionMeta | undefined;

			if (useSmartUrlSelection) {
				const exploreDepth = Math.max(1, Math.min(3, Number(options.exploreDepth ?? 1)));
				const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride || undefined);
				const smartResult = await executeSmartUrlCrawl(
					client,
					url,
					config,
					{
						maxPages: maxPages ?? 10,
						excludePatterns: options.excludePatterns as string | undefined,
					},
					{
						extractionContext,
						exploreDepth,
						provider,
						apiKey,
						baseUrl,
						keywords,
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
						keywords,
					},
				);
			}

			const data: IDataObject = {};

			// Regex-based contact extraction — sync, no I/O, must run before email annotation
			const needsGlobalContacts = extractPhones || extractEmails || extractLocations;
			let globalEmails: string[] = [];
			let globalPhones: string[] = [];
			if (needsGlobalContacts) {
				const contacts = extractContactInfo(results, defaultCountry);
				globalEmails = contacts.emails;
				globalPhones = contacts.phones;
			}
			if (extractPhones || extractLocations) data.phones = globalPhones;

			// LLM availability check for email annotation (fast, no I/O)
			let hasLlmForEmail = false;
			if (extractEmails || extractLocations) {
				try {
					validateLlmCredentials(credentials, 'Email name suggestion');
					hasLlmForEmail = true;
				} catch { /* no LLM — use plain email list */ }
				// Set plain fallback immediately; overwritten below if LLM annotation succeeds
				data.emails = globalEmails.map((email) => ({ email }));
			}

			// All LLM calls run in parallel — they are independent of each other
			const isZeroUrlFallback = smartUrlMeta?.warnings.some(
				(w) => w.startsWith('LLM returned no candidate URLs'),
			) ?? false;

			const llmTasks: Promise<void>[] = [];

			if (extractOrgName) {
				llmTasks.push(
					runOrgNameExtraction.call(this, results, credentials, client, modelOverride || undefined, i)
						.then((r) => {
							data.orgName = r.officialName;
							if (r.officialName) data.orgNameConfidence = r.confidence;
						}),
				);
			}

			if ((extractEmails || extractLocations) && hasLlmForEmail && globalEmails.length > 0) {
				llmTasks.push(
					runEmailNameSuggestion.call(this, globalEmails, results, credentials, client, modelOverride || undefined, i)
						.then((r) => { data.emails = r; }),
				);
			}

			if (extractLocations) {
				const locationsTask = isZeroUrlFallback
					? runLocationsExtraction.call(this, results, credentials, client, modelOverride || undefined, true, i)
						.catch((err: Error) => {
							if (smartUrlMeta) smartUrlMeta.warnings.push(`Locations extraction error: ${err.message}`);
							return { primary: [], additional: [] } as { primary: IDataObject[]; additional: IDataObject[] };
						})
					: runLocationsExtraction.call(this, results, credentials, client, modelOverride || undefined, true, i);
				llmTasks.push(locationsTask.then((r) => { data.locations = r; }));
			}

			if (extractAboutOrg) {
				llmTasks.push(
					runAboutOrgExtraction.call(this, results, credentials, client, modelOverride || undefined, aboutOrgPrompt, i)
						.then((r) => { data.aboutOrg = r; }),
				);
			}

			if (extractCustom) {
				llmTasks.push(
					runCustomExtraction.call(this, results, credentials, client, modelOverride || undefined, customPrompt, i)
						.then((r) => { data[customFieldName] = r; }),
				);
			}

			await Promise.all(llmTasks);

			// Build extractionType label from enabled booleans for output metadata
			const typeLabels: string[] = [];
			if (extractOrgName) typeLabels.push('orgName');
			if (extractPhones) typeLabels.push('phones');
			if (extractEmails) typeLabels.push('emails');
			if (extractLocations) typeLabels.push('locations');
			if (extractAboutOrg) typeLabels.push('aboutOrg');
			if (extractCustom) typeLabels.push(customFieldName || 'custom');
			const extractionType = typeLabels.join('+');

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
