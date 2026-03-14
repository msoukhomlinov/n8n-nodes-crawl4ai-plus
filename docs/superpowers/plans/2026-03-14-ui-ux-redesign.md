# UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign from 3 nodes into 2 (simple + advanced) with progressive disclosure UX, shared descriptions, and standardized field naming.

**Architecture:** Shared code in `nodes/shared/` (already extracted) stays as-is. New `shared/descriptions/` folder holds reusable UI field definitions. Simple node (`Crawl4aiPlus`) has 4 operations with minimal UI. Advanced node (`Crawl4aiPlusAdvanced`) has 15 operations with 3 standardized collections. Old node directories are deleted.

**Critical API conventions (from existing codebase):**
- `getCrawl4aiClient(this)` — pass `this` as a regular parameter, NOT `.call(this)`
- `client.crawlUrl(url, config)` — takes a single `CrawlerRunConfig` containing BOTH browser and crawler settings mixed together. The client internally splits them via `formatBrowserConfig()` / `formatCrawlerConfig()`.
- Interface field names are **camelCase** in TypeScript (e.g., `deepCrawlStrategy`, `cacheMode`). The API client converts to snake_case for the HTTP request.
- n8n `displayOptions` within collection `options[]` arrays reference sibling fields directly (e.g., `{ show: { contentFilter: ['pruning'] } }`), NOT with collection-name-prefixed paths.

**Tech Stack:** TypeScript, n8n node SDK (`n8n-workflow`, `n8n-core`), axios (via shared apiClient)

**Spec:** `docs/superpowers/specs/2026-03-14-ui-ux-redesign-design.md`

---

## Chunk 1: Shared Descriptions & Infrastructure

### Task 1: Create common shared field definitions

**Files:**
- Create: `nodes/shared/descriptions/common.fields.ts`

- [ ] **Step 1: Create common.fields.ts with reusable atomic fields**

```typescript
// nodes/shared/descriptions/common.fields.ts
import type { INodeProperties } from 'n8n-workflow';

/** Standard URL input field. Operations pass displayOptions to scope it. */
export const urlField: INodeProperties = {
	displayName: 'URL',
	name: 'url',
	type: 'string',
	default: '',
	required: true,
	placeholder: 'https://example.com',
	description: 'The URL to crawl or extract from',
};

/** Multi-URL textarea. One URL per line. */
export const urlsField: INodeProperties = {
	displayName: 'URLs',
	name: 'urls',
	type: 'string',
	default: '',
	required: true,
	typeOptions: { rows: 4 },
	placeholder: 'https://example.com/page1\nhttps://example.com/page2',
	description: 'One URL per line',
};

/** Crawl scope for simple node multi-page operations. */
export const crawlScopeField: INodeProperties = {
	displayName: 'Crawl Scope',
	name: 'crawlScope',
	type: 'options',
	default: 'singlePage',
	options: [
		{ name: 'Single Page', value: 'singlePage', description: 'Crawl only the specified URL' },
		{ name: 'Follow Links', value: 'followLinks', description: 'Follow links one level deep (same domain)' },
		{ name: 'Full Site', value: 'fullSite', description: 'Recursive crawl up to 3 levels deep (same domain)' },
	],
};

/** Cache mode dropdown reused across many operations. */
export const cacheModeField: INodeProperties = {
	displayName: 'Cache Mode',
	name: 'cacheMode',
	type: 'options',
	default: 'ENABLED',
	options: [
		{ name: 'Enabled', value: 'ENABLED' },
		{ name: 'Bypass', value: 'BYPASS' },
		{ name: 'Disabled', value: 'DISABLED' },
		{ name: 'Read Only', value: 'READ_ONLY' },
		{ name: 'Write Only', value: 'WRITE_ONLY' },
	],
};

/** Wait-for field (CSS selector or JS expression). */
export const waitForField: INodeProperties = {
	displayName: 'Wait For',
	name: 'waitFor',
	type: 'string',
	default: '',
	placeholder: '.content-loaded',
	description: 'CSS selector or JS expression to wait for before extraction',
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /c/temp/n8n/n8n-nodes-crawl4ai-plus && npx tsc --noEmit --pretty nodes/shared/descriptions/common.fields.ts`
Expected: No errors (or only import resolution errors that will resolve at full build)

- [ ] **Step 3: Commit**

```bash
git add nodes/shared/descriptions/common.fields.ts
git commit -m "feat: add shared common field definitions (url, urls, crawlScope, cacheMode, waitFor)"
```

---

### Task 2: Create Browser & Session shared description

**Files:**
- Create: `nodes/shared/descriptions/browserSession.fields.ts`

- [ ] **Step 1: Create browserSession.fields.ts**

This is the "Browser & Session" collection used by advanced operations. It takes an array of operation values for `displayOptions`.

```typescript
// nodes/shared/descriptions/browserSession.fields.ts
import type { INodeProperties } from 'n8n-workflow';

/**
 * Returns the "Browser & Session" collection scoped to the given operations.
 * Each advanced operation that needs browser config calls this with its operation value(s).
 */
export function getBrowserSessionFields(operations: string[]): INodeProperties[] {
	const displayCondition = { show: { operation: operations } };

	return [
		{
			displayName: 'Browser & Session',
			name: 'browserSession',
			type: 'collection',
			placeholder: 'Configure browser & session settings',
			default: {},
			displayOptions: displayCondition,
			options: [
				{
					displayName: 'Browser Type',
					name: 'browserType',
					type: 'options',
					default: 'chromium',
					options: [
						{ name: 'Chromium', value: 'chromium' },
						{ name: 'Firefox', value: 'firefox' },
						{ name: 'WebKit', value: 'webkit' },
					],
				},
				{
					displayName: 'Cookies',
					name: 'cookies',
					type: 'json',
					default: '',
					placeholder: '[{"name":"session","value":"abc","domain":".example.com"}]',
					description: 'JSON array of cookie objects',
				},
				{
					displayName: 'Enable JavaScript',
					name: 'enableJavascript',
					type: 'boolean',
					default: true,
				},
				{
					displayName: 'Enable Stealth Mode',
					name: 'enableStealthMode',
					type: 'boolean',
					default: false,
					description: 'Enable browser fingerprint evasion techniques',
				},
				{
					displayName: 'Extra Browser Args',
					name: 'extraBrowserArgs',
					type: 'string',
					default: '',
					typeOptions: { rows: 3 },
					placeholder: '--disable-gpu\n--no-sandbox',
					description: 'One argument per line',
				},
				{
					displayName: 'Headless Mode',
					name: 'headlessMode',
					type: 'boolean',
					default: true,
				},
				{
					displayName: 'Init Scripts',
					name: 'initScripts',
					type: 'string',
					default: '',
					typeOptions: { rows: 4 },
					placeholder: 'window.__customVar = true;',
					description: 'JavaScript to inject before page load. One script per line.',
				},
				{
					displayName: 'Session ID',
					name: 'sessionId',
					type: 'string',
					default: '',
					description: 'Reuse a browser session across requests',
				},
				{
					displayName: 'Storage State',
					name: 'storageState',
					type: 'json',
					default: '',
					description: 'Browser storage state as JSON (cookies, localStorage)',
				},
				{
					displayName: 'Timeout (ms)',
					name: 'timeout',
					type: 'number',
					default: 30000,
					description: 'Page load timeout in milliseconds. Applied to both browser and page timeouts.',
				},
				{
					displayName: 'Use Managed Browser',
					name: 'useManagedBrowser',
					type: 'boolean',
					default: false,
					displayOptions: { show: { usePersistentContext: [true] } },
				},
				{
					displayName: 'Use Persistent Context',
					name: 'usePersistentContext',
					type: 'boolean',
					default: false,
				},
				{
					displayName: 'User Agent',
					name: 'userAgent',
					type: 'string',
					default: '',
				},
				{
					displayName: 'User Data Dir',
					name: 'userDataDir',
					type: 'string',
					default: '',
					displayOptions: { show: { usePersistentContext: [true] } },
					description: 'Path to browser profile directory',
				},
				{
					displayName: 'Viewport Height',
					name: 'viewportHeight',
					type: 'number',
					default: 800,
				},
				{
					displayName: 'Viewport Width',
					name: 'viewportWidth',
					type: 'number',
					default: 1280,
				},
			],
		},
	];
}
```

- [ ] **Step 2: Commit**

```bash
git add nodes/shared/descriptions/browserSession.fields.ts
git commit -m "feat: add shared Browser & Session collection description"
```

---

### Task 3: Create Crawl Settings shared description

**Files:**
- Create: `nodes/shared/descriptions/crawlSettings.fields.ts`

- [ ] **Step 1: Create crawlSettings.fields.ts**

