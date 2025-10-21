# Gap Analysis: n8n Nodes vs Crawl4AI Python Examples

**Date:** 2025-10-06  
**Examples Analysed:**
- `identity_based_browsing.py` - Persistent browser profiles for authenticated crawling
- `extraction_strategies_examples.py` - Different extraction strategies with multiple input formats

---

## Executive Summary

**Overall Alignment Grade: B+ (Good with Important Gaps)**

Our n8n nodes provide strong coverage of Crawl4AI's core functionality, particularly for:
- ✅ Basic and advanced crawling features
- ✅ Multiple extraction strategies (CSS, JSON, Regex, LLM)
- ✅ Content filtering (Pruning, BM25)
- ✅ Browser configuration and stealth features
- ✅ Deep/recursive crawling with keyword discovery

However, two critical use cases from the examples are **NOT fully supported**:
1. ❌ **Identity-based browsing** - Persistent profiles for authenticated sessions
2. ❌ **Extraction strategy input formats** - Different markdown/HTML input modes for LLM extraction

---

## Use Case 1: Identity-Based Browsing (Profile Management)

### What the Example Does

The `identity_based_browsing.py` example demonstrates:

```python
# Create browser config with persistent profile
browser_config = BrowserConfig(
    headless=False,
    use_managed_browser=True,  # Required for persistent profiles
    user_data_dir=profile_path  # Path to browser profile directory
)

# Crawl authenticated pages using saved profile
async with AsyncWebCrawler(config=browser_config) as crawler:
    result = await crawler.arun(url)
```

**Key Features:**
- Interactive profile creation and management
- Persistent browser context (cookies, localStorage, sessions)
- Ability to login once and reuse authenticated state
- Support for sites requiring authentication (GitHub, LinkedIn, Twitter, etc.)

### Current n8n Node Support

**Status: ⚠️ PARTIAL (Backend Only, No UI)**

#### What We Have:
The `BrowserConfig` interface **already includes** the necessary fields:
```typescript
// nodes/Crawl4aiPlusBasicCrawler/helpers/interfaces.ts
export interface BrowserConfig {
  use_managed_browser?: boolean;
  user_data_dir?: string;
  use_persistent_context?: boolean;
  storage_state?: string | object;
  cookies?: Array<object>;
}
```

The `createBrowserConfig()` helper supports:
- `cookies` - Manual cookie injection
- `headers` - Custom headers

#### What's Missing:
1. **No UI Fields** - Profile/context options not exposed in any node operation
2. **No Profile Management** - Cannot create, list, or delete browser profiles
3. **No Storage State** - Cannot save/load browser state (localStorage, cookies, etc.)
4. **No Managed Browser Mode** - `use_managed_browser` flag not accessible

### Gap Impact

**Severity: HIGH for authenticated workflows**

**Use Cases Blocked:**
- Scraping authenticated pages (social media profiles, private content)
- Maintaining login sessions across workflow runs
- Crawling user-specific dashboards or settings pages
- Testing authenticated web applications
- Multi-account management workflows

**Workaround Available:**
- Manual cookie management (cumbersome, expires quickly)
- Session ID headers (requires custom implementation)
- ❌ **No persistent profile workaround exists**

### Implementation Requirements

To support this use case, we need:

1. **Browser Options Collection Extension:**
   ```typescript
   {
     displayName: 'Use Persistent Profile',
     name: 'usePersistentContext',
     type: 'boolean',
     default: false,
   },
   {
     displayName: 'Profile Directory',
     name: 'userDataDir',
     type: 'string',
     displayOptions: { show: { usePersistentContext: [true] } },
     placeholder: '/path/to/profile',
     description: 'Path to browser profile directory (for authenticated sessions)',
   }
   ```

2. **Helper Extension:**
   ```typescript
   // utils.ts
   if (options.usePersistentContext === true) {
     config.use_managed_browser = true;
     config.use_persistent_context = true;
   }
   
   if (options.userDataDir) {
     config.user_data_dir = String(options.userDataDir);
   }
   ```

3. **Storage State Support:**
   ```typescript
   {
     displayName: 'Storage State (JSON)',
     name: 'storageState',
     type: 'string',
     typeOptions: { rows: 4 },
     placeholder: '{"cookies": [...], "origins": [...]}',
   }
   ```

**Estimated Effort:** 2-3 hours (UI + helper mapping + testing)

---

## Use Case 2: Extraction Strategy Input Formats

### What the Example Does

The `extraction_strategies_examples.py` demonstrates different **input formats** for extraction strategies:

```python
# 1. LLM with raw markdown input (default)
markdown_strategy = LLMExtractionStrategy(
    llm_config=LLMConfig(provider="openai/gpt-4o-mini"),
    instruction="Extract product info",
)

# 2. LLM with HTML input
html_strategy = LLMExtractionStrategy(
    input_format="html",  # 🚨 THIS IS THE KEY PARAMETER
    llm_config=LLMConfig(provider="openai/gpt-4o-mini"),
    instruction="Extract from HTML including structured data",
)

# 3. LLM with cleaned markdown input
fit_markdown_strategy = LLMExtractionStrategy(
    input_format="fit_markdown",  # 🚨 Requires content filter
    llm_config=LLMConfig(provider="openai/gpt-4o-mini"),
    instruction="Extract from cleaned markdown",
)

# Configure markdown generator with content filter
config = CrawlerRunConfig(
    extraction_strategy=fit_markdown_strategy,
    markdown_generator=DefaultMarkdownGenerator(
        content_filter=PruningContentFilter()  # Required for fit_markdown
    ),
)
```

