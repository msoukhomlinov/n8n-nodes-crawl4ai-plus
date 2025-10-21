# Missing Features Implementation Plan
**Date:** 2025-10-06  
**Goal:** Implement LLMContentFilter and Table Extraction to achieve A grade (95%+ API coverage)

---

## 🎯 Executive Summary

This document provides a systematic implementation plan for the two HIGH-priority gaps identified in the API Alignment QA:

1. **LLMContentFilter** - Intelligent markdown generation (2-3 hours estimated)
2. **Table Extraction** - Structured table data extraction (4-5 hours estimated)

**Total Estimated Time:** 6-8 hours  
**Expected Outcome:** Upgrade from B+ (86%) to A (95%+ feature coverage)

---

## 📊 Feature 1: LLMContentFilter Implementation

### Current State Analysis

**What Exists:**
```typescript
// nodes/Crawl4aiPlusBasicCrawler/helpers/utils.ts:311-349
export function createMarkdownGenerator(filterConfig: IDataObject): any {
  const generator: any = {
    type: 'DefaultMarkdownGenerator',
    params: {}
  };

  if (filterConfig.filterType === 'pruning') {
    generator.params.content_filter = {
      type: 'PruningContentFilter',
      params: { threshold, threshold_type, min_word_threshold }
    };
  } else if (filterConfig.filterType === 'bm25') {
    generator.params.content_filter = {
      type: 'BM25ContentFilter',
      params: { user_query, bm25_threshold }
    };
  }
  
  return generator;
}
```

**What's Missing:**
- `llm` filter type option
- LLMContentFilter parameters (instruction, chunk_token_threshold, ignore_cache, verbose)
- LLM credentials integration for filter

### Official API Target

From `llm_markdown_generator.py`:
```python
filter = LLMContentFilter(
    llm_config=LLMConfig(
        provider="openai/gpt-4o",
        api_token=os.getenv('OPENAI_API_KEY')
    ),
    chunk_token_threshold=8192,  # 2^12 * 2
    ignore_cache=True,
    instruction="""Extract main content while preserving original wording...""",
    verbose=True
)

markdown_generator = DefaultMarkdownGenerator(content_filter=filter)
config = CrawlerRunConfig(markdown_generator=markdown_generator)
```

### Implementation Steps

#### Step 1.1: Update UI Options (crawlSingleUrl.operation.ts)

**Location:** Lines 433-453 (Content Filter collection)

**Changes:**
```typescript
// Add new filter type option
{
  name: 'Filter Type',
  type: 'options',
  options: [
    { name: 'None', value: 'none' },
    { name: 'Pruning Filter', value: 'pruning' },
    { name: 'BM25 Filter', value: 'bm25' },
    { name: 'LLM Filter', value: 'llm', description: 'Intelligent content filtering using LLM' }  // NEW
  ]
}
```

**Add LLM-specific fields:**
```typescript
{
  displayName: 'LLM Instruction',
  name: 'llmInstruction',
  type: 'string',
  typeOptions: { rows: 8 },
  displayOptions: {
    show: { filterType: ['llm'] }
  },
  default: `Extract the main content while preserving its original wording and substance completely.
