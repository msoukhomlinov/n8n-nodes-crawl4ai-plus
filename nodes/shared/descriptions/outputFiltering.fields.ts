import { INodeProperties } from 'n8n-workflow';

/**
 * Returns an "Output & Filtering" collection with fields for output format,
 * content filtering (pruning/bm25/llm), and table extraction.
 *
 * Field names match what createCrawlerRunConfig(), createMarkdownGenerator(),
 * and createTableExtractionStrategy() in shared/utils.ts expect.
 *
 * @param operations - operation values for which this collection is shown
 */
export function getOutputFilteringFields(operations: string[]): INodeProperties[] {
	return [
		{
			displayName: 'Output & Filtering',
			name: 'outputFiltering',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			displayOptions: {
				show: {
					operation: operations,
				},
			},
			options: [
				// ===== Output Fields =====

				// --- Capture Screenshot ---
				{
					displayName: 'Capture Screenshot',
					name: 'screenshot',
					type: 'boolean',
					default: false,
					description: 'Whether to capture a screenshot of the page (returned as base64)',
				},
				// --- Content Filter ---
				{
					displayName: 'Content Filter',
					name: 'contentFilter',
					type: 'options',
					options: [
						{ name: 'None', value: 'none', description: 'No content filtering' },
						{ name: 'Pruning', value: 'pruning', description: 'Statistical pruning of low-quality content blocks' },
						{ name: 'BM25', value: 'bm25', description: 'BM25 relevance scoring against a query' },
						{ name: 'LLM', value: 'llm', description: 'LLM-powered content filtering (requires LLM credentials)' },
					],
					default: 'none',
					description: 'Content filtering strategy for fit_markdown generation',
				},
				// --- Content Filter: BM25 Threshold ---
				{
					displayName: 'BM25 Threshold',
					name: 'bm25Threshold',
					type: 'number',
					default: 1.0,
					displayOptions: {
						show: {
							contentFilter: ['bm25'],
						},
					},
					description: 'BM25 relevance threshold (lower = more results)',
				},
				// --- Content Filter: LLM Chunk Token Threshold ---
				{
					displayName: 'Chunk Token Threshold',
					name: 'chunkTokenThreshold',
					type: 'number',
					default: 500,
					displayOptions: {
						show: {
							contentFilter: ['llm'],
						},
					},
					description: 'Maximum number of tokens per chunk sent to the LLM',
				},
				// --- Content Filter: LLM Instruction ---
				{
					displayName: 'Instruction',
					name: 'llmInstruction',
					type: 'string',
					typeOptions: {
						rows: 8,
					},
					default: '',
					required: true,
					displayOptions: {
						show: {
							contentFilter: ['llm'],
						},
					},
					placeholder: 'Extract only paragraphs that discuss pricing information...',
					description: 'Instruction for the LLM content filter describing what content to keep',
				},
				// --- Content Filter: LLM Verbose ---
				{
					displayName: 'Verbose',
					name: 'llmVerbose',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							contentFilter: ['llm'],
						},
					},
					description: 'Whether to enable verbose logging for LLM content filter',
				},
				// --- Content Filter: Pruning Min Word Threshold ---
				{
					displayName: 'Min Word Threshold',
					name: 'minWordThreshold',
					type: 'number',
					default: 0,
					displayOptions: {
						show: {
							contentFilter: ['pruning'],
						},
					},
					description: 'Minimum word count for a block to be considered (0 = no minimum)',
				},
				// --- Content Filter: Pruning Threshold ---
				{
					displayName: 'Threshold',
					name: 'threshold',
					type: 'number',
					default: 0.48,
					displayOptions: {
						show: {
							contentFilter: ['pruning'],
						},
					},
					description: 'Pruning threshold score (higher = more aggressive filtering)',
				},
				// --- Content Filter: Pruning Threshold Type ---
				{
					displayName: 'Threshold Type',
					name: 'thresholdType',
					type: 'options',
					options: [
						{ name: 'Fixed', value: 'fixed', description: 'Use a fixed threshold value' },
						{ name: 'Dynamic', value: 'dynamic', description: 'Dynamically adjust threshold based on content' },
					],
					default: 'fixed',
					displayOptions: {
						show: {
							contentFilter: ['pruning'],
						},
					},
					description: 'How the pruning threshold should be applied',
				},
				// --- Content Filter: BM25 User Query ---
				{
					displayName: 'User Query',
					name: 'userQuery',
					type: 'string',
					default: '',
					required: true,
					displayOptions: {
						show: {
							contentFilter: ['bm25'],
						},
					},
					placeholder: 'pricing plans enterprise',
					description: 'Search query to score content blocks against using BM25',
				},
				// --- Fetch SSL Certificate ---
				{
					displayName: 'Fetch SSL Certificate',
					name: 'fetchSslCertificate',
					type: 'boolean',
					default: false,
					description: 'Whether to fetch and include SSL certificate information',
				},
				// --- Generate PDF ---
				{
					displayName: 'Generate PDF',
					name: 'pdf',
					type: 'boolean',
					default: false,
					description: 'Whether to generate a PDF of the page (returned as base64)',
				},
				// --- Include Links ---
				{
					displayName: 'Include Links',
					name: 'includeLinks',
					type: 'boolean',
					default: true,
					description: 'Whether to include discovered links (internal and external) in the output',
				},
				// --- Include Media ---
				{
					displayName: 'Include Media',
					name: 'includeMedia',
					type: 'boolean',
					default: false,
					description: 'Whether to include discovered media (images, videos, audio) in the output',
				},
				// --- Include Tables ---
				{
					displayName: 'Include Tables',
					name: 'includeTables',
					type: 'boolean',
					default: false,
					description: 'Whether to include extracted tables in the output',
				},
				// --- Markdown Output ---
				{
					displayName: 'Markdown Output',
					name: 'markdownOutput',
					type: 'options',
					options: [
						{ name: 'Raw Markdown', value: 'raw', description: 'Full unfiltered markdown' },
						{ name: 'Fit Markdown', value: 'fit', description: 'Filtered/cleaned markdown (requires content filter)' },
						{ name: 'Both', value: 'both', description: 'Include both raw and fit markdown' },
					],
					default: 'raw',
					description: 'Which markdown format to include in the output',
				},
				// --- Table Extraction ---
				{
					displayName: 'Table Extraction',
					name: 'tableExtraction',
					type: 'options',
					options: [
						{ name: 'None', value: 'none', description: 'No table extraction' },
						{ name: 'Default', value: 'default', description: 'Statistical table extraction' },
						{ name: 'LLM', value: 'llm', description: 'LLM-powered table extraction (requires LLM credentials)' },
					],
					default: 'none',
					description: 'Table extraction strategy',
				},
				// --- Table Extraction: Default Score Threshold ---
				{
					displayName: 'Score Threshold',
					name: 'tableScoreThreshold',
					type: 'number',
					default: 0.5,
					displayOptions: {
						show: {
							tableExtraction: ['default'],
						},
					},
					description: 'Minimum score for a table to be extracted (0-1)',
				},
				// --- Table Extraction: Default Verbose ---
				{
					displayName: 'Verbose',
					name: 'tableVerbose',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							tableExtraction: ['default'],
						},
					},
					description: 'Whether to enable verbose logging for default table extraction',
				},
				// --- Table Extraction: LLM CSS Selector ---
				{
					displayName: 'Table CSS Selector',
					name: 'tableCssSelector',
					type: 'string',
					default: '',
					placeholder: 'table.data-table',
					displayOptions: {
						show: {
							tableExtraction: ['llm'],
						},
					},
					description: 'CSS selector to target specific tables for LLM extraction',
				},
				// --- Table Extraction: LLM Chunk Token Threshold ---
				{
					displayName: 'Chunk Token Threshold',
					name: 'tableChunkTokenThreshold',
					type: 'number',
					default: 500,
					displayOptions: {
						show: {
							tableExtraction: ['llm'],
							tableEnableChunking: [true],
						},
					},
					description: 'Maximum tokens per chunk for LLM table extraction',
				},
				// --- Table Extraction: LLM Enable Chunking ---
				{
					displayName: 'Enable Chunking',
					name: 'tableEnableChunking',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							tableExtraction: ['llm'],
						},
					},
					description: 'Whether to split large tables into chunks for LLM processing',
				},
				// --- Table Extraction: LLM Max Parallel Chunks ---
				{
					displayName: 'Max Parallel Chunks',
					name: 'tableMaxParallelChunks',
					type: 'number',
					default: 3,
					displayOptions: {
						show: {
							tableExtraction: ['llm'],
							tableEnableChunking: [true],
						},
					},
					description: 'Maximum number of table chunks to process in parallel',
				},
				// --- Table Extraction: LLM Max Tries ---
				{
					displayName: 'Max Tries',
					name: 'tableMaxTries',
					type: 'number',
					default: 3,
					displayOptions: {
						show: {
							tableExtraction: ['llm'],
						},
					},
					description: 'Maximum number of LLM attempts for table extraction',
				},
				// --- Table Extraction: LLM Min Rows Per Chunk ---
				{
					displayName: 'Min Rows Per Chunk',
					name: 'tableMinRowsPerChunk',
					type: 'number',
					default: 5,
					displayOptions: {
						show: {
							tableExtraction: ['llm'],
							tableEnableChunking: [true],
						},
					},
					description: 'Minimum number of rows per chunk for LLM table extraction',
				},
				// --- Table Extraction: LLM Verbose ---
				{
					displayName: 'Verbose',
					name: 'tableLlmVerbose',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							tableExtraction: ['llm'],
						},
					},
					description: 'Whether to enable verbose logging for LLM table extraction',
				},
				// --- Verbose Response ---
				{
					displayName: 'Verbose Response',
					name: 'verbose',
					type: 'boolean',
					default: false,
					description: 'Whether to include additional debug information in the response',
				},
			],
		},
	];
}