```typescript
// nodes/shared/descriptions/crawlSettings.fields.ts
import type { INodeProperties } from 'n8n-workflow';

/**
 * Returns the "Crawl Settings" collection scoped to the given operations.
 */
export function getCrawlSettingsFields(operations: string[]): INodeProperties[] {
	const displayCondition = { show: { operation: operations } };

	return [
		{
			displayName: 'Crawl Settings',
			name: 'crawlSettings',
			type: 'collection',
			placeholder: 'Configure crawl settings',
			default: {},
			displayOptions: displayCondition,
			options: [
				{
					displayName: 'Anti-Bot: Magic Mode',
					name: 'magicMode',
					type: 'boolean',
					default: false,
					description: 'Enable automatic anti-bot detection bypass',
				},
				{
					displayName: 'Anti-Bot: Override Navigator',
					name: 'overrideNavigator',
					type: 'boolean',
					default: false,
				},
				{
					displayName: 'Anti-Bot: Simulate User',
					name: 'simulateUser',
					type: 'boolean',
					default: false,
				},
				{
					displayName: 'Cache Mode',
					name: 'cacheMode',
					type: 'options',
					default: 'ENABLED',
					options: [
						{ name: 'Enabled', value: 'ENABLED' },
						{ name: 'Bypass', value: 'BYPASS' },
						{ name: 'Disabled', value: 'DISABLED' },
						{ name: 'Read Only', value: 'READ_ONLY' },
						{ name: 'Write Only', value: 'WRITE_ONLY' },
					],
				},
				{
					displayName: 'Check Robots.txt',
					name: 'checkRobotsTxt',
					type: 'boolean',
					default: false,
				},
				{
					displayName: 'CSS Selector',
					name: 'cssSelector',
					type: 'string',
					default: '',
					placeholder: 'article.main-content',
					description: 'Scope extraction to elements matching this selector',
				},
				{
					displayName: 'Delay Before Return (ms)',
					name: 'delayBeforeReturn',
					type: 'number',
					default: 0,
					description: 'Wait this many milliseconds before returning results',
				},
				{
					displayName: 'Exclude External Links',
					name: 'excludeExternalLinks',
					type: 'boolean',
					default: false,
				},
				{
					displayName: 'Excluded Tags',
					name: 'excludedTags',
					type: 'string',
					default: '',
					placeholder: 'nav, footer, aside',
					description: 'Comma-separated HTML tags to exclude from extraction',
				},
				{
					displayName: 'JavaScript Code',
					name: 'javascriptCode',
					type: 'string',
					default: '',
					typeOptions: { rows: 4 },
					description: 'JavaScript to execute before extraction',
				},
				{
					displayName: 'JS Only Mode',
					name: 'jsOnlyMode',
					type: 'boolean',
					default: false,
					description: 'Skip initial page load; only execute JavaScript',
				},
				{
					displayName: 'Max Retries',
					name: 'maxRetries',
					type: 'number',
					default: 3,
				},
				{
					displayName: 'Preserve HTTPS',
					name: 'preserveHttps',
					type: 'boolean',
					default: false,
					description: 'Keep HTTPS scheme for internal links (maps to preserve_https_for_internal_links)',
				},
				{
					displayName: 'Wait For',
					name: 'waitFor',
					type: 'string',
					default: '',
					placeholder: '.content-loaded',
					description: 'CSS selector or JS expression to wait for before extraction',
				},
				{
					displayName: 'Wait Until',
					name: 'waitUntil',
					type: 'options',
					default: 'load',
					options: [
						{ name: 'Load', value: 'load' },
						{ name: 'DOM Content Loaded', value: 'domcontentloaded' },
						{ name: 'Network Idle', value: 'networkidle' },
						{ name: 'Network Idle 2', value: 'networkidle2' },
					],
				},
				{
					displayName: 'Word Count Threshold',
					name: 'wordCountThreshold',
					type: 'number',
					default: 0,
					description: 'Minimum word count per content block',
				},
			],
		},
	];
}
```

- [ ] **Step 2: Commit**

```bash
git add nodes/shared/descriptions/crawlSettings.fields.ts
git commit -m "feat: add shared Crawl Settings collection description"
```

---

### Task 4: Create Output & Filtering shared description

**Files:**
- Create: `nodes/shared/descriptions/outputFiltering.fields.ts`

- [ ] **Step 1: Create outputFiltering.fields.ts**

This includes Content Filter and Table Extraction sub-fields with conditional visibility.

```typescript
// nodes/shared/descriptions/outputFiltering.fields.ts
import type { INodeProperties } from 'n8n-workflow';

/**
 * Returns the "Output & Filtering" collection scoped to the given operations.
 */
export function getOutputFilteringFields(operations: string[]): INodeProperties[] {
	const displayCondition = { show: { operation: operations } };

	return [
		{
			displayName: 'Output & Filtering',
			name: 'outputFiltering',
			type: 'collection',
			placeholder: 'Configure output & filtering',
			default: {},
			displayOptions: displayCondition,
			options: [
				// --- Output options ---
				{
					displayName: 'Capture Screenshot',
					name: 'captureScreenshot',
					type: 'boolean',
					default: false,
				},
				{
					displayName: 'Fetch SSL Certificate',
					name: 'fetchSslCertificate',
					type: 'boolean',
					default: false,
				},
				{
					displayName: 'Generate PDF',
					name: 'generatePdf',
					type: 'boolean',
					default: false,
				},
				{
					displayName: 'Include Links',
					name: 'includeLinks',
					type: 'boolean',
					default: true,
				},
				{
					displayName: 'Include Media',
					name: 'includeMedia',
					type: 'boolean',
					default: false,
				},
				{
					displayName: 'Include Tables',
					name: 'includeTables',
					type: 'boolean',
					default: true,
				},
				{
					displayName: 'Markdown Output',
					name: 'markdownOutput',
					type: 'options',
					default: 'raw',
					options: [
						{ name: 'Raw', value: 'raw' },
						{ name: 'Fit (Filtered)', value: 'fit' },
						{ name: 'Both', value: 'both' },
					],
				},
				{
					displayName: 'Verbose Response',
					name: 'verboseResponse',
					type: 'boolean',
					default: false,
				},
				// --- Content Filter ---
				{
					displayName: 'Content Filter',
					name: 'contentFilter',
					type: 'options',
					default: 'none',
					options: [
						{ name: 'None', value: 'none' },
						{ name: 'Pruning', value: 'pruning' },
						{ name: 'BM25', value: 'bm25' },
						{ name: 'LLM', value: 'llm' },
					],
					description: 'Filter content before markdown generation',
				},
				// Pruning sub-fields
				{
					displayName: 'Pruning Threshold',
					name: 'pruningThreshold',
					type: 'number',
					default: 0.48,
					displayOptions: { show: { contentFilter: ['pruning'] } },
					description: 'Pruning aggressiveness (0-1)',
				},
				{
					displayName: 'Pruning Threshold Type',
					name: 'pruningThresholdType',
					type: 'options',
					default: 'fixed',
					options: [
						{ name: 'Fixed', value: 'fixed' },
						{ name: 'Dynamic', value: 'dynamic' },
					],
					displayOptions: { show: { contentFilter: ['pruning'] } },
				},
				{
					displayName: 'Pruning Min Word Threshold',
					name: 'pruningMinWordThreshold',
					type: 'number',
					default: 0,
					displayOptions: { show: { contentFilter: ['pruning'] } },
					description: 'Minimum words per block to keep',
				},
				// BM25 sub-fields
				{
					displayName: 'BM25 User Query',
					name: 'bm25UserQuery',
					type: 'string',
					default: '',
					displayOptions: { show: { contentFilter: ['bm25'] } },
					description: 'Search query for relevance scoring',
				},
				{
					displayName: 'BM25 Threshold',
					name: 'bm25Threshold',
					type: 'number',
					default: 1.0,
					displayOptions: { show: { contentFilter: ['bm25'] } },
					description: 'Minimum BM25 score to keep',
				},
				// LLM filter sub-fields
				{
					displayName: 'LLM Filter Instruction',
					name: 'llmFilterInstruction',
					type: 'string',
					default: '',
					typeOptions: { rows: 8 },
					required: true,
					displayOptions: { show: { contentFilter: ['llm'] } },
					description: 'Instructions for LLM content filtering',
				},
				{
					displayName: 'LLM Chunk Token Threshold',
					name: 'llmChunkTokenThreshold',
					type: 'number',
					default: 500,
					displayOptions: { show: { contentFilter: ['llm'] } },
				},
				{
					displayName: 'LLM Filter Verbose',
					name: 'llmFilterVerbose',
					type: 'boolean',
					default: false,
					displayOptions: { show: { contentFilter: ['llm'] } },
				},
				// --- Table Extraction ---
				{
					displayName: 'Table Extraction',
					name: 'tableExtraction',
					type: 'options',
					default: 'none',
					options: [
						{ name: 'None', value: 'none' },
						{ name: 'Default', value: 'default' },
						{ name: 'LLM', value: 'llm' },
					],
				},
				// Default table sub-fields
				{
					displayName: 'Table Score Threshold',
					name: 'tableScoreThreshold',
					type: 'number',
					default: 0.5,
					displayOptions: { show: { tableExtraction: ['default'] } },
					description: 'Minimum confidence score (0-1)',
				},
				{
					displayName: 'Table Verbose',
					name: 'tableVerbose',
					type: 'boolean',
					default: false,
					displayOptions: { show: { tableExtraction: ['default', 'llm'] } },
				},
				// LLM table sub-fields
				{
					displayName: 'Table CSS Selector',
					name: 'tableCssSelector',
					type: 'string',
					default: '',
					displayOptions: { show: { tableExtraction: ['llm'] } },
					description: 'Scope to specific table(s)',
				},
				{
					displayName: 'Table Enable Chunking',
					name: 'tableEnableChunking',
					type: 'boolean',
					default: false,
					displayOptions: { show: { tableExtraction: ['llm'] } },
				},
				{
					displayName: 'Table Max Parallel Chunks',
					name: 'tableMaxParallelChunks',
					type: 'number',
					default: 3,
					displayOptions: {
						show: {
							tableExtraction: ['llm'],
							tableEnableChunking: [true],
						},
					},
				},
				{
					displayName: 'Table Min Rows Per Chunk',
					name: 'tableMinRowsPerChunk',
					type: 'number',
					default: 5,
					displayOptions: {
						show: {
							tableExtraction: ['llm'],
							tableEnableChunking: [true],
						},
					},
				},
				{
					displayName: 'Table Chunk Token Threshold',
					name: 'tableChunkTokenThreshold',
					type: 'number',
					default: 500,
					displayOptions: {
						show: {
							tableExtraction: ['llm'],
							tableEnableChunking: [true],
						},
					},
				},
				{
					displayName: 'Table Max Tries',
					name: 'tableMaxTries',
					type: 'number',
					default: 3,
					displayOptions: { show: { tableExtraction: ['llm'] } },
				},
			],
		},
	];
}
```

