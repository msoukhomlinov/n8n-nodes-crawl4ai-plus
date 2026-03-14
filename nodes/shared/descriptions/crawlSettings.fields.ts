import { INodeProperties } from 'n8n-workflow';

/**
 * Returns a "Crawl Settings" collection with fields matching
 * what createCrawlerRunConfig() in shared/utils.ts expects.
 *
 * @param operations - operation values for which this collection is shown
 */
export function getCrawlSettingsFields(operations: string[]): INodeProperties[] {
	return [
		{
			displayName: 'Crawl Settings',
			name: 'crawlSettings',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			displayOptions: {
				show: {
					operation: operations,
				},
			},
			options: [
				// --- Anti-Bot: Magic Mode ---
				{
					displayName: 'Anti-Bot: Magic Mode',
					name: 'magic',
					type: 'boolean',
					default: false,
					description: 'Whether to enable magic mode for automatic anti-bot handling',
				},
				// --- Anti-Bot: Override Navigator ---
				{
					displayName: 'Anti-Bot: Override Navigator',
					name: 'overrideNavigator',
					type: 'boolean',
					default: false,
					description: 'Whether to override navigator properties to avoid bot detection',
				},
				// --- Anti-Bot: Simulate User ---
				{
					displayName: 'Anti-Bot: Simulate User',
					name: 'simulateUser',
					type: 'boolean',
					default: false,
					description: 'Whether to simulate realistic user behavior (mouse movements, scrolling)',
				},
				// --- Cache Mode ---
				{
					displayName: 'Cache Mode',
					name: 'cacheMode',
					type: 'options',
					options: [
						{ name: 'Enabled', value: 'ENABLED', description: 'Use cache for reads and writes' },
						{ name: 'Bypass', value: 'BYPASS', description: 'Skip cache entirely' },
						{ name: 'Disabled', value: 'DISABLED', description: 'Disable caching completely' },
						{ name: 'Read Only', value: 'READ_ONLY', description: 'Read from cache but do not write' },
						{ name: 'Write Only', value: 'WRITE_ONLY', description: 'Write to cache but do not read' },
					],
					default: 'ENABLED',
					description: 'How the crawl cache should behave',
				},
				// --- Check Robots.txt ---
				{
					displayName: 'Check Robots.txt',
					name: 'checkRobotsTxt',
					type: 'boolean',
					default: false,
					description: 'Whether to respect robots.txt rules for the target site',
				},
				// --- CSS Selector ---
				{
					displayName: 'CSS Selector',
					name: 'cssSelector',
					type: 'string',
					default: '',
					placeholder: 'article.main-content',
					description: 'CSS selector to limit content extraction to a specific page region',
				},
				// --- Delay Before Return (ms) ---
				{
					displayName: 'Delay Before Return (ms)',
					name: 'delayBeforeReturnHtml',
					type: 'number',
					default: 0,
					description: 'Milliseconds to wait after page load before returning HTML',
				},
				// --- Exclude External Links ---
				{
					displayName: 'Exclude External Links',
					name: 'excludeExternalLinks',
					type: 'boolean',
					default: false,
					description: 'Whether to exclude links to external domains from the output',
				},
				// --- Excluded Tags ---
				{
					displayName: 'Excluded Tags',
					name: 'excludedTags',
					type: 'string',
					default: '',
					placeholder: 'nav, footer, aside',
					description: 'Comma-separated HTML tags to exclude from content extraction',
				},
				// --- JavaScript Code ---
				{
					displayName: 'JavaScript Code',
					name: 'jsCode',
					type: 'string',
					typeOptions: {
						rows: 4,
					},
					default: '',
					placeholder: 'document.querySelector(".load-more").click();',
					description: 'JavaScript code to execute on the page before extraction',
				},
				// --- JS Only Mode ---
				{
					displayName: 'JS Only Mode',
					name: 'jsOnly',
					type: 'boolean',
					default: false,
					description: 'Whether to only execute JavaScript without re-fetching the page (requires an active session)',
				},
				// --- Max Retries ---
				{
					displayName: 'Max Retries',
					name: 'maxRetries',
					type: 'number',
					default: 0,
					description: 'Maximum number of retry attempts if the crawl fails',
				},
				// --- Preserve HTTPS for Internal Links ---
				{
					displayName: 'Preserve HTTPS for Internal Links',
					name: 'preserveHttpsForInternalLinks',
					type: 'boolean',
					default: false,
					description: 'Whether to keep the HTTPS scheme for internal links instead of stripping it',
				},
				// --- Wait For ---
				{
					displayName: 'Wait For',
					name: 'waitFor',
					type: 'string',
					default: '',
					placeholder: '.content-loaded or js:() => document.readyState === "complete"',
					description: 'CSS selector or JS expression (prefixed with js:) to wait for before extracting content',
				},
				// --- Wait Until ---
				{
					displayName: 'Wait Until',
					name: 'waitUntil',
					type: 'options',
					options: [
						{ name: 'Load', value: 'load', description: 'Wait for the load event' },
						{ name: 'DOM Content Loaded', value: 'domcontentloaded', description: 'Wait for DOMContentLoaded event' },
						{ name: 'Network Idle', value: 'networkidle', description: 'Wait until no network connections for 500ms' },
						{ name: 'Commit', value: 'commit', description: 'Wait for first response byte' },
					],
					default: 'load',
					description: 'Navigation event to wait for before considering the page loaded',
				},
				// --- Word Count Threshold ---
				{
					displayName: 'Word Count Threshold',
					name: 'wordCountThreshold',
					type: 'number',
					default: 0,
					description: 'Minimum number of words a content block must have to be included (0 = no threshold)',
				},
			],
		},
	];
}