Remove only clearly irrelevant elements like:
- Navigation menus
- Advertisement sections
- Cookie notices
- Footers with site information
- Sidebars
- Any UI elements that don't contribute to the content`,
  description: 'Instructions for the LLM on how to filter content',
  required: true
},
{
  displayName: 'Chunk Token Threshold',
  name: 'chunkTokenThreshold',
  type: 'number',
  displayOptions: {
    show: { filterType: ['llm'] }
  },
  default: 8192,
  description: 'Maximum tokens per chunk for LLM processing (default: 8192)',
},
{
  displayName: 'Ignore Cache',
  name: 'ignoreCache',
  type: 'boolean',
  displayOptions: {
    show: { filterType: ['llm'] }
  },
  default: false,
  description: 'Whether to skip cache and always generate fresh filtered content',
},
{
  displayName: 'Verbose',
  name: 'verbose',
  type: 'boolean',
  displayOptions: {
    show: { filterType: ['llm'] }
  },
  default: false,
  description: 'Enable verbose logging for LLM content filtering',
}
```

**Estimated Time:** 30 minutes (including crawlMultipleUrls.operation.ts duplication)

---

#### Step 1.2: Update Helper Function (utils.ts)

**Location:** `nodes/Crawl4aiPlusBasicCrawler/helpers/utils.ts:311-349`

**Changes:**
```typescript
export function createMarkdownGenerator(filterConfig: IDataObject): any {
  const generator: any = {
    type: 'DefaultMarkdownGenerator',
    params: {}
  };

  if (filterConfig.filterType && filterConfig.filterType !== 'none') {
    if (filterConfig.filterType === 'pruning') {
      // Existing pruning logic...
    } else if (filterConfig.filterType === 'bm25') {
      // Existing BM25 logic...
    } else if (filterConfig.filterType === 'llm') {
      // NEW: LLM content filter
      generator.params.content_filter = {
        type: 'LLMContentFilter',
        params: {
          llm_config: filterConfig.llmConfig,  // Passed from execution
          instruction: filterConfig.llmInstruction || '',
          ...(filterConfig.chunkTokenThreshold !== undefined ? 
            { chunk_token_threshold: Number(filterConfig.chunkTokenThreshold) } : {}),
          ...(filterConfig.ignoreCache !== undefined ? 
            { ignore_cache: Boolean(filterConfig.ignoreCache) } : {}),
          ...(filterConfig.verbose !== undefined ? 
            { verbose: Boolean(filterConfig.verbose) } : {})
        }
      };
    }
  }

  // Markdown generation options
  if (filterConfig.ignoreLinks === true) {
    generator.params.options = {
      ...(generator.params.options || {}),
      ignore_links: true
    };
  }

  return generator;
}
```

**Estimated Time:** 15 minutes

---

#### Step 1.3: Wire LLM Credentials (crawlSingleUrl.operation.ts, crawlMultipleUrls.operation.ts)

**Location:** Execution logic where `createMarkdownGenerator()` is called

**Current Code (crawlSingleUrl.operation.ts:690-693):**
```typescript
if (contentFilter.filterType && contentFilter.filterType !== 'none') {
  crawlerConfig.markdownGenerator = createMarkdownGenerator(contentFilter);
}
```

**Updated Code:**
```typescript
if (contentFilter.filterType && contentFilter.filterType !== 'none') {
  // Build LLM config if using LLM filter
  const enrichedFilterConfig = { ...contentFilter };
  
  if (contentFilter.filterType === 'llm') {
    // Get LLM credentials from node credentials
    const credentials = await getCrawl4aiClient(this);
    const llmProvider = (credentials as any).llmProvider || 'openai/gpt-4o';
    const llmApiKey = (credentials as any).llmApiKey;
    
    if (!llmApiKey) {
      throw new NodeOperationError(
        this.getNode(),
        'LLM API key is required for LLM content filtering. Please configure it in the Crawl4AI credentials.'
      );
    }
    
    enrichedFilterConfig.llmConfig = {
      type: 'LLMConfig',
      params: {
        provider: llmProvider,
        api_token: llmApiKey
      }
    };
  }
  
  crawlerConfig.markdownGenerator = createMarkdownGenerator(enrichedFilterConfig);
}
```

**Note:** Need to verify LLM credentials structure in `credentials/Crawl4aiApi.credentials.ts`

**Estimated Time:** 30 minutes (including verification + duplication to crawlMultipleUrls)

---

#### Step 1.4: Testing & Validation

**Test Cases:**
1. ✅ UI displays LLM filter option
2. ✅ LLM-specific fields show/hide correctly
3. ✅ Execution retrieves LLM credentials properly
4. ✅ Error thrown if LLM credentials missing
5. ✅ API payload correctly formatted with LLMContentFilter structure
6. ✅ Manual test on sample page comparing output with/without LLM filter

**Estimated Time:** 45 minutes

---

**Total Feature 1 Time:** 2 hours

---

## 📊 Feature 2: Table Extraction Implementation

### Current State Analysis

**What Exists:**
- ✅ `tableScoreThreshold` parameter in `CrawlerRunConfig` interface (unused)
- ❌ No `table_extraction` strategy support
- ❌ No `result.tables` exposure in formatters
- ❌ No UI options for table extraction

**What's Missing:**
- Table extraction strategy configuration (UI + helpers)
- LLMTableExtraction strategy support
- DefaultTableExtraction strategy support
- Result formatter updates to expose `tables` array

### Official API Target

From `llm_table_extraction_example.py`:

**LLM Table Extraction:**
```python
llm_strategy = LLMTableExtraction(
    llm_config=LLMConfig(provider="openai/gpt-4.1-mini", api_token="env:OPENAI_API_KEY"),
    css_selector=".main-content",
    verbose=True,
    max_tries=2,
    enable_chunking=True,
    chunk_token_threshold=5000,
    min_rows_per_chunk=10,
    max_parallel_chunks=3
)

