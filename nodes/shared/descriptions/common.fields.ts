import { INodeProperties } from 'n8n-workflow';

/**
 * Single URL input field
 */
export const urlField: INodeProperties = {
	displayName: 'URL',
	name: 'url',
	type: 'string',
	default: '',
	required: true,
	placeholder: 'https://example.com',
	description: 'The URL to crawl',
};

/**
 * Multiple URLs input field (one per line)
 */
export const urlsField: INodeProperties = {
	displayName: 'URLs',
	name: 'urls',
	type: 'string',
	typeOptions: {
		rows: 5,
	},
	default: '',
	required: true,
	placeholder: 'https://example.com\nhttps://example.org',
	description: 'URLs to crawl, one per line',
};

/**
 * Crawl scope selector (single page, follow links, or full site)
 */
export const crawlScopeField: INodeProperties = {
	displayName: 'Crawl Scope',
	name: 'crawlScope',
	type: 'options',
	options: [
		{
			name: 'Single Page',
			value: 'singlePage',
			description: 'Crawl only the specified URL',
		},
		{
			name: 'Follow Links',
			value: 'followLinks',
			description: 'Follow and crawl discovered links',
		},
		{
			name: 'Full Site',
			value: 'fullSite',
			description: 'Crawl the entire site recursively',
		},
	],
	default: 'singlePage',
	description: 'How extensively to crawl from the starting URL',
};

/**
 * Cache mode selector
 */
export const cacheModeField: INodeProperties = {
	displayName: 'Cache Mode',
	name: 'cacheMode',
	type: 'options',
	options: [
		{
			name: 'Bypass',
			value: 'BYPASS',
			description: 'Skip cache entirely',
		},
		{
			name: 'Disabled',
			value: 'DISABLED',
			description: 'Disable caching completely',
		},
		{
			name: 'Enabled',
			value: 'ENABLED',
			description: 'Use cache for reads and writes',
		},
		{
			name: 'Read Only',
			value: 'READ_ONLY',
			description: 'Read from cache but do not write',
		},
		{
			name: 'Write Only',
			value: 'WRITE_ONLY',
			description: 'Write to cache but do not read',
		},
	],
	default: 'ENABLED',
	description: 'How the crawl cache should behave',
};

/**
 * Wait-for field (CSS selector or JS expression)
 */
export const waitForField: INodeProperties = {
	displayName: 'Wait For',
	name: 'waitFor',
	type: 'string',
	default: '',
	placeholder: '.content-loaded or js:() => document.readyState === "complete"',
	description: 'CSS selector or JS expression (prefixed with js:) to wait for before extracting content',
};