- [ ] **Step 2: Commit**

```bash
git add nodes/shared/descriptions/outputFiltering.fields.ts
git commit -m "feat: add shared Output & Filtering collection with Content Filter and Table Extraction sub-fields"
```

---

### Task 5: Create shared descriptions barrel export

**Files:**
- Create: `nodes/shared/descriptions/index.ts`

- [ ] **Step 1: Create index.ts barrel**

```typescript
// nodes/shared/descriptions/index.ts
export { urlField, urlsField, crawlScopeField, cacheModeField, waitForField } from './common.fields';
export { getBrowserSessionFields } from './browserSession.fields';
export { getCrawlSettingsFields } from './crawlSettings.fields';
export { getOutputFilteringFields } from './outputFiltering.fields';
```

- [ ] **Step 2: Commit**

```bash
git add nodes/shared/descriptions/index.ts
git commit -m "feat: add shared descriptions barrel export"
```

---

## Chunk 2: Simple Node — Crawl4AI Plus

### Task 6: Create simple node shell and router

**Files:**
- Create: `nodes/Crawl4aiPlus/Crawl4aiPlus.node.ts`
- Create: `nodes/Crawl4aiPlus/actions/router.ts`
- Create: `nodes/Crawl4aiPlus/actions/operations.ts`
- Copy: `nodes/Crawl4aiPlusSmartExtract/crawl4aiplus.svg` → `nodes/Crawl4aiPlus/crawl4aiplus.svg`

- [ ] **Step 1: Copy SVG icon**

```bash
cp nodes/Crawl4aiPlusSmartExtract/crawl4aiplus.svg nodes/Crawl4aiPlus/crawl4aiplus.svg
```

- [ ] **Step 2: Create operations.ts (aggregation file)**

```typescript
// nodes/Crawl4aiPlus/actions/operations.ts
import type { INodeProperties } from 'n8n-workflow';
import * as getPageContent from './getPageContent.operation';
import * as askQuestion from './askQuestion.operation';
import * as extractData from './extractData.operation';
import * as cssExtractor from './cssExtractor.operation';

export const operationDescriptions: INodeProperties[] = [
	...getPageContent.description,
	...askQuestion.description,
	...extractData.description,
	...cssExtractor.description,
];

export const operations = {
	getPageContent: getPageContent.execute,
	askQuestion: askQuestion.execute,
	extractData: extractData.execute,
	cssExtractor: cssExtractor.execute,
};
```

*Note: This file will fail to compile until the operation files exist. That's expected — we create them in subsequent tasks.*

- [ ] **Step 3: Create router.ts**

```typescript
// nodes/Crawl4aiPlus/actions/router.ts
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { operations } from './operations';

export async function router(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const operation = this.getNodeParameter('operation', 0) as string;
	const executeFn = operations[operation as keyof typeof operations];

	if (!executeFn) {
		throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
	}

	const result = await executeFn.call(this);
	return [result];
}
```

- [ ] **Step 4: Create Crawl4aiPlus.node.ts**

```typescript
// nodes/Crawl4aiPlus/Crawl4aiPlus.node.ts
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { router } from './actions/router';
import { operationDescriptions } from './actions/operations';

export class Crawl4aiPlus implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Crawl4AI Plus',
		name: 'crawl4aiPlus',
		icon: 'file:crawl4aiplus.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description: 'Crawl web pages, extract data, and ask questions using Crawl4AI',
		defaults: { name: 'Crawl4AI Plus' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'crawl4aiPlusApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'getPageContent',
				options: [
					{
						name: 'Get Page Content',
						value: 'getPageContent',
						description: 'Crawl a page and get clean markdown content',
						action: 'Get page content',
					},
					{
						name: 'Ask Question',
						value: 'askQuestion',
						description: 'Ask a question about a web page using AI',
						action: 'Ask question about a page',
					},
					{
						name: 'Extract Data',
						value: 'extractData',
						description: 'Extract contact info, financial data, or custom data',
						action: 'Extract data from a page',
					},
					{
						name: 'Extract with CSS Selectors',
						value: 'cssExtractor',
						description: 'Extract structured data using CSS selectors',
						action: 'Extract with CSS selectors',
					},
				],
			},
			...operationDescriptions,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return router.call(this);
	}
}
```

- [ ] **Step 5: Commit**

```bash
mkdir -p nodes/Crawl4aiPlus/actions nodes/Crawl4aiPlus/helpers
git add nodes/Crawl4aiPlus/Crawl4aiPlus.node.ts nodes/Crawl4aiPlus/actions/router.ts nodes/Crawl4aiPlus/actions/operations.ts nodes/Crawl4aiPlus/crawl4aiplus.svg
git commit -m "feat: create Crawl4AI Plus simple node shell with router and operation registry"
```

---

### Task 7: Create simple node helpers (utils + formatters)

**Files:**
- Create: `nodes/Crawl4aiPlus/helpers/utils.ts`
- Create: `nodes/Crawl4aiPlus/helpers/formatters.ts`

- [ ] **Step 1: Create helpers/utils.ts**

Adapted from SmartExtract helpers. Contains `executeCrawl()`, `buildDeepCrawlStrategy()`, `deduplicateResults()`, and `getSimpleBrowserConfig()`.

```typescript
// nodes/Crawl4aiPlus/helpers/utils.ts
import type { BrowserConfig, CrawlerRunConfig, CrawlResult } from '../../shared/interfaces';
import type { Crawl4aiClient } from '../../shared/apiClient';

/** Smart defaults for simple node — merged into CrawlerRunConfig.
 *  Uses camelCase field names matching the CrawlerRunConfig interface.
 *  The API client's formatBrowserConfig()/formatCrawlerConfig() read these. */
export function getSimpleDefaults(): Partial<CrawlerRunConfig> {
	return {
		headless: true,
		browserType: 'chromium',
		javaScriptEnabled: true,
		viewportWidth: 1280,
		viewportHeight: 800,
	};
}

/** Default URL query params to strip for dedup. */
const DEDUP_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'sort', 'order'];

/** Normalize URL by stripping dedup params and fragments. */
export function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		DEDUP_PARAMS.forEach((p) => parsed.searchParams.delete(p));
		parsed.hash = '';
		return parsed.toString();
	} catch {
		return url;
	}
}

/** Deduplicate crawl results by normalized URL. */
export function deduplicateResults(results: CrawlResult[]): CrawlResult[] {
	const seen = new Set<string>();
	return results.filter((r) => {
		const key = normalizeUrl(r.url);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** Extract domain from URL for same-domain filtering. */
function getDomainFromUrl(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
}

/** Build BFS deep crawl strategy for Follow Links / Full Site scope.
 *  Includes same-domain filter and optional user exclude patterns. */
export function buildDeepCrawlStrategy(
	scope: 'followLinks' | 'fullSite',
	maxPages: number,
	seedUrl: string,
	excludePatterns?: string,
): Record<string, any> {
	const depth = scope === 'followLinks' ? 1 : 3;
	const filters: any[] = [];

	// Same-domain filter — restrict crawling to seed URL's domain
	const domain = getDomainFromUrl(seedUrl);
	if (domain) {
		filters.push({
			type: 'URLPatternFilter',
			params: { patterns: [`*${domain}*`] },
		});
	}

	// User-provided exclude patterns
	if (excludePatterns) {
		const patterns = excludePatterns.split(',').map((p) => p.trim()).filter(Boolean);
		if (patterns.length > 0) {
			filters.push({
				type: 'URLPatternFilter',
				params: { patterns, exclude: true },
			});
		}
	}

	return {
		type: 'BFSDeepCrawlStrategy',
		params: {
			max_depth: depth,
			max_pages: maxPages,
			...(filters.length > 0 && {
				filter_chain: {
					type: 'FilterChain',
					params: { filters },
				},
			}),
		},
	};
}

/**
 * Central multi-page crawl orchestrator.
 * Single page: wraps crawlUrl() result in array.
 * Multi-page: injects deep crawl strategy, calls crawlMultipleUrls(), deduplicates.
 *
 * NOTE: client.crawlUrl() and client.crawlMultipleUrls() take a single
 * CrawlerRunConfig that contains BOTH browser and crawler settings.
 * The client internally splits them via formatBrowserConfig()/formatCrawlerConfig().
 */
export async function executeCrawl(
	client: Crawl4aiClient,
	url: string,
	scope: string,
	config: CrawlerRunConfig,
	options: { maxPages?: number; excludePatterns?: string },
): Promise<CrawlResult[]> {
	if (scope === 'singlePage') {
		const result = await client.crawlUrl(url, config);
		return [result];
	}

	const maxPages = options.maxPages ?? 10;
	const deepCrawlStrategy = buildDeepCrawlStrategy(
		scope as 'followLinks' | 'fullSite',
		maxPages,
		url,
		options.excludePatterns,
	);

	const multiConfig: CrawlerRunConfig = {
		...config,
		deepCrawlStrategy,
	};

	const results = await client.crawlMultipleUrls([url], multiConfig);
	return deduplicateResults(results);
}
```