config = CrawlerRunConfig(table_extraction=llm_strategy)
result = await crawler.arun(url, config=config)

# result.tables = [
#   {
#     'headers': ['Col1', 'Col2'],
#     'rows': [['val1', 'val2']],
#     'caption': 'Table Title',
#     'metadata': { 'rowCount': 10, 'columnCount': 2 }
#   }
# ]
```

**Default Table Extraction:**
```python
default_strategy = DefaultTableExtraction(
    table_score_threshold=3,
    verbose=True
)
```

### Implementation Steps

#### Step 2.1: Update Interfaces (interfaces.ts)

**Location:** `nodes/Crawl4aiPlusBasicCrawler/helpers/interfaces.ts:71-165`

**Changes:**
```typescript
export interface CrawlerRunConfig {
  // ... existing fields ...
  
  // Extraction and Processing
  extractionStrategy?: any;
  chunkingStrategy?: any;
  markdownGenerator?: any;
  scrapingStrategy?: any;
  tableExtraction?: any;  // NEW: Add table extraction support
  proxyConfig?: object;
  
  // ... rest ...
}

export interface CrawlResult {
  // ... existing fields ...
  
  extracted_content?: string;
  tables?: TableResult[];  // NEW: Add tables array
  error_message?: string;
  
  // ... rest ...
}

// NEW: Table result interface
export interface TableResult {
  headers: string[];
  rows: string[][];
  caption?: string;
  metadata?: {
    rowCount: number;
    columnCount: number;
    hasRowspan?: boolean;
    hasColspan?: boolean;
    [key: string]: any;
  };
}
```

**Estimated Time:** 10 minutes

---

#### Step 2.2: Create Helper Function for Table Strategies (utils.ts)

**Location:** `nodes/Crawl4aiPlusBasicCrawler/helpers/utils.ts` (new function after line 349)

**New Function:**
```typescript
/**
 * Create table extraction strategy
 * @param strategyConfig Table extraction configuration
 * @returns Table extraction strategy configuration
 */
