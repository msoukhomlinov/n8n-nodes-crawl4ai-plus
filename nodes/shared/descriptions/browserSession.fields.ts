import { INodeProperties } from 'n8n-workflow';

/**
 * Returns a "Browser & Session" collection with fields matching
 * what createBrowserConfig() in shared/utils.ts expects.
 *
 * @param operations - operation values for which this collection is shown
 */
export function getBrowserSessionFields(operations: string[]): INodeProperties[] {
	return [
		{
			displayName: 'Browser & Session',
			name: 'browserSession',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			displayOptions: {
				show: {
					operation: operations,
				},
			},
			options: [
				// --- Browser Type ---
				{
					displayName: 'Browser Profile',
					name: 'browserProfile',
					type: 'options',
					options: [
						{ name: 'Chrome (Android)', value: 'chrome_android' },
						{ name: 'Chrome (Linux)', value: 'chrome_linux' },
						{ name: 'Chrome (macOS)', value: 'chrome_macos' },
						{ name: 'Chrome (Windows)', value: 'chrome_windows' },
						{ name: 'Edge (Windows)', value: 'edge_windows' },
						{ name: 'Firefox (macOS)', value: 'firefox_macos' },
						{ name: 'Firefox (Windows)', value: 'firefox_windows' },
						{ name: 'Googlebot', value: 'googlebot' },
						{ name: 'None', value: 'none' },
						{ name: 'Safari (iOS)', value: 'safari_ios' },
						{ name: 'Safari (macOS)', value: 'safari_macos' },
					],
					default: 'none',
					description: 'Preset browser headers (User-Agent, Accept, sec-ch-ua, etc.) to send with requests. Helps bypass server-side bot detection. Custom headers in the Headers field override profile values.',
				},
				{
					displayName: 'Browser Type',
					name: 'browserType',
					type: 'options',
					options: [
						{ name: 'Chromium', value: 'chromium' },
						{ name: 'Firefox', value: 'firefox' },
						{ name: 'WebKit', value: 'webkit' },
					],
					default: 'chromium',
					description: 'Which browser engine to use',
				},
				// --- Cookies ---
				{
					displayName: 'Cookies',
					name: 'cookies',
					type: 'json',
					default: '',
					placeholder: '[{"name":"sid","value":"abc","domain":".example.com"}]',
					description: 'JSON array of cookie objects to inject into the browser',
				},
				// --- Enable JavaScript ---
				{
					displayName: 'Enable JavaScript',
					name: 'javaScriptEnabled',
					type: 'boolean',
					default: true,
					description: 'Whether to enable JavaScript execution in the browser',
				},
				// --- Enable Stealth Mode ---
				{
					displayName: 'Enable Stealth Mode',
					name: 'enableStealth',
					type: 'boolean',
					default: false,
					description: 'Whether to enable stealth mode to avoid bot detection',
				},
				// --- Extra Browser Args ---
				{
					displayName: 'Extra Browser Args',
					name: 'extraArgs',
					type: 'string',
					typeOptions: {
						rows: 4,
					},
					default: '',
					placeholder: '--disable-gpu\n--no-sandbox',
					description: 'Additional browser launch arguments, one per line',
				},
				// --- Headers ---
				{
					displayName: 'Headers',
					name: 'headers',
					type: 'json',
					default: '',
					placeholder: '{"Authorization":"Bearer token","Accept-Language":"en-US"}',
					description: 'Custom HTTP headers to send with browser requests (JSON object)',
				},
				// --- Headless Mode ---
				{
					displayName: 'Headless Mode',
					name: 'headless',
					type: 'boolean',
					default: true,
					description: 'Whether to run the browser in headless mode',
				},
				// --- Ignore HTTPS Errors ---
				{
					displayName: 'Ignore HTTPS Errors',
					name: 'ignoreHttpsErrors',
					type: 'boolean',
					default: false,
					description: 'Whether to ignore HTTPS certificate errors (useful for self-signed certs)',
				},
				// --- Init Scripts ---
				{
					displayName: 'Init Scripts',
					name: 'initScripts',
					type: 'string',
					typeOptions: {
						rows: 4,
					},
					default: '',
					placeholder: 'Object.defineProperty(navigator, "webdriver", {get: () => false})',
					description: 'JavaScript code to inject before page load, one script per line',
				},
				// --- Light Mode ---
				{
					displayName: 'Light Mode',
					name: 'lightMode',
					type: 'boolean',
					default: false,
					description: 'Whether to enable light mode for faster page loading (disables images and heavy resources)',
				},
				// --- Proxy Config ---
				{
					displayName: 'Proxy Config',
					name: 'proxyConfig',
					type: 'json',
					default: '',
					placeholder: '{"server":"http://proxy:8080","username":"user","password":"pass"}',
					description: 'Proxy configuration with server URL and optional authentication',
				},
				// --- Session ID ---
				{
					displayName: 'Session ID',
					name: 'sessionId',
					type: 'string',
					default: '',
					placeholder: 'my-session-1',
					description: 'Session identifier for maintaining browser state across crawls',
				},
				// --- Storage State ---
				{
					displayName: 'Storage State',
					name: 'storageState',
					type: 'json',
					default: '',
					placeholder: '{"cookies":[],"origins":[]}',
					description: 'Browser storage state (cookies, localStorage) as JSON',
				},
				// --- Text Mode ---
				{
					displayName: 'Text Mode',
					name: 'textMode',
					type: 'boolean',
					default: false,
					description: 'Whether to enable text-only mode (no images, styles, or scripts loaded)',
				},
				// --- Timeout ---
				{
					displayName: 'Timeout',
					name: 'timeout',
					type: 'number',
					default: 30000,
					description: 'Page load timeout in milliseconds',
				},
				// --- Use Managed Browser ---
				{
					displayName: 'Use Managed Browser',
					name: 'useManagedBrowser',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							usePersistentContext: [true],
						},
					},
					description: 'Whether to use the managed browser instance (requires persistent context)',
				},
				// --- Use Persistent Context ---
				{
					displayName: 'Use Persistent Context',
					name: 'usePersistentContext',
					type: 'boolean',
					default: false,
					description: 'Whether to use a persistent browser context that retains data between sessions',
				},
				// --- User Agent ---
				{
					displayName: 'User Agent',
					name: 'userAgent',
					type: 'string',
					default: '',
					placeholder: 'Mozilla/5.0 ...',
					description: 'Custom user agent string to use for requests',
				},
				// --- User Data Dir ---
				{
					displayName: 'User Data Dir',
					name: 'userDataDir',
					type: 'string',
					default: '',
					placeholder: '/tmp/browser-data',
					displayOptions: {
						show: {
							usePersistentContext: [true],
						},
					},
					description: 'Directory to store persistent browser data (requires persistent context)',
				},
				// --- Viewport Height ---
				{
					displayName: 'Viewport Height',
					name: 'viewportHeight',
					type: 'number',
					default: 800,
					description: 'Browser viewport height in pixels',
				},
				// --- Viewport Width ---
				{
					displayName: 'Viewport Width',
					name: 'viewportWidth',
					type: 'number',
					default: 1280,
					description: 'Browser viewport width in pixels',
				},
			],
		},
	];
}