- [ ] **Step 2: Create helpers/formatters.ts**

```typescript
// nodes/Crawl4aiPlus/helpers/formatters.ts
import type { IDataObject } from 'n8n-workflow';
import type { CrawlResult } from '../../shared/interfaces';
import { parseExtractedJson } from '../../shared/formatters';

/** Extract domain from URL. */
function getDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
}

/** Format Get Page Content output. */
export function formatPageContentResult(
	results: CrawlResult[],
	options: { includeHtml?: boolean; includeLinks?: boolean },
): IDataObject {
	const primary = results[0];
	const urls = results.map((r) => r.url);
	const markdown = results
		.map((r) => (typeof r.markdown === 'object' ? r.markdown.raw_markdown || '' : r.markdown || ''))
		.join('\n\n---\n\n');

	const output: IDataObject = {
		domain: getDomain(primary.url),
		url: primary.url,
		...(results.length > 1 && { urls }),
		markdown,
		success: results.every((r) => r.success),
		pagesScanned: results.length,
		fetchedAt: new Date().toISOString(),
		metrics: { crawlTime: results.reduce((sum, r) => sum + (r.crawl_time || 0), 0) },
	};

	if (options.includeLinks !== false) {
		const internal: string[] = [];
		const external: string[] = [];
		for (const r of results) {
			if (r.links) {
				internal.push(...(r.links.internal || []).map((l: any) => l.href || l));
				external.push(...(r.links.external || []).map((l: any) => l.href || l));
			}
		}
		output.links = { internal: [...new Set(internal)], external: [...new Set(external)] };
	}

	if (options.includeHtml) {
		output.html = results.map((r) => r.html || '').join('\n');
	}

	return output;
}

/** Format Ask Question output. */
export function formatQuestionResult(
	result: CrawlResult,
	question: string,
	pagesScanned: number,
): IDataObject {
	let answer = '';
	let details: string[] = [];
	let sourceQuotes: string[] = [];

	const extracted = parseExtractedJson(result);
	if (extracted && typeof extracted === 'object') {
		answer = (extracted as any).answer || '';
		details = (extracted as any).details || [];
		sourceQuotes = (extracted as any).source_quotes || [];
	} else if (typeof result.extracted_content === 'string') {
		answer = result.extracted_content;
	}

	return {
		domain: getDomain(result.url),
		url: result.url,
		question,
		answer,
		details,
		sourceQuotes,
		success: result.success && !!answer,
		pagesScanned,
		fetchedAt: new Date().toISOString(),
		metrics: { crawlTime: result.crawl_time || 0 },
	};
}

/** Format Extract Data output. */
export function formatExtractedDataResult(
	results: CrawlResult[],
	data: IDataObject,
	extractionType: string,
): IDataObject {
	const primary = results[0];
	const urls = results.map((r) => r.url);

	return {
		domain: getDomain(primary.url),
		url: primary.url,
		...(results.length > 1 && { urls }),
		extractionType,
		data,
		success: true,
		pagesScanned: results.length,
		fetchedAt: new Date().toISOString(),
		metrics: { crawlTime: results.reduce((sum, r) => sum + (r.crawl_time || 0), 0) },
	};
}

/** Format CSS Extractor output. */
export function formatCssExtractorResult(
	result: CrawlResult,
	items: IDataObject[],
): IDataObject {
	return {
		domain: getDomain(result.url),
		url: result.url,
		items,
		itemCount: items.length,
		success: result.success,
		fetchedAt: new Date().toISOString(),
		metrics: { crawlTime: result.crawl_time || 0 },
	};
}
```

- [ ] **Step 3: Commit**

```bash
git add nodes/Crawl4aiPlus/helpers/utils.ts nodes/Crawl4aiPlus/helpers/formatters.ts
git commit -m "feat: add simple node helpers — executeCrawl, formatters for all 4 operations"
```

---

### Task 8: Implement getPageContent operation

**Files:**
- Create: `nodes/Crawl4aiPlus/actions/getPageContent.operation.ts`

- [ ] **Step 1: Create getPageContent.operation.ts**

Reference: Existing SmartExtract `getPageContent.operation.ts` for logic pattern.

```typescript
// nodes/Crawl4aiPlus/actions/getPageContent.operation.ts
import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { urlField, crawlScopeField, cacheModeField, waitForField } from '../../shared/descriptions';
import { getCrawl4aiClient, createMarkdownGenerator } from '../../shared/utils';
import type { CrawlerRunConfig } from '../../shared/interfaces';
import { getSimpleDefaults, executeCrawl } from '../helpers/utils';
import { formatPageContentResult } from '../helpers/formatters';

const displayCondition = { show: { operation: ['getPageContent'] } };

export const description: INodeProperties[] = [
	{ ...urlField, displayOptions: displayCondition },
	{ ...crawlScopeField, displayOptions: displayCondition },
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: displayCondition,
		options: [
			cacheModeField,
			{
				displayName: 'Content Quality',
				name: 'contentQuality',
				type: 'options',
				default: 'clean',
				options: [
					{ name: 'Clean', value: 'clean', description: 'Filtered content (removes boilerplate)' },
					{ name: 'Complete', value: 'complete', description: 'Full page content without filtering' },
				],
			},
			{
				displayName: 'CSS Selector',
				name: 'cssSelector',
				type: 'string',
				default: '',
				placeholder: 'article.main-content',
				description: 'Scope to specific page element',
			},
			{
				displayName: 'Exclude Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: '*/login/*, */admin/*',
				description: 'Comma-separated URL patterns to skip during multi-page crawl',
			},
			{
				displayName: 'Include HTML',
				name: 'includeHtml',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Include Links',
				name: 'includeLinks',
				type: 'boolean',
				default: true,
			},
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				default: 10,
				description: 'Maximum pages to crawl',
				displayOptions: { hide: { '/crawlScope': ['singlePage'] } },
			},
			waitForField,
		],
	},
];

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const url = this.getNodeParameter('url', i) as string;
		const crawlScope = this.getNodeParameter('crawlScope', i) as string;
		const options = this.getNodeParameter('options', i, {}) as Record<string, any>;

		const client = await getCrawl4aiClient(this);

		const config: CrawlerRunConfig = {
			...getSimpleDefaults(),
			cacheMode: options.cacheMode || 'ENABLED',
			...(options.cssSelector && { cssSelector: options.cssSelector }),
			...(options.waitFor && { waitFor: options.waitFor }),
		};

		// Apply content quality filter
		if (options.contentQuality !== 'complete') {
			config.markdownGenerator = createMarkdownGenerator({
				filterType: 'pruning',
				threshold: 0.48,
				thresholdType: 'fixed',
			});
		}

		const results = await executeCrawl(client, url, crawlScope, config, {
			maxPages: options.maxPages,
			excludePatterns: options.excludePatterns,
		});

		const output = formatPageContentResult(results, {
			includeHtml: options.includeHtml,
			includeLinks: options.includeLinks,
		});

		returnData.push({ json: output });
	}

	return returnData;
}
```

- [ ] **Step 2: Commit**

```bash
git add nodes/Crawl4aiPlus/actions/getPageContent.operation.ts
git commit -m "feat: implement getPageContent operation for simple node"
```

---

### Task 9: Implement askQuestion operation

**Files:**
- Create: `nodes/Crawl4aiPlus/actions/askQuestion.operation.ts`

- [ ] **Step 1: Create askQuestion.operation.ts**

```typescript
// nodes/Crawl4aiPlus/actions/askQuestion.operation.ts
import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { urlField, crawlScopeField, cacheModeField, waitForField } from '../../shared/descriptions';
import {
	getCrawl4aiClient,
	validateLlmCredentials,
	buildLlmConfig,
	createLlmExtractionStrategy,
} from '../../shared/utils';
import type { CrawlerRunConfig, Crawl4aiApiCredentials } from '../../shared/interfaces';
import { getSimpleDefaults, executeCrawl } from '../helpers/utils';
import { formatQuestionResult } from '../helpers/formatters';

const displayCondition = { show: { operation: ['askQuestion'] } };

const ASK_QUESTION_PROMPT = `Answer the user's question based on the page content. Return a JSON object with exactly these keys:
- "answer": A concise answer to the question (string)
- "details": An array of supporting details or facts (string[])
- "source_quotes": An array of direct quotes from the page that support the answer (string[])

If the page doesn't contain enough information to answer, set "answer" to "I couldn't find enough information on the page to answer this question." and leave details and source_quotes as empty arrays.`;