**Key Insight:**
- Different formats optimise for different use cases:
  - **markdown** (default) - Good for text-heavy content, faster
  - **html** - Good for structured data, preserves DOM structure
  - **fit_markdown** - Best for focused extraction, removes noise

### Current n8n Node Support

**Status: ❌ NOT SUPPORTED**

#### What We Have:
Our `createLlmExtractionStrategy()` function is **hardcoded** without `input_format`:

```typescript
// nodes/Crawl4aiPlusContentExtractor/helpers/utils.ts
export function createLlmExtractionStrategy(
  schema: LlmSchema,
  instruction: string,
  provider: string,
  apiKey?: string,
  baseUrl?: string,
): any {
  return {
    type: 'LLMExtractionStrategy',
    params: {
      llm_config: { ... },
      instruction,
      schema: { ... },
      extraction_type: 'schema',
      apply_chunking: false,
      force_json_response: true,
      // 🚨 input_format is MISSING
    },
  };
}
```

We **DO** support content filtering (added in baseline config QA):
```typescript
// createMarkdownGenerator() exists and supports:
- PruningContentFilter
- BM25ContentFilter
```

But there's **no connection** between content filtering and extraction strategy input format.

#### What's Missing:
1. **`input_format` parameter** not included in LLMExtractionStrategy params
2. **UI selector** for choosing input format (markdown/html/fit_markdown)
3. **Integration** between content filter selection and input_format
4. **CSS/Regex extractors** also don't expose input format (though they typically use HTML)

### Gap Impact

**Severity: MEDIUM (Quality & Performance)**

**Use Cases Affected:**
- ❌ Cannot extract from cleaned markdown (fit_markdown requires this)
- ❌ Cannot optimise LLM prompts for HTML structure vs markdown text
- ❌ May get suboptimal extraction results without format control
- ✅ Default (markdown) works for most cases
- ✅ Can still use content filters independently

**Performance Impact:**
- **HTML input** is larger → more LLM tokens → slower + costlier
- **fit_markdown** is cleaner → fewer tokens → faster + cheaper
- Users cannot optimise based on their needs

### Implementation Requirements

To support this use case, we need:

1. **LLM Options Extension:**
   ```typescript
   {
     displayName: 'Input Format',
     name: 'inputFormat',
     type: 'options',
     options: [
       {
         name: 'Markdown (Default)',
         value: 'markdown',
         description: 'Extract from raw markdown (fast, text-focused)',
       },
       {
         name: 'HTML',
         value: 'html',
         description: 'Extract from HTML (preserves structure, good for structured data)',
       },
       {
         name: 'Fit Markdown (Cleaned)',
         value: 'fit_markdown',
         description: 'Extract from cleaned markdown (requires content filter, best quality)',
       },
     ],
     default: 'markdown',
     description: 'Format of content passed to LLM',
   }
   ```

2. **Helper Update:**
   ```typescript
   export function createLlmExtractionStrategy(
     schema: LlmSchema,
     instruction: string,
     provider: string,
     apiKey?: string,
     baseUrl?: string,
     inputFormat?: 'markdown' | 'html' | 'fit_markdown',  // NEW
   ): any {
     const params: any = {
       llm_config: { ... },
       instruction,
       schema: { ... },
       extraction_type: 'schema',
       apply_chunking: false,
       force_json_response: true,
     };
     
     // Add input_format if specified (API uses default 'markdown' if omitted)
     if (inputFormat && inputFormat !== 'markdown') {
       params.input_format = inputFormat;
     }
     
     return {
       type: 'LLMExtractionStrategy',
       params,
     };
   }
   ```

3. **Execution Integration:**
   ```typescript
   const inputFormat = llmOptions.inputFormat as 'markdown' | 'html' | 'fit_markdown' | undefined;
   
   const extractionStrategy = createLlmExtractionStrategy(
     schema,
     instruction,
     provider,
     apiKey,
     baseUrl,
     inputFormat  // Pass through
   );
   ```

4. **Documentation Note:**
   Add hint that `fit_markdown` requires a content filter to be configured in the Content Filter Options collection.

**Estimated Effort:** 1-2 hours (UI + helper + execution + testing)

---

## Use Case 3: Content Filtering & Markdown Generation

### What the Example Does

```python
# Configure markdown generator with content filter
config = CrawlerRunConfig(
    extraction_strategy=strategy,
    markdown_generator=DefaultMarkdownGenerator(
        content_filter=PruningContentFilter()  # Cleans content for fit_markdown
    ),
)
```

### Current n8n Node Support

