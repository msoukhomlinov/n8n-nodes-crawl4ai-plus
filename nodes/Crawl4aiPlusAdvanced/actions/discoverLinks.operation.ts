import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, FullCrawlConfig, Link } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createCrawlerRunConfig,
	isValidUrl,
	normalizeUrlProtocol,
} from '../../shared/utils';
import {
	urlField,
	getBrowserSessionFields,
} from '../../shared/descriptions';
import { checkSuspiciousUrl } from '../../shared/urlSafety';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		...urlField,
		description: 'The URL to discover links from',
		displayOptions: {
			show: {
				operation: ['discoverLinks'],
			},
		},
	},
	{
		displayName: 'Link Types',
		name: 'linkTypes',
		type: 'multiOptions',
		options: [
			{
				name: 'Internal Links',
				value: 'internal',
				description: 'Links pointing to the same domain',
			},
			{
				name: 'External Links',
				value: 'external',
				description: 'Links pointing to other domains',
			},
		],
		default: ['internal', 'external'],
		description: 'Which types of links to extract',
		displayOptions: {
			show: {
				operation: ['discoverLinks'],
			},
		},
	},
	{
		displayName: 'Filter Options',
		name: 'filterOptions',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: {
			show: {
				operation: ['discoverLinks'],
			},
		},
		options: [
			{
				displayName: 'Exclude File Types',
				name: 'excludeFileTypes',
				type: 'string',
				default: '',
				placeholder: 'pdf, jpg, png, zip',
				description: 'Exclude links to files with these extensions (comma-separated)',
			},
			{
				displayName: 'Exclude Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: '*/login/*, */admin/*, *.pdf',
				description: 'Exclude URLs matching these patterns (comma-separated, wildcards supported)',
			},
			{
				displayName: 'Exclude Social Media',
				name: 'excludeSocialMedia',
				type: 'boolean',
				default: false,
				description: 'Whether to exclude links to social media platforms',
			},
			{
				displayName: 'Flag Suspicious URLs',
				name: 'flagSuspiciousUrls',
				type: 'boolean',
				default: false,
				description: 'Whether to annotate links that match suspicious URL patterns with a suspicious flag in the output',
			},
			{
				displayName: 'Include Patterns',
				name: 'includePatterns',
				type: 'string',
				default: '',
				placeholder: '*/products/*, */blog/*',
				description: 'Only include URLs matching these patterns (comma-separated, wildcards supported)',
			},
			{
				displayName: 'Require Text',
				name: 'requireText',
				type: 'boolean',
				default: false,
				description: 'Whether to only include links that have visible anchor text',
			},
			{
				displayName: 'Suspicious URL Patterns',
				name: 'suspiciousPatterns',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				placeholder: '*-HP, */trap/*, */canary/*',
				description: 'Comma-separated or newline-separated URL patterns that should be flagged as suspicious. Supports * wildcards.',
				displayOptions: {
					show: {
						flagSuspiciousUrls: [true],
					},
				},
			},
		],
	},
	{
		displayName: 'Output Options',
		name: 'outputOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['discoverLinks'],
			},
		},
		options: [
			{
				displayName: 'Deduplicate',
				name: 'deduplicate',
				type: 'boolean',
				default: true,
				description: 'Whether to remove duplicate URLs from the output',
			},
			{
				displayName: 'Include Metadata',
				name: 'includeMetadata',
				type: 'boolean',
				default: true,
				description: 'Whether to include link text and title attributes in output',
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				options: [
					{
						name: 'Grouped (Single Item)',
						value: 'grouped',
						description: 'Return all links in a single output item with internal/external arrays',
					},
					{
						name: 'Split (Multiple Items)',
						value: 'split',
						description: 'Return each link as a separate output item',
					},
				],
				default: 'grouped',
				description: 'How to format the output',
			},
			{
				displayName: 'Score Links',
				name: 'scoreLinks',
				type: 'boolean',
				default: true,
				description: 'Whether to compute a relevance score for each discovered link',
			},
		],
	},
	...getBrowserSessionFields(['discoverLinks']),
];

// --- Social Media Domains ---
const SOCIAL_MEDIA_DOMAINS = [
	'facebook.com', 'fb.com', 'fb.me',
	'twitter.com', 'x.com', 't.co',
	'linkedin.com', 'lnkd.in',
	'instagram.com', 'instagr.am',
	'youtube.com', 'youtu.be',
	'tiktok.com',
	'pinterest.com', 'pin.it',
	'reddit.com', 'redd.it',
	'tumblr.com',
	'snapchat.com',
	'whatsapp.com', 'wa.me',
	'telegram.org', 't.me',
	'discord.com', 'discord.gg',
	'twitch.tv',
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
			const linkTypes = this.getNodeParameter('linkTypes', i, ['internal', 'external']) as string[];
			const filterOptions = this.getNodeParameter('filterOptions', i, {}) as IDataObject;
			const outputOptions = this.getNodeParameter('outputOptions', i, {}) as IDataObject;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}

			if (!isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
			}

			if (!linkTypes || linkTypes.length === 0) {
				throw new NodeOperationError(this.getNode(), 'At least one link type must be selected.', { itemIndex: i });
			}

			// Build config using shared browser session collection.
			// discoverLinks intentionally does not expose Crawl Settings to keep the UI
			// focused on link discovery. Cache mode is hardcoded to ENABLED for performance
			// since re-fetching the same page is unnecessary for link extraction.
			const config: FullCrawlConfig = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig({
					cacheMode: 'ENABLED',
					scoreLinks: outputOptions.scoreLinks !== false,
				}),
			};

			const result = await crawler.crawlUrl(url, config);

			if (!result.success) {
				throw new NodeOperationError(
					this.getNode(),
					`Failed to crawl URL: ${result.error_message || 'Unknown error'}`,
					{ itemIndex: i },
				);
			}

			// Extract and process links
			const internalLinks: Link[] = result.links?.internal || [];
			const externalLinks: Link[] = result.links?.external || [];

			// Parse filter options
			const includePatterns = parsePatterns(filterOptions.includePatterns as string);
			const excludePatterns = parsePatterns(filterOptions.excludePatterns as string);
			const excludeFileTypes = parseFileTypes(filterOptions.excludeFileTypes as string);
			const excludeSocialMedia = filterOptions.excludeSocialMedia === true;
			const requireText = filterOptions.requireText === true;
			const flagSuspiciousUrls = filterOptions.flagSuspiciousUrls === true;
			const suspiciousPatterns = flagSuspiciousUrls
				? parseSuspiciousPatterns(filterOptions.suspiciousPatterns as string)
				: [];
			const deduplicate = outputOptions.deduplicate !== false;
			const includeMetadata = outputOptions.includeMetadata !== false;

			let processedInternal: Link[] = [];
			let processedExternal: Link[] = [];

			if (linkTypes.includes('internal')) {
				processedInternal = filterLinks(internalLinks, {
					includePatterns,
					excludePatterns,
					excludeFileTypes,
					excludeSocialMedia,
					requireText,
				});
			}

			if (linkTypes.includes('external')) {
				processedExternal = filterLinks(externalLinks, {
					includePatterns,
					excludePatterns,
					excludeFileTypes,
					excludeSocialMedia,
					requireText,
				});
			}

			if (deduplicate) {
				processedInternal = deduplicateLinks(processedInternal);
				processedExternal = deduplicateLinks(processedExternal);
			}

			const outputFormat = outputOptions.outputFormat || 'grouped';

			if (outputFormat === 'split') {
				const allLinks = [
					...processedInternal.map((link) => ({ ...link, type: 'internal' })),
					...processedExternal.map((link) => ({ ...link, type: 'external' })),
				];

				for (const link of allLinks) {
					const suspicion = flagSuspiciousUrls ? checkSuspiciousUrl(link.href, suspiciousPatterns) : null;

					const linkOutput: IDataObject = {
						url: link.href,
						type: link.type,
						sourceUrl: url,
					};

					if (includeMetadata) {
						linkOutput.text = link.text || '';
						linkOutput.title = link.title || '';
					}

					if (suspicion !== null) {
						linkOutput.suspicious = suspicion.suspicious;
						if (suspicion.reason) linkOutput.suspicionReason = suspicion.reason;
					}

					allResults.push({
						json: linkOutput,
						pairedItem: { item: i },
					});
				}

				if (allLinks.length === 0) {
					allResults.push({
						json: {
							sourceUrl: url,
							message: 'No links found matching the specified criteria',
							internalCount: 0,
							externalCount: 0,
						},
						pairedItem: { item: i },
					});
				}
			} else {
				const formattedInternal = processedInternal.map((link) => {
					const suspicion = flagSuspiciousUrls ? checkSuspiciousUrl(link.href, suspiciousPatterns) : null;
					const output: IDataObject = { href: link.href };
					if (includeMetadata) {
						output.text = link.text || '';
						output.title = link.title || '';
					}
					if (suspicion !== null) {
						output.suspicious = suspicion.suspicious;
						if (suspicion.reason) output.suspicionReason = suspicion.reason;
					}
					return output;
				});

				const formattedExternal = processedExternal.map((link) => {
					const suspicion = flagSuspiciousUrls ? checkSuspiciousUrl(link.href, suspiciousPatterns) : null;
					const output: IDataObject = { href: link.href };
					if (includeMetadata) {
						output.text = link.text || '';
						output.title = link.title || '';
					}
					if (suspicion !== null) {
						output.suspicious = suspicion.suspicious;
						if (suspicion.reason) output.suspicionReason = suspicion.reason;
					}
					return output;
				});

				const suspiciousCount = flagSuspiciousUrls
					? [...formattedInternal, ...formattedExternal].filter((l) => l.suspicious === true).length
					: undefined;

				allResults.push({
					json: {
						url,
						success: true,
						internalLinks: formattedInternal,
						externalLinks: formattedExternal,
						totalInternal: formattedInternal.length,
						totalExternal: formattedExternal.length,
						totalLinks: formattedInternal.length + formattedExternal.length,
						...(suspiciousCount !== undefined ? { suspiciousCount } : {}),
					},
					pairedItem: { item: i },
				});
			}
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

// --- Helper Functions ---

interface FilterOpts {
	includePatterns: RegExp[];
	excludePatterns: RegExp[];
	excludeFileTypes: string[];
	excludeSocialMedia: boolean;
	requireText: boolean;
}

function parsePatterns(patternStr: string | undefined): RegExp[] {
	if (!patternStr || typeof patternStr !== 'string') return [];

	return patternStr
		.split(',')
		.map((p) => p.trim())
		.filter((p) => p.length > 0)
		.map((p) => {
			const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
			const regexStr = escaped.replace(/\*/g, '.*');
			return new RegExp(regexStr, 'i');
		});
}