const ASK_QUESTION_SCHEMA = {
	type: 'object',
	properties: {
		answer: { type: 'string' },
		details: { type: 'array', items: { type: 'string' } },
		source_quotes: { type: 'array', items: { type: 'string' } },
	},
	required: ['answer', 'details', 'source_quotes'],
};

export const description: INodeProperties[] = [
	{ ...urlField, displayOptions: displayCondition },
	{
		displayName: 'Question',
		name: 'question',
		type: 'string',
		default: '',
		required: true,
		typeOptions: { rows: 3 },
		placeholder: 'What is the pricing for the enterprise plan?',
		description: 'Natural language question to ask about the page content',
		displayOptions: displayCondition,
	},
	{ ...crawlScopeField, displayOptions: displayCondition },
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: displayCondition,
		options: [
			cacheModeField,
			{
				displayName: 'Exclude Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: '*/login/*, */admin/*',
				description: 'Comma-separated URL patterns to skip',
			},
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				default: 10,
				displayOptions: { hide: { '/crawlScope': ['singlePage'] } },
			},
			waitForField,
		],
	},
];

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const url = this.getNodeParameter('url', i) as string;
		const question = this.getNodeParameter('question', i) as string;
		const crawlScope = this.getNodeParameter('crawlScope', i) as string;
		const options = this.getNodeParameter('options', i, {}) as Record<string, any>;

		const credentials = await this.getCredentials('crawl4aiPlusApi') as unknown as Crawl4aiApiCredentials;
		validateLlmCredentials(credentials, 'Ask Question');

		const client = await getCrawl4aiClient(this);
		const llmConfig = buildLlmConfig(credentials);

		const instruction = `${ASK_QUESTION_PROMPT}\n\nQuestion: ${question}`;
		const extractionStrategy = createLlmExtractionStrategy(
			ASK_QUESTION_SCHEMA,
			instruction,
			llmConfig.provider,
			llmConfig.apiKey,
			llmConfig.baseUrl,
		);

		const config: CrawlerRunConfig = {
			...getSimpleDefaults(),
			cacheMode: options.cacheMode || 'ENABLED',
			...(options.waitFor && { waitFor: options.waitFor }),
			extractionStrategy,
		};

		const results = await executeCrawl(client, url, crawlScope, config, {
			maxPages: options.maxPages,
			excludePatterns: options.excludePatterns,
		});

		// Use first successful result with extracted content
		const resultWithAnswer = results.find((r) => r.extracted_content) || results[0];
		const output = formatQuestionResult(resultWithAnswer, question, results.length);
		returnData.push({ json: output });
	}

	return returnData;
}
```

- [ ] **Step 2: Commit**

```bash
git add nodes/Crawl4aiPlus/actions/askQuestion.operation.ts
git commit -m "feat: implement askQuestion operation with LLM extraction and structured output"
```

---

### Task 10: Implement extractData operation

**Files:**
- Create: `nodes/Crawl4aiPlus/actions/extractData.operation.ts`

- [ ] **Step 1: Create extractData.operation.ts**

```typescript
// nodes/Crawl4aiPlus/actions/extractData.operation.ts
import type { IExecuteFunctions, INodeExecutionData, INodeProperties, IDataObject } from 'n8n-workflow';
import { urlField, crawlScopeField, cacheModeField, waitForField } from '../../shared/descriptions';
import {
	getCrawl4aiClient,
	validateLlmCredentials,
	buildLlmConfig,
	createLlmExtractionStrategy,
} from '../../shared/utils';
import { parseExtractedJson } from '../../shared/formatters';
import type { CrawlerRunConfig, Crawl4aiApiCredentials, CrawlResult } from '../../shared/interfaces';
import { getSimpleDefaults, executeCrawl } from '../helpers/utils';
import { formatExtractedDataResult } from '../helpers/formatters';

const displayCondition = { show: { operation: ['extractData'] } };

// --- Regex presets ---
const CONTACT_PATTERNS: Record<string, RegExp> = {
	emails: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
	phones: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}|(?:\+[0-9]{1,3}[-.\s]?)?(?:\([0-9]{1,4}\)[-.\s]?)?[0-9]{4,14}/g,
	socialMedia: /(?:@[a-zA-Z0-9_]{1,15})|(?:https?:\/\/(?:www\.)?(?:twitter|x|linkedin|facebook|instagram)\.com\/[a-zA-Z0-9_./-]+)/g,
	addresses: /\d{1,5}\s+[A-Za-z0-9\s.,#-]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Way|Ct|Court|Pl|Place)\.?(?:\s+(?:Apt|Suite|Unit|#)\s*[A-Za-z0-9-]+)?/gi,
};

const FINANCIAL_PATTERNS: Record<string, RegExp> = {
	currencies: /[$€£¥]\s*[0-9]{1,3}(?:,?[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]{1,3}(?:,?[0-9]{3})*(?:\.[0-9]{1,2})?\s*(?:USD|EUR|GBP)/g,
	creditCards: /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})/g,
	ibans: /[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}(?:[A-Z0-9]{0,16})/g,
	percentages: /[0-9]+(?:\.[0-9]+)?%/g,
	numbers: /[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?/g,
};

function maskCreditCard(card: string): string {
	return card.slice(0, 4) + '****' + card.slice(-4);
}

function extractWithRegex(content: string, patterns: Record<string, RegExp>, maskCards = false): IDataObject {
	const result: IDataObject = {};
	for (const [key, pattern] of Object.entries(patterns)) {
		const matches = content.match(new RegExp(pattern.source, pattern.flags)) || [];
		const unique = [...new Set(matches)];
		result[key] = maskCards && key === 'creditCards' ? unique.map(maskCreditCard) : unique;
	}
	return result;
}

function mergeExtractedData(items: IDataObject[]): IDataObject {
	const merged: IDataObject = {};
	for (const item of items) {
		for (const [key, value] of Object.entries(item)) {
			if (Array.isArray(value)) {
				const existing = (merged[key] as string[]) || [];
				merged[key] = [...new Set([...existing, ...value])];
			} else if (!(key in merged)) {
				merged[key] = value;
			}
		}
	}
	return merged;
}

export const description: INodeProperties[] = [
	{ ...urlField, displayOptions: displayCondition },
	{
		displayName: 'Extraction Type',
		name: 'extractionType',
		type: 'options',
		default: 'contactInfo',
		required: true,
		options: [
			{ name: 'Contact Info', value: 'contactInfo', description: 'Emails, phones, social media, addresses (no AI required)' },
			{ name: 'Financial Data', value: 'financialData', description: 'Currencies, credit cards, IBANs, percentages (no AI required)' },
			{ name: 'Custom (LLM)', value: 'customLlm', description: 'Custom extraction using AI — requires LLM provider in credentials' },
		],
		displayOptions: displayCondition,
	},
	{
		displayName: 'Extraction Instructions',
		name: 'extractionInstructions',
		type: 'string',
		default: '',
		required: true,
		typeOptions: { rows: 4 },
		placeholder: 'Extract the product name, price, and description from this page',
		displayOptions: { show: { operation: ['extractData'], extractionType: ['customLlm'] } },
	},
	{
		displayName: 'Schema Fields',
		name: 'schemaFields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: { fields: [] },
		required: true,
		displayOptions: { show: { operation: ['extractData'], extractionType: ['customLlm'] } },
		options: [
			{
				name: 'fields',
				displayName: 'Field',
				values: [
					{
						displayName: 'Field Name',
						name: 'name',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'productName',
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						default: 'string',
						options: [
							{ name: 'String', value: 'string' },
							{ name: 'Number', value: 'number' },
							{ name: 'Boolean', value: 'boolean' },
							{ name: 'Array', value: 'array' },
						],
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						placeholder: 'The name of the product',
					},
				],
			},
		],
	},
	{ ...crawlScopeField, displayOptions: displayCondition },
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: displayCondition,
		options: [
			cacheModeField,
			{
				displayName: 'Exclude Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: '*/login/*, */admin/*',
			},
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				default: 10,
				displayOptions: { hide: { '/crawlScope': ['singlePage'] } },
			},
			waitForField,
		],
	},
];

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const url = this.getNodeParameter('url', i) as string;
		const extractionType = this.getNodeParameter('extractionType', i) as string;
		const crawlScope = this.getNodeParameter('crawlScope', i) as string;
		const options = this.getNodeParameter('options', i, {}) as Record<string, any>;

		const client = await getCrawl4aiClient(this);

		const config: CrawlerRunConfig = {
			...getSimpleDefaults(),
			cacheMode: options.cacheMode || 'ENABLED',
			...(options.waitFor && { waitFor: options.waitFor }),
		};

		// For LLM extraction, add extraction strategy to config
		if (extractionType === 'customLlm') {
			const credentials = await this.getCredentials('crawl4aiPlusApi') as unknown as Crawl4aiApiCredentials;
			validateLlmCredentials(credentials, 'Custom (LLM) extraction');

			const instruction = this.getNodeParameter('extractionInstructions', i) as string;
			const schemaFieldsRaw = this.getNodeParameter('schemaFields', i) as { fields: Array<{ name: string; type: string; description: string }> };
			const schema = buildJsonSchema(schemaFieldsRaw.fields);

			const llmConfig = buildLlmConfig(credentials);
			config.extractionStrategy = createLlmExtractionStrategy(
				schema,
				instruction,
				llmConfig.provider,
				llmConfig.apiKey,
				llmConfig.baseUrl,
			);
		}

		const results = await executeCrawl(client, url, crawlScope, config, {
			maxPages: options.maxPages,
			excludePatterns: options.excludePatterns,
		});

		let data: IDataObject;

		if (extractionType === 'customLlm') {
			// Collect LLM extraction results
			const extractedItems = results
				.map((r) => parseExtractedJson(r))
				.filter((e): e is IDataObject => e !== null && typeof e === 'object');
			data = extractedItems.length === 1 ? extractedItems[0] : mergeExtractedData(extractedItems);
		} else {
			// Regex extraction from markdown content
			const patterns = extractionType === 'contactInfo' ? CONTACT_PATTERNS : FINANCIAL_PATTERNS;
			const perPageData = results.map((r) => {
				const content = typeof r.markdown === 'object' ? r.markdown.raw_markdown || '' : r.markdown || '';
				return extractWithRegex(content, patterns, extractionType === 'financialData');
			});
			data = mergeExtractedData(perPageData);
		}

		const output = formatExtractedDataResult(results, data, extractionType);
		returnData.push({ json: output });
	}

	return returnData;
}

/** Build JSON Schema object from simple field definitions. */
function buildJsonSchema(fields: Array<{ name: string; type: string; description: string }>): Record<string, any> {
	const properties: Record<string, any> = {};
	const required: string[] = [];

	for (const field of fields) {
		const prop: Record<string, any> = { type: field.type };
		if (field.description) prop.description = field.description;
		if (field.type === 'array') {
			prop.items = { type: 'string' };
		}
		properties[field.name] = prop;
		required.push(field.name);
	}

	return { type: 'object', properties, required };
}
```

- [ ] **Step 2: Commit**

```bash
git add nodes/Crawl4aiPlus/actions/extractData.operation.ts
git commit -m "feat: implement extractData operation with regex presets and LLM custom extraction"
```

---

### Task 11: Implement cssExtractor operation

**Files:**
- Create: `nodes/Crawl4aiPlus/actions/cssExtractor.operation.ts`

- [ ] **Step 1: Create cssExtractor.operation.ts**

```typescript
// nodes/Crawl4aiPlus/actions/cssExtractor.operation.ts
import type { IExecuteFunctions, INodeExecutionData, INodeProperties, IDataObject } from 'n8n-workflow';
import { urlField, cacheModeField, waitForField } from '../../shared/descriptions';
import { getCrawl4aiClient, createCssSelectorExtractionStrategy } from '../../shared/utils';
import { parseExtractedJson } from '../../shared/formatters';
import type { CrawlerRunConfig } from '../../shared/interfaces';
import { getSimpleDefaults } from '../helpers/utils';
import { formatCssExtractorResult } from '../helpers/formatters';

const displayCondition = { show: { operation: ['cssExtractor'] } };

export const description: INodeProperties[] = [
	{ ...urlField, displayOptions: displayCondition },
	{
		displayName: 'Base Selector',
		name: 'baseSelector',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'div.product-item',
		description: 'CSS selector for the repeating element (e.g., product cards, article items)',
		displayOptions: displayCondition,
	},
	{
		displayName: 'Fields',
		name: 'extractionFields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: { fields: [] },
		required: true,
		displayOptions: displayCondition,
		options: [
			{
				name: 'fields',
				displayName: 'Field',
				values: [
					{
						displayName: 'Field Name',
						name: 'name',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'title',
					},
					{
						displayName: 'CSS Selector',
						name: 'selector',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'h3.title',
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						default: 'text',
						options: [
							{ name: 'Text', value: 'text' },
							{ name: 'HTML', value: 'html' },
							{ name: 'Attribute', value: 'attribute' },
						],
					},
					{
						displayName: 'Attribute Name',
						name: 'attribute',
						type: 'string',
						default: 'href',
						displayOptions: { show: { type: ['attribute'] } },
						placeholder: 'href',
					},
				],
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: displayCondition,
		options: [
			cacheModeField,
			{
				displayName: 'Clean Text',
				name: 'cleanText',
				type: 'boolean',
				default: true,
				description: 'Normalize whitespace in extracted text',
			},
			{
				displayName: 'Include Original Text',
				name: 'includeOriginalText',
				type: 'boolean',
				default: false,
			},
			waitForField,
		],
	},
];

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const url = this.getNodeParameter('url', i) as string;
		const baseSelector = this.getNodeParameter('baseSelector', i) as string;
		const fieldsRaw = this.getNodeParameter('extractionFields', i) as {
			fields: Array<{ name: string; selector: string; type: string; attribute?: string }>;
		};
		const options = this.getNodeParameter('options', i, {}) as Record<string, any>;

		const client = await getCrawl4aiClient(this);

		// Build CSS extraction schema
		const schema = {
			baseSelector,
			fields: fieldsRaw.fields.map((f) => ({
				name: f.name,
				selector: f.selector,
				type: f.type,
				...(f.type === 'attribute' && f.attribute && { attribute: f.attribute }),
			})),
		};

		const extractionStrategy = createCssSelectorExtractionStrategy(schema);

		const config: CrawlerRunConfig = {
			...getSimpleDefaults(),
			cacheMode: options.cacheMode || 'ENABLED',
			...(options.waitFor && { waitFor: options.waitFor }),
			extractionStrategy,
		};

		const result = await client.crawlUrl(url, config);

		let extractedItems: IDataObject[] = [];
		const parsed = parseExtractedJson(result);
		if (Array.isArray(parsed)) {
			extractedItems = parsed as IDataObject[];
		} else if (parsed && typeof parsed === 'object') {
			extractedItems = [parsed as IDataObject];
		}

		// Clean text if requested
		if (options.cleanText !== false) {
			extractedItems = extractedItems.map((item) => {
				const cleaned: IDataObject = {};
				for (const [key, value] of Object.entries(item)) {
					cleaned[key] = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;
				}
				return cleaned;
			});
		}

		const output = formatCssExtractorResult(result, extractedItems);
		returnData.push({ json: output });
	}

	return returnData;
}
```

- [ ] **Step 2: Commit**

```bash
git add nodes/Crawl4aiPlus/actions/cssExtractor.operation.ts
git commit -m "feat: implement cssExtractor operation for simple node"
```

---

### Task 12: Build and verify simple node compiles

- [ ] **Step 1: Run full build**

Run: `cd /c/temp/n8n/n8n-nodes-crawl4ai-plus && pnpm build`
Expected: Compiles with no TypeScript errors. If errors, fix them.

- [ ] **Step 2: Verify dist output exists**

Run: `ls dist/nodes/Crawl4aiPlus/`
Expected: `Crawl4aiPlus.node.js`, `crawl4aiplus.svg`, `actions/`, `helpers/`

- [ ] **Step 3: Commit any build fixes**

```bash
git add -A && git commit -m "fix: resolve build errors for simple node"
```

---

## Chunk 3: Advanced Node — Crawl4AI Plus Advanced

### Task 13: Create advanced node shell and router

**Files:**
- Create: `nodes/Crawl4aiPlusAdvanced/Crawl4aiPlusAdvanced.node.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/router.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/operations.ts`
- Copy: SVG icon

- [ ] **Step 1: Copy SVG icon**

```bash
cp nodes/Crawl4aiPlusSmartExtract/crawl4aiplus.svg nodes/Crawl4aiPlusAdvanced/crawl4aiplus.svg
```

- [ ] **Step 2: Create Crawl4aiPlusAdvanced.node.ts**

Same pattern as simple node but with 15 operations organized into groups. The operation dropdown uses description prefixes for grouping (e.g., `"[Crawling] Crawl URL"`). If `groupName` is supported, use that instead.

```typescript
// nodes/Crawl4aiPlusAdvanced/Crawl4aiPlusAdvanced.node.ts
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { router } from './actions/router';
import { operationDescriptions } from './actions/operations';

export class Crawl4aiPlusAdvanced implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Crawl4AI Plus Advanced',
		name: 'crawl4aiPlusAdvanced',
		icon: 'file:crawl4aiplus.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description: 'Advanced web crawling and extraction with full Crawl4AI API control',
		defaults: { name: 'Crawl4AI Plus Advanced' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'crawl4aiPlusApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'crawlUrl',
				options: [
					// --- Crawling group ---
					{ name: 'Crawl URL', value: 'crawlUrl', description: 'Crawl a single URL with full configuration', action: 'Crawl a URL', groupName: 'Crawling' },
					{ name: 'Crawl Multiple URLs', value: 'crawlMultipleUrls', description: 'Crawl a list of URLs or discover via deep crawl', action: 'Crawl multiple URLs', groupName: 'Crawling' },
					{ name: 'Stream Crawl', value: 'crawlStream', description: 'Stream crawl results for large URL sets', action: 'Stream crawl results', groupName: 'Crawling' },
					{ name: 'Process Raw HTML', value: 'processRawHtml', description: 'Process already-fetched HTML content', action: 'Process raw HTML', groupName: 'Crawling' },
					{ name: 'Discover Links', value: 'discoverLinks', description: 'Extract and filter links from a page', action: 'Discover links on a page', groupName: 'Crawling' },
					// --- Extraction group ---
					{ name: 'LLM Extractor', value: 'llmExtractor', description: 'Extract structured data using AI models', action: 'Extract with LLM', groupName: 'Extraction' },
					{ name: 'CSS Extractor', value: 'cssExtractor', description: 'Extract data using CSS selectors', action: 'Extract with CSS selectors', groupName: 'Extraction' },
					{ name: 'JSON Extractor', value: 'jsonExtractor', description: 'Extract JSON/JSON-LD data from pages', action: 'Extract JSON data', groupName: 'Extraction' },
					{ name: 'Regex Extractor', value: 'regexExtractor', description: 'Extract data using regex patterns', action: 'Extract with regex', groupName: 'Extraction' },
					{ name: 'Cosine Similarity', value: 'cosineExtractor', description: 'Semantic similarity clustering (requires crawl4ai:all image)', action: 'Extract by similarity', groupName: 'Extraction' },
					{ name: 'SEO Metadata', value: 'seoExtractor', description: 'Extract title, meta tags, OG tags, Twitter cards, JSON-LD', action: 'Extract SEO metadata', groupName: 'Extraction' },
					// --- Jobs & Monitoring group ---
					{ name: 'Submit Crawl Job', value: 'submitCrawlJob', description: 'Submit an async crawl job', action: 'Submit crawl job', groupName: 'Jobs & Monitoring' },
					{ name: 'Submit LLM Job', value: 'submitLlmJob', description: 'Submit an async LLM extraction job', action: 'Submit LLM job', groupName: 'Jobs & Monitoring' },
					{ name: 'Get Job Status', value: 'getJobStatus', description: 'Check status of an async job', action: 'Get job status', groupName: 'Jobs & Monitoring' },
					{ name: 'Health Check', value: 'healthCheck', description: 'Check Crawl4AI server availability', action: 'Check server health', groupName: 'Jobs & Monitoring' },
				],
			},
			...operationDescriptions,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return router.call(this);
	}
}
```

- [ ] **Step 3: Create router.ts** (same pattern as simple node)

- [ ] **Step 4: Create operations.ts** (imports all 15 operation files, aggregates descriptions + dispatch map)

*Note: Operations will be created in subsequent tasks. Create the operations.ts with imports commented out initially, then uncomment as each operation is added.*

- [ ] **Step 5: Commit**

```bash
mkdir -p nodes/Crawl4aiPlusAdvanced/actions nodes/Crawl4aiPlusAdvanced/helpers
git add nodes/Crawl4aiPlusAdvanced/
git commit -m "feat: create Crawl4AI Plus Advanced node shell with 15-operation dropdown"
```

---

### Task 14: Implement advanced Crawling operations (crawlUrl, crawlMultipleUrls, crawlStream, processRawHtml, discoverLinks)

**Files:**
- Create: `nodes/Crawl4aiPlusAdvanced/actions/crawlUrl.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/crawlMultipleUrls.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/crawlStream.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/processRawHtml.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/discoverLinks.operation.ts`

Each operation follows this pattern:
1. Import shared descriptions via `getBrowserSessionFields`, `getCrawlSettingsFields`, `getOutputFilteringFields`
2. Define operation-specific required fields (url, urls, etc.)
3. Include shared collections scoped to the operation via `displayOptions`
4. Execute function calls `getCrawl4aiClient(this)` (regular parameter, NOT `.call(this)`), builds a single `CrawlerRunConfig` merging browser + crawler settings, and passes it to `client.crawlUrl(url, config)`. The API client splits the config internally.
5. Format output with `formatCrawlResult()` from shared formatters

**Config merging pattern for advanced operations:**
```typescript
const browserSession = this.getNodeParameter('browserSession', i, {}) as Record<string, any>;
const crawlSettings = this.getNodeParameter('crawlSettings', i, {}) as Record<string, any>;
const outputFiltering = this.getNodeParameter('outputFiltering', i, {}) as Record<string, any>;

// Merge all into one flat CrawlerRunConfig — the API client splits them
const config: CrawlerRunConfig = {
    ...createBrowserConfig(browserSession),   // browserType, headless, viewport, etc.
    ...createCrawlerRunConfig(crawlSettings),  // cacheMode, cssSelector, waitFor, etc.
    // Add output/filtering config (markdown generator, table extraction, etc.)
};
```

**Field name mapping note:** The shared description field names (e.g., `javascriptCode`, `delayBeforeReturn`, `magicMode`, `preserveHttps`, `captureScreenshot`, `generatePdf`) may not exactly match what `createBrowserConfig()` / `createCrawlerRunConfig()` expect (e.g., `jsCode`, `delayBeforeReturnHtml`, `magic`, `preserveHttpsForInternalLinks`, `screenshot`, `pdf`). When implementing advanced operations, either:
- (a) Name the UI fields to match the existing utility function keys (preferred — less mapping code), OR
- (b) Add an explicit mapping object that translates UI field names to config keys before calling `createBrowserConfig()`/`createCrawlerRunConfig()`

Option (a) is recommended: use the same field names the utility functions already expect. Update the shared descriptions in Tasks 2-4 to use matching names. This is a deliberate trade-off — the UI `displayName` (what users see) is separate from the `name` (what code reads), so names like `jsCode` are fine internally while the display shows "JavaScript Code".

- [ ] **Step 1: Create crawlUrl.operation.ts**

Uses all 3 shared collections. Required field: `url`. This is the most complete operation — reference for all others.

Key implementation detail: The `execute()` function reads `browserSession`, `crawlSettings`, and `outputFiltering` collection values, maps them to `BrowserConfig` and `CrawlerRunConfig` using shared utils, calls `client.crawlUrl()`, and formats with `formatCrawlResult()`.

Port logic from existing `crawlSingleUrl.operation.ts` but use the new standardized collection names. Map single `timeout` field to both `page_timeout` and browser `timeout`. Parse `extraBrowserArgs` by splitting on newlines. Parse `initScripts` by splitting on newlines.

- [ ] **Step 2: Create crawlMultipleUrls.operation.ts**

Additional required fields: `crawlMode` (manual/discover), `urls` (when manual), `seedUrl` (when discover), `discoveryStrategy` collection (when discover). Uses all 3 shared collections.

Port deep crawl strategy building from existing `crawlMultipleUrls.operation.ts`. Map `strategyType` to API names (`BFSDeepCrawlStrategy`, etc.). Build `FilterChain` from include/exclude patterns. Build `KeywordRelevanceScorer` from query terms (BestFirst only).

- [ ] **Step 3: Create crawlStream.operation.ts**

Required field: `urls` (textarea). Uses Browser & Session + Crawl Settings (no Output & Filtering — streaming has simpler output). Port from existing `crawlStream.operation.ts`.

- [ ] **Step 4: Create processRawHtml.operation.ts**

Required fields: `htmlContent` (textarea), `baseUrl`. Uses Crawl Settings + Output & Filtering (no Browser & Session — no browser needed for raw HTML). Port from existing `processRawHtml.operation.ts`.

- [ ] **Step 5: Create discoverLinks.operation.ts**

Required fields: `url`, `linkTypes` (multiOptions: internal/external). Has operation-specific filter collection. Uses Browser & Session (no Crawl Settings or Output & Filtering). Port from existing `discoverLinks.operation.ts`.

- [ ] **Step 6: Commit**

```bash
git add nodes/Crawl4aiPlusAdvanced/actions/crawlUrl.operation.ts nodes/Crawl4aiPlusAdvanced/actions/crawlMultipleUrls.operation.ts nodes/Crawl4aiPlusAdvanced/actions/crawlStream.operation.ts nodes/Crawl4aiPlusAdvanced/actions/processRawHtml.operation.ts nodes/Crawl4aiPlusAdvanced/actions/discoverLinks.operation.ts
git commit -m "feat: implement 5 advanced Crawling operations with shared descriptions"
```

---

### Task 15: Implement advanced Extraction operations (llmExtractor, cssExtractor, jsonExtractor, regexExtractor, cosineExtractor, seoExtractor)

**Files:**
- Create: `nodes/Crawl4aiPlusAdvanced/actions/llmExtractor.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/cssExtractor.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/jsonExtractor.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/regexExtractor.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/cosineExtractor.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/seoExtractor.operation.ts`

Each extraction operation:
1. Uses Browser & Session + Crawl Settings (most also use subset of Output & Filtering)
2. Has operation-specific extraction config fields
3. Calls `client.arun()` (alias for `crawlUrl()`) with extraction strategy injected into crawler config
4. Formats with `formatExtractionResult()` from shared formatters

- [ ] **Step 1: Create llmExtractor.operation.ts**

Port from existing `llmExtractor.operation.ts`. Key changes:
- Use shared Browser & Session / Crawl Settings collections
- Schema mode (simple/advanced) stays as operation-specific field
- Array handling (none/topLevel/allObjects/smart) stays as operation-specific field
- LLM options (input format, max tokens, temperature) stay as operation-specific collection
- Use standardized `url` field name

- [ ] **Step 2: Create cssExtractor.operation.ts**

Port from existing `cssExtractor.operation.ts`. Uses shared collections + operation-specific base selector and fields.

- [ ] **Step 3: Create jsonExtractor.operation.ts**

Port from existing. Operation-specific: `jsonPath`, `sourceType` (direct/script/jsonld), `scriptSelector`.

- [ ] **Step 4: Create regexExtractor.operation.ts**

Port from existing. Operation-specific: `patternType` (builtin/custom/llm), built-in pattern checkboxes, custom pattern fixedCollection, LLM pattern fields.

- [ ] **Step 5: Create cosineExtractor.operation.ts**

Port from existing. Operation-specific: `semanticFilter`, clustering options collection (linkage method, max distance, model name, similarity threshold, top K, word count threshold).

- [ ] **Step 6: Create seoExtractor.operation.ts**

Port from existing. Operation-specific: `metadataTypes` (multiOptions: basic, openGraph, twitterCards, jsonLd, robots, language).

- [ ] **Step 7: Commit**

```bash
git add nodes/Crawl4aiPlusAdvanced/actions/llmExtractor.operation.ts nodes/Crawl4aiPlusAdvanced/actions/cssExtractor.operation.ts nodes/Crawl4aiPlusAdvanced/actions/jsonExtractor.operation.ts nodes/Crawl4aiPlusAdvanced/actions/regexExtractor.operation.ts nodes/Crawl4aiPlusAdvanced/actions/cosineExtractor.operation.ts nodes/Crawl4aiPlusAdvanced/actions/seoExtractor.operation.ts
git commit -m "feat: implement 6 advanced Extraction operations with shared descriptions"
```

---

### Task 16: Implement advanced Jobs & Monitoring operations (submitCrawlJob, submitLlmJob, getJobStatus, healthCheck)

**Files:**
- Create: `nodes/Crawl4aiPlusAdvanced/actions/submitCrawlJob.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/submitLlmJob.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/getJobStatus.operation.ts`
- Create: `nodes/Crawl4aiPlusAdvanced/actions/healthCheck.operation.ts`

- [ ] **Step 1: Create submitCrawlJob.operation.ts**

Required: `urls` (textarea). Uses Browser & Session + Crawl Settings. Has operation-specific webhook config collection (webhookUrl, includeDataInPayload, webhookHeaders as JSON textarea). Port from existing `submitCrawlJob.operation.ts`.

- [ ] **Step 2: Create submitLlmJob.operation.ts**

Required: `url`, `extractionQuery` (textarea). Operation-specific: LLM options collection (provider override, temperature), webhook config. Port from existing `submitLlmJob.operation.ts`.

- [ ] **Step 3: Create getJobStatus.operation.ts**

Required: `taskId` (string). No collections needed. Port from existing `getJobStatus.operation.ts`.

- [ ] **Step 4: Create healthCheck.operation.ts**

No fields — just a notice. Port from existing `healthCheck.operation.ts`.

- [ ] **Step 5: Commit**

```bash
git add nodes/Crawl4aiPlusAdvanced/actions/submitCrawlJob.operation.ts nodes/Crawl4aiPlusAdvanced/actions/submitLlmJob.operation.ts nodes/Crawl4aiPlusAdvanced/actions/getJobStatus.operation.ts nodes/Crawl4aiPlusAdvanced/actions/healthCheck.operation.ts
git commit -m "feat: implement 4 advanced Jobs & Monitoring operations"
```

---

### Task 17: Create advanced node formatters and wire up operations.ts

**Files:**
- Create: `nodes/Crawl4aiPlusAdvanced/helpers/formatters.ts`
- Modify: `nodes/Crawl4aiPlusAdvanced/actions/operations.ts` (uncomment all imports)

- [ ] **Step 1: Create helpers/formatters.ts**

Most formatting is handled by shared `formatCrawlResult()` and `formatExtractionResult()`. This file re-exports them and adds any advanced-specific formatting (e.g., async job output formatting).

```typescript
// nodes/Crawl4aiPlusAdvanced/helpers/formatters.ts
export { formatCrawlResult, formatExtractionResult, parseExtractedJson } from '../../shared/formatters';

import type { IDataObject } from 'n8n-workflow';

/** Format async job submission response. */
export function formatJobSubmission(taskId: string): IDataObject {
	return {
		taskId,
		status: 'pending',
		submittedAt: new Date().toISOString(),
	};
}
```

- [ ] **Step 2: Wire up operations.ts with all 15 imports**

- [ ] **Step 3: Commit**

```bash
git add nodes/Crawl4aiPlusAdvanced/helpers/formatters.ts nodes/Crawl4aiPlusAdvanced/actions/operations.ts
git commit -m "feat: wire up all 15 advanced operations and add formatters"
```

---

### Task 18: Build and verify advanced node compiles

- [ ] **Step 1: Run full build**

Run: `cd /c/temp/n8n/n8n-nodes-crawl4ai-plus && pnpm build`
Expected: No TypeScript errors.

- [ ] **Step 2: Verify dist output**

Run: `ls dist/nodes/Crawl4aiPlusAdvanced/`
Expected: `Crawl4aiPlusAdvanced.node.js`, `crawl4aiplus.svg`, `actions/` (15 operation files), `helpers/`

- [ ] **Step 3: Commit any build fixes**

```bash
git add -A && git commit -m "fix: resolve build errors for advanced node"
```

---

## Chunk 4: Registration, Cleanup & Final Verification

### Task 19: Update package.json and index.js

**Files:**
- Modify: `package.json`
- Modify: `index.js`

- [ ] **Step 1: Update package.json**

Update the `"n8n"` section to point to the 2 new nodes:

```json
"n8n": {
  "nodes": [
    "dist/nodes/Crawl4aiPlus/Crawl4aiPlus.node.js",
    "dist/nodes/Crawl4aiPlusAdvanced/Crawl4aiPlusAdvanced.node.js"
  ],
  "credentials": [
    "dist/credentials/Crawl4aiApi.credentials.js"
  ]
}
```

Also update `"version"` to `"5.0.0"`.

- [ ] **Step 2: Update index.js**

Replace old node exports with new ones:

```javascript
const { Crawl4aiPlus } = require('./dist/nodes/Crawl4aiPlus/Crawl4aiPlus.node.js');
const { Crawl4aiPlusAdvanced } = require('./dist/nodes/Crawl4aiPlusAdvanced/Crawl4aiPlusAdvanced.node.js');
const { Crawl4aiApi } = require('./dist/credentials/Crawl4aiApi.credentials.js');

module.exports = {
  nodeTypes: { crawl4aiPlus: Crawl4aiPlus, crawl4aiPlusAdvanced: Crawl4aiPlusAdvanced },
  credentialTypes: { crawl4aiPlusApi: Crawl4aiApi },
};
```

- [ ] **Step 3: Commit**

```bash
git add package.json index.js
git commit -m "feat: update node registration for 2-node architecture, bump to v5.0.0"
```

---

### Task 20: Delete old node directories

**Files:**
- Delete: `nodes/Crawl4aiPlusBasicCrawler/` (entire directory)
- Delete: `nodes/Crawl4aiPlusContentExtractor/` (entire directory)
- Delete: `nodes/Crawl4aiPlusSmartExtract/` (entire directory)

- [ ] **Step 1: Remove old directories**

```bash
rm -rf nodes/Crawl4aiPlusBasicCrawler nodes/Crawl4aiPlusContentExtractor nodes/Crawl4aiPlusSmartExtract
```

- [ ] **Step 2: Run full build to verify nothing references deleted files**

Run: `pnpm build`
Expected: Clean compile. If import errors, fix them (likely shared code referencing old paths).

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors (or only pre-existing ones).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old node directories (BasicCrawler, ContentExtractor, SmartExtract)"
```

---

### Task 21: Final verification build

- [ ] **Step 1: Clean build from scratch**

```bash
rm -rf dist && pnpm build
```

Expected: Clean compile with dist/ containing:
- `dist/nodes/Crawl4aiPlus/` (4 operations)
- `dist/nodes/Crawl4aiPlusAdvanced/` (15 operations)
- `dist/nodes/shared/` (descriptions, apiClient, utils, etc.)
- `dist/credentials/Crawl4aiApi.credentials.js`

- [ ] **Step 2: Verify SVG icons copied**

Run: `ls dist/nodes/Crawl4aiPlus/crawl4aiplus.svg dist/nodes/Crawl4aiPlusAdvanced/crawl4aiplus.svg`
Expected: Both files exist (gulp copies them).

- [ ] **Step 3: Verify node exports**

Run: `node -e "const m = require('./index.js'); console.log(Object.keys(m.nodeTypes)); console.log(Object.keys(m.credentialTypes));"`
Expected: `['crawl4aiPlus', 'crawl4aiPlusAdvanced']` and `['crawl4aiPlusApi']`

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: Clean.

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "chore: final verification — clean build, lint pass, node exports verified"
```

---

## Task Dependency Summary

```
Tasks 1-5 (shared descriptions) → can be done in parallel, no dependencies
Task 6 (simple node shell) → depends on Task 5 (barrel export)
Task 7 (simple helpers) → no dependencies (uses shared code directly)
Tasks 8-11 (simple operations) → depend on Tasks 6 + 7
Task 12 (simple build verify) → depends on Tasks 8-11
Task 13 (advanced node shell) → depends on Task 5
Tasks 14-16 (advanced operations) → depend on Task 13
Task 17 (advanced wire-up) → depends on Tasks 14-16
Task 18 (advanced build verify) → depends on Task 17
Task 19 (registration) → depends on Tasks 12 + 18
Task 20 (cleanup) → depends on Task 19
Task 21 (final verify) → depends on Task 20
```

**Parallelizable work:**
- Tasks 1-5 can all be done in parallel
- Tasks 8-11 can all be done in parallel (after 6+7)
- Tasks 14, 15, 16 can all be done in parallel (after 13)