export function createTableExtractionStrategy(strategyConfig: IDataObject): any {
  const strategyType = strategyConfig.strategyType;
  
  if (!strategyType || strategyType === 'none') {
    return undefined;
  }
  
  if (strategyType === 'llm') {
    // LLM Table Extraction
    return {
      type: 'LLMTableExtraction',
      params: {
        llm_config: strategyConfig.llmConfig,  // Passed from execution
        ...(strategyConfig.cssSelector ? { css_selector: strategyConfig.cssSelector } : {}),
        ...(strategyConfig.verbose !== undefined ? { verbose: Boolean(strategyConfig.verbose) } : {}),
        ...(strategyConfig.maxTries !== undefined ? { max_tries: Number(strategyConfig.maxTries) } : {}),
        ...(strategyConfig.enableChunking !== undefined ? { enable_chunking: Boolean(strategyConfig.enableChunking) } : {}),
        ...(strategyConfig.chunkTokenThreshold !== undefined ? 
          { chunk_token_threshold: Number(strategyConfig.chunkTokenThreshold) } : {}),
        ...(strategyConfig.minRowsPerChunk !== undefined ? 
          { min_rows_per_chunk: Number(strategyConfig.minRowsPerChunk) } : {}),
        ...(strategyConfig.maxParallelChunks !== undefined ? 
          { max_parallel_chunks: Number(strategyConfig.maxParallelChunks) } : {})
      }
    };
  } else if (strategyType === 'default') {
    // Default Table Extraction
    return {
      type: 'DefaultTableExtraction',
      params: {
        ...(strategyConfig.tableScoreThreshold !== undefined ? 
          { table_score_threshold: Number(strategyConfig.tableScoreThreshold) } : {}),
        ...(strategyConfig.verbose !== undefined ? { verbose: Boolean(strategyConfig.verbose) } : {})
      }
    };
  }
  
  return undefined;
}
```

**Estimated Time:** 20 minutes

---

#### Step 2.3: Add UI Options (crawlSingleUrl.operation.ts)

**Location:** After Output Options collection (new collection)

**New Collection:**
```typescript
{
  displayName: 'Table Extraction',
  name: 'tableExtraction',
  type: 'collection',
  placeholder: 'Add Option',
  default: {},
  displayOptions: {
    show: {
      operation: ['crawlSingleUrl'],
    },
  },
  options: [
    {
      displayName: 'Strategy Type',
      name: 'strategyType',
      type: 'options',
      options: [
        {
          name: 'None',
          value: 'none',
          description: 'No table extraction',
        },
        {
          name: 'LLM Table Extraction',
          value: 'llm',
          description: 'Extract tables using LLM (handles complex tables with rowspan/colspan)',
        },
        {
          name: 'Default Table Extraction',
          value: 'default',
          description: 'Extract tables using heuristics (faster, simpler tables only)',
        },
      ],
      default: 'none',
      description: 'Table extraction strategy to use',
    },
    
    // LLM Strategy Options
    {
      displayName: 'CSS Selector',
      name: 'cssSelector',
      type: 'string',
      displayOptions: {
        show: {
          strategyType: ['llm'],
        },
      },
      default: '',
      placeholder: '.main-content',
      description: 'CSS selector to focus table extraction on specific page area (optional)',
    },
    {
      displayName: 'Enable Chunking',
      name: 'enableChunking',
      type: 'boolean',
      displayOptions: {
        show: {
          strategyType: ['llm'],
        },
      },
      default: false,
      description: 'Enable chunking for large tables',
    },
    {
      displayName: 'Chunk Token Threshold',
      name: 'chunkTokenThreshold',
      type: 'number',
      displayOptions: {
        show: {
          strategyType: ['llm'],
          enableChunking: [true],
        },
      },
      default: 10000,
      description: 'Maximum tokens per chunk when processing large tables',
    },
    {
      displayName: 'Min Rows Per Chunk',
      name: 'minRowsPerChunk',
      type: 'number',
      displayOptions: {
        show: {
          strategyType: ['llm'],
          enableChunking: [true],
        },
      },
      default: 20,
      description: 'Minimum number of rows per chunk',
    },
    {
      displayName: 'Max Parallel Chunks',
      name: 'maxParallelChunks',
      type: 'number',
      displayOptions: {
        show: {
          strategyType: ['llm'],
          enableChunking: [true],
        },
      },
      default: 5,
      description: 'Maximum number of chunks to process in parallel',
    },
    {
      displayName: 'Max Tries',
      name: 'maxTries',
      type: 'number',
      displayOptions: {
        show: {
          strategyType: ['llm'],
        },
      },
      default: 3,
      description: 'Maximum number of retry attempts for LLM extraction',
    },
    
    // Default Strategy Options
    {
      displayName: 'Table Score Threshold',
      name: 'tableScoreThreshold',
      type: 'number',
      displayOptions: {
        show: {
          strategyType: ['default'],
        },
      },
      default: 5,
      description: 'Minimum score for table to be included (default: 5)',
    },
    
    // Common Options
    {
      displayName: 'Verbose',
      name: 'verbose',
      type: 'boolean',
      displayOptions: {
        show: {
          strategyType: ['llm', 'default'],
        },
      },
      default: false,
      description: 'Enable verbose logging for table extraction',
    },
  ],
}
```

**Estimated Time:** 45 minutes (including crawlMultipleUrls duplication)

---

#### Step 2.4: Wire to Execution Logic (crawlSingleUrl.operation.ts)

**Location:** After markdown generator logic (around line 693)

**New Code:**
```typescript
// Add table extraction strategy if configured
const tableExtractionConfig = this.getNodeParameter('tableExtraction', i, {}) as IDataObject;
if (tableExtractionConfig.strategyType && tableExtractionConfig.strategyType !== 'none') {
  // Build LLM config if using LLM strategy
  const enrichedTableConfig = { ...tableExtractionConfig };
  
  if (tableExtractionConfig.strategyType === 'llm') {
    // Get LLM credentials
    const credentials = await getCrawl4aiClient(this);
    const llmProvider = (credentials as any).llmProvider || 'openai/gpt-4o';
    const llmApiKey = (credentials as any).llmApiKey;
    
    if (!llmApiKey) {
      throw new NodeOperationError(
        this.getNode(),
        'LLM API key is required for LLM table extraction. Please configure it in the Crawl4AI credentials.'
      );
    }
    
    enrichedTableConfig.llmConfig = {
      type: 'LLMConfig',
      params: {
        provider: llmProvider,
        api_token: llmApiKey
      }
    };
  }
  
  crawlerConfig.tableExtraction = createTableExtractionStrategy(enrichedTableConfig);
}
```

**Estimated Time:** 30 minutes (including crawlMultipleUrls duplication)

---

#### Step 2.5: Update API Client (apiClient.ts)

**Location:** `formatCrawlerConfig()` method (around line 277)

**Changes:**
```typescript
private formatCrawlerConfig(config: CrawlerRunConfig): any {
  const params: any = {};

  // ... existing params ...
  
  // NEW: Add table extraction
  if (config.tableExtraction) {
    params.table_extraction = config.tableExtraction;
  }
  
  // Use type/params wrapper ONLY if extraction strategy OR table extraction is present
  if (config.extractionStrategy || config.deepCrawlStrategy || config.tableExtraction) {
    return {
      type: 'CrawlerRunConfig',
      params: {
        ...params,
        ...(config.extractionStrategy ? { extraction_strategy: config.extractionStrategy } : {}),
        ...(config.deepCrawlStrategy ? { deep_crawl_strategy: config.deepCrawlStrategy } : {}),
        ...(config.tableExtraction ? { table_extraction: config.tableExtraction } : {})
      },
    };
  }
  
  // Return flat dict for simple params
  return Object.keys(params).length > 0 ? params : {};
}
```

**Estimated Time:** 15 minutes

---

#### Step 2.6: Update Result Formatter (formatters.ts)

**Location:** `formatCrawlResult()` function (around line 12)

**Changes:**
```typescript
export function formatCrawlResult(
  result: CrawlResult,
  includeMedia: boolean = false,
  verboseResponse: boolean = false,
  outputOptions?: {
    markdownOutput?: 'raw' | 'fit' | 'both';
    includeLinks?: boolean;
    includeScreenshot?: boolean;
    includePdf?: boolean;
    includeSslCertificate?: boolean;
    includeTables?: boolean;  // NEW
  },
): IDataObject {
  const formatted: IDataObject = {
    url: result.url,
    success: result.success,
    status_code: result.status_code,
    // ... existing fields ...
  };
  
  // ... existing logic ...
  
  // NEW: Add tables if present and requested
  if (outputOptions?.includeTables && result.tables && result.tables.length > 0) {
    formatted.tables = result.tables.map((table: TableResult) => ({
      headers: table.headers,
      rows: table.rows,
      ...(table.caption ? { caption: table.caption } : {}),
      ...(table.metadata ? { metadata: table.metadata } : {})
    }));
    formatted.tableCount = result.tables.length;
  }
  
  return formatted;
}
```

**Estimated Time:** 20 minutes

---

#### Step 2.7: Add Output Option for Tables

**Location:** Output Options collection (crawlSingleUrl.operation.ts)

**New Field:**
```typescript
{
  displayName: 'Include Tables',
  name: 'includeTables',
  type: 'boolean',
  default: true,
  description: 'Whether to include extracted tables in the output (if table extraction is enabled)',
}
```

**Update execution to pass this option:**
```typescript
const formattedResult = formatCrawlResult(
  result,
  outputOptions.includeMedia as boolean,
  outputOptions.verboseResponse as boolean,
  {
    markdownOutput: outputOptions.markdownOutput as 'raw' | 'fit' | 'both',
    includeLinks: outputOptions.includeLinks as boolean,
    includeScreenshot: outputOptions.screenshot as boolean,
    includePdf: outputOptions.pdf as boolean,
    includeSslCertificate: outputOptions.fetchSslCertificate as boolean,
    includeTables: outputOptions.includeTables as boolean,  // NEW
  }
);
```

**Estimated Time:** 15 minutes

---

#### Step 2.8: Testing & Validation

**Test Cases:**
1. ✅ UI displays table extraction options
2. ✅ LLM/Default strategy fields show/hide correctly
3. ✅ LLM credentials retrieved for LLM strategy
4. ✅ Error thrown if LLM credentials missing for LLM strategy
5. ✅ API payload correctly formatted with table_extraction
6. ✅ Manual test extracting tables from Wikipedia page
7. ✅ Verify tables array in output with correct structure
8. ✅ Test both LLM and default strategies
9. ✅ Test chunking with large tables
10. ✅ Verify metadata (rowCount, columnCount) included

**Estimated Time:** 1.5 hours

---

**Total Feature 2 Time:** 4 hours

---

## 📋 Implementation Sequence

### Phase 1: LLMContentFilter (Day 1, Morning)
**Duration:** 2 hours

1. ✅ Update crawlSingleUrl UI with LLM filter options (30 min)
2. ✅ Update crawlMultipleUrls UI with LLM filter options (15 min - copy/adapt)
3. ✅ Extend `createMarkdownGenerator()` helper (15 min)
4. ✅ Wire LLM credentials in execution logic (30 min)
5. ✅ Test with sample page (30 min)

### Phase 2: Table Extraction (Day 1, Afternoon)
**Duration:** 4 hours

1. ✅ Update interfaces (TableResult, CrawlerRunConfig) (10 min)
2. ✅ Create `createTableExtractionStrategy()` helper (20 min)
3. ✅ Add UI options to crawlSingleUrl (30 min)
4. ✅ Add UI options to crawlMultipleUrls (15 min - copy/adapt)
5. ✅ Wire to execution logic (30 min both operations)
6. ✅ Update API client `formatCrawlerConfig()` (15 min)
7. ✅ Update `formatCrawlResult()` formatter (20 min)
8. ✅ Add includeTables output option (15 min)
9. ✅ Test both strategies with Wikipedia tables (1.5 hours)

### Phase 3: Final QA & Documentation (Day 1, Late Afternoon)
**Duration:** 1 hour

1. ✅ Run full test suite with both features
2. ✅ Update `.cursorrules` scratchpad with completion
3. ✅ Create release notes summarising new features
4. ✅ Verify linting passes
5. ✅ Update QA report grade from B+ to A

---

## 🚨 Risk Analysis

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM credentials structure mismatch | Medium | Medium | Verify credential schema first, add fallback |
| API payload format incorrect for new strategies | Low | High | Test against Docker API examples directly |
| Output formatter breaks existing workflows | Low | High | Maintain backward compatibility, tables optional |
| LLM costs for users | Medium | Medium | Document costs clearly, provide default strategy alternative |

### Integration Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking changes to existing operations | Low | Critical | No changes to existing params, only additions |
| Performance impact from LLM calls | Medium | Medium | Add verbose logging, document performance expectations |
| Chunking logic errors for large tables | Medium | Medium | Use official example parameters as defaults |

---

## ✅ Success Criteria

### Feature 1: LLMContentFilter
- [  ] UI shows "LLM Filter" option in Content Filter collection
- [  ] LLM-specific parameters visible when selected
- [  ] LLM credentials correctly retrieved from node credentials
- [  ] Error thrown if LLM credentials missing
- [  ] API payload matches official example structure
- [  ] Manual test: Sample page with LLM filter produces cleaner markdown than without
- [  ] No regression: Existing Pruning/BM25 filters still work

### Feature 2: Table Extraction
- [  ] UI shows "Table Extraction" collection
- [  ] LLM/Default strategy options work correctly
- [  ] Strategy-specific parameters visible when selected
- [  ] API payload matches official example structure
- [  ] Tables array present in output when extraction enabled
- [  ] Table structure correct (headers, rows, caption, metadata)
- [  ] Both LLM and default strategies extract tables successfully
- [  ] Chunking works for large tables (Wikipedia test)
- [  ] No regression: Existing crawl operations still work

### Overall
- [  ] All linting checks pass
- [  ] API Alignment QA report updated: B+ → A grade
- [  ] `.cursorrules` scratchpad updated with completion
- [  ] No breaking changes to existing operations
- [  ] Zero invented features - all parameters match official API

---

## 📚 References

### Official Examples
- `docs/0.7.4/docs/examples/llm_markdown_generator.py`
- `docs/0.7.4/docs/examples/llm_table_extraction_example.py`

### Implementation Files
- `nodes/Crawl4aiPlusBasicCrawler/actions/crawlSingleUrl.operation.ts`
- `nodes/Crawl4aiPlusBasicCrawler/actions/crawlMultipleUrls.operation.ts`
- `nodes/Crawl4aiPlusBasicCrawler/helpers/utils.ts`
- `nodes/Crawl4aiPlusBasicCrawler/helpers/interfaces.ts`
- `nodes/Crawl4aiPlusBasicCrawler/helpers/apiClient.ts`
- `nodes/Crawl4aiPlusBasicCrawler/helpers/formatters.ts`

### Related Planning Documents
- `docs/planning/api-alignment-qa-report.md` (QA findings)
- `.cursorrules` (project rules and scratchpad)

---

**END OF IMPLEMENTATION PLAN**