**Status: ✅ FULLY SUPPORTED**

We implemented this during the **Baseline Configuration QA & Implementation** (completed 2025-10-06):

```typescript
// Content Filter Options collection (crawlSingleUrl.operation.ts)
{
  displayName: 'Content Filter Type',
  name: 'contentFilterType',
  type: 'options',
  options: [
    { name: 'None', value: 'none' },
    { name: 'Pruning Filter', value: 'pruning' },
    { name: 'BM25 Filter', value: 'bm25' },
  ],
}

// Helper function (utils.ts)
export function createMarkdownGenerator(
  contentFilterType: string,
  threshold?: number,
  ...
): any {
  // Supports both PruningContentFilter and BM25ContentFilter
}
```

**Coverage: Complete** ✅

---

## Comparison Matrix

| Feature | Example Shows | n8n Support | Status | Priority |
|---------|---------------|-------------|--------|----------|
| **Identity-Based Browsing** |
| Persistent browser profiles | ✅ | ❌ | Missing | HIGH |
| `user_data_dir` configuration | ✅ | Backend only | Not exposed | HIGH |
| `storage_state` save/load | ✅ | Backend only | Not exposed | MEDIUM |
| `use_managed_browser` flag | ✅ | Backend only | Not exposed | HIGH |
| Cookie injection | ✅ | ✅ | Supported | ✅ |
| **Extraction Input Formats** |
| `input_format` parameter | ✅ | ❌ | Missing | MEDIUM |
| Markdown input (default) | ✅ | ✅ (implicit) | Supported | ✅ |
| HTML input format | ✅ | ❌ | Not available | MEDIUM |
| fit_markdown input format | ✅ | ❌ | Not available | MEDIUM |
| **Content Filtering** |
| PruningContentFilter | ✅ | ✅ | Supported | ✅ |
| BM25ContentFilter | ✅ | ✅ | Supported | ✅ |
| Markdown generator config | ✅ | ✅ | Supported | ✅ |
| **Browser Config** |
| Multiple browser types | ✅ | ✅ | Supported | ✅ |
| Headless/headed mode | ✅ | ✅ | Supported | ✅ |
| Viewport configuration | ✅ | ✅ | Supported | ✅ |
| Stealth mode | ✅ | ✅ | Supported | ✅ |
| **Extraction Strategies** |
| CSS extraction | ✅ | ✅ | Supported | ✅ |
| XPath extraction | ✅ | ❌ | Not available | LOW |
| LLM extraction | ✅ | ✅ | Supported | ✅ |
| Regex extraction | ❌ | ✅ | Extra feature | ✅ |

---

## Recommendations

### Immediate Priority (High Impact, Low Effort)

1. **Add Extraction Input Format Support** (1-2 hours)
   - Add `inputFormat` option to LLM extractor
   - Update `createLlmExtractionStrategy()` helper
   - Low risk, high value for LLM optimisation

2. **Expose Browser Profile Options** (2-3 hours)
   - Add `usePersistentContext` and `userDataDir` to browser options
   - Map to backend fields in helper
   - Unlocks authenticated crawling workflows

### Secondary Priority (Medium Impact)

3. **Add Storage State Support** (2-3 hours)
   - Allow JSON storage state input
   - Enable session save/restore workflows
   - Complement profile directory approach

4. **XPath Extraction Strategy** (3-4 hours)
   - Example shows `JsonXPathExtractionStrategy`
   - We only support CSS selectors
   - Lower priority (CSS covers most use cases)

### Documentation Improvements

5. **Document Authenticated Crawling Patterns** (1 hour)
   - Once profile support is added
   - Show how to login once and reuse profile
   - Include storage state examples

6. **Document Input Format Best Practices** (1 hour)
   - When to use markdown vs HTML vs fit_markdown
   - Token cost implications
   - Content filter integration

---

## Conclusion

Our n8n nodes provide **excellent coverage** of Crawl4AI's core functionality, including recent additions like deep crawling, content filtering, and anti-bot features.

The **two main gaps** are:
1. **Identity-based browsing** - Backend support exists but not exposed in UI
2. **Extraction input formats** - Not implemented at all

Both gaps are **relatively easy to fix** (4-5 hours total) and would significantly enhance the nodes' capabilities for:
- Authenticated scraping workflows
- LLM extraction optimisation
- Token cost management
- Enterprise use cases requiring session persistence

**Recommended Action:** Implement both features before v1.0 release to achieve feature parity with official Python examples.

---

## Appendix: API Coverage Verification

### Verified Against Official Examples:
- ✅ `identity_based_browsing.py` - Lines 29-38 (BrowserConfig)
- ✅ `extraction_strategies_examples.py` - Lines 62-112 (Strategies)
- ✅ Crawl4AI 0.7.4 REST API documentation
- ✅ Official Docker test suite (`test_rest_api_deep_crawl.py`)

### Related Documentation:
- `docs/planning/baseline-config-qa-report.md` - Content filtering implementation
- `docs/planning/deep-crawl-qa-final-report.md` - Deep crawl feature verification
- `.cursorrules` - Project rules and implementation history