function parseFileTypes(fileTypesStr: string | undefined): string[] {
	if (!fileTypesStr || typeof fileTypesStr !== 'string') return [];

	return fileTypesStr
		.split(',')
		.map((t) => t.trim().toLowerCase())
		.filter((t) => t.length > 0)
		.map((t) => (t.startsWith('.') ? t : `.${t}`));
}

function filterLinks(links: Link[], options: FilterOpts): Link[] {
	return links.filter((link) => {
		const href = link.href || '';

		if (options.includePatterns.length > 0) {
			const matchesInclude = options.includePatterns.some((pattern) => pattern.test(href));
			if (!matchesInclude) return false;
		}

		if (options.excludePatterns.length > 0) {
			const matchesExclude = options.excludePatterns.some((pattern) => pattern.test(href));
			if (matchesExclude) return false;
		}

		if (options.excludeFileTypes.length > 0) {
			const lowerHref = href.toLowerCase();
			const matchesFileType = options.excludeFileTypes.some((ext) => lowerHref.endsWith(ext));
			if (matchesFileType) return false;
		}

		if (options.excludeSocialMedia) {
			try {
				const urlObj = new URL(href);
				const domain = urlObj.hostname.toLowerCase();
				const isSocialMedia = SOCIAL_MEDIA_DOMAINS.some(
					(sm) => domain === sm || domain.endsWith(`.${sm}`),
				);
				if (isSocialMedia) return false;
			} catch {
				// Invalid URL, skip social media check
			}
		}

		if (options.requireText) {
			const text = (link.text || '').trim();
			if (!text) return false;
		}

		return true;
	});
}

function deduplicateLinks(links: Link[]): Link[] {
	const seen = new Set<string>();
	return links.filter((link) => {
		const normalizedHref = normalizeUrl(link.href);
		if (seen.has(normalizedHref)) return false;
		seen.add(normalizedHref);
		return true;
	});
}

function parseSuspiciousPatterns(raw: string | undefined): string[] {
	if (!raw) return [];
	return raw
		.split(/[\n,]/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
}

function normalizeUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		let normalized = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
		if (normalized.endsWith('/') && urlObj.pathname !== '/') {
			normalized = normalized.slice(0, -1);
		}
		if (urlObj.search) {
			normalized += urlObj.search;
		}
		return normalized.toLowerCase();
	} catch {
		return url.toLowerCase();
	}
}
