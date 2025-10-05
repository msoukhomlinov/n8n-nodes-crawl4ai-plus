# Adaptive Crawling Implementation Plan
**Project**: n8n-nodes-crawl4j  
**Feature**: P1-7 - Adaptive Crawling (NEW in Crawl4AI 0.7.x)  
**Date**: 2025-10-05  
**Status**: PLANNING PHASE  
**Priority**: HIGH (Final Priority 1 Item)

---

## Executive Summary

Adaptive Crawling is the **flagship feature of Crawl4AI 0.7.x**, introducing intelligent, query-driven web crawling that automatically determines when sufficient information has been gathered. This is fundamentally different from traditional crawling approaches.

### Why This Matters
- ✅ **Intelligence**: Crawler learns and adapts based on information gain
- ✅ **Efficiency**: Stops crawling when sufficient data is collected (prevents over-crawling)
- ✅ **Relevance**: Query-driven approach ensures focused results
- ✅ **User Experience**: Perfect for research, Q&A, knowledge base building

### Complexity Assessment: **HIGH**
- **Estimated Implementation Time**: 4-6 hours
- **Key Challenges**: 
  - Different API paradigm (digest-based vs traditional crawl)
  - State management (save/resume crawls)
  - Result ranking and relevance scoring
  - Strategy configuration (statistical vs embedding)

---

## Phase 1: Research & Architecture Design

### 1.1 API Integration Research

#### Key Questions to Answer:
- [ ] **Q1**: Does Crawl4AI Docker API expose `/adaptive` or `/digest` endpoint?
- [ ] **Q2**: What is the exact request/response format?
- [ ] **Q3**: How does it differ from the standard `/crawl` endpoint?
- [ ] **Q4**: Does the API support state persistence (resume_from)?
- [ ] **Q5**: Are statistics (coverage, consistency, saturation) returned?

#### Research Actions:
1. **Check Official Documentation**:
   - https://docs.crawl4ai.com/api/adaptive-crawler/
   - https://docs.crawl4ai.com/basic/docker-deployment/

2. **Test Against Docker API**:
   ```bash
   # Start Crawl4AI Docker instance
   docker run -p 11235:11235 unclecode/crawl4ai:0.7.0
   
   # Test adaptive endpoint
   curl -X POST http://localhost:11235/adaptive \
     -H "Content-Type: application/json" \
     -d '{
       "start_url": "https://docs.python.org/3/",
       "query": "async context managers",
       "config": {
         "confidence_threshold": 0.7,
         "max_pages": 10,
         "strategy": "statistical"
       }
     }'
   ```

3. **Search for API Examples**:
   - GitHub issues/discussions
   - Docker API demo files
   - Community examples

---

### 1.2 Architectural Decision: Operation vs New Node

#### Option A: New Operation in Existing Node ✅ **RECOMMENDED**
**Location**: `Crawl4aiBasicCrawler` → Add "Adaptive Crawl" operation

**Pros**:
- ✅ Consistent with existing architecture
- ✅ Users already understand node structure
- ✅ Easy to add to existing workflows
- ✅ Reuses existing credential setup
- ✅ Minimal structural changes

**Cons**:
- ⚠️ BasicCrawler becomes more complex
- ⚠️ Different output format than other operations

**Implementation Path**:
```
nodes/Crawl4aiBasicCrawler/actions/
  ├── adaptiveCrawl.operation.ts  ← NEW FILE
  ├── operations.ts               ← UPDATE (add new operation)
  └── router.ts                   ← UPDATE (route to new operation)
```

---

#### Option B: Separate "Crawl4aiAdaptive" Node ❌ **NOT RECOMMENDED**
**Location**: New top-level node

**Pros**:
- ✅ Clean separation of concerns
- ✅ Can have specialized UI/UX
- ✅ Won't clutter BasicCrawler

**Cons**:
- ❌ Increases package complexity
- ❌ Duplicate credential setup
- ❌ Users need to learn new node
- ❌ Harder to maintain consistency
- ❌ Overkill for single feature

---

### 1.3 Final Architectural Decision

**DECISION**: Implement as new operation in `Crawl4aiBasicCrawler` node ✅

**Rationale**:
1. Adaptive crawling is still fundamentally "crawling" - fits the node's purpose
2. Consistent with how we added RegexExtractor to ContentExtractor
3. Minimizes user learning curve
4. Reuses existing infrastructure (credentials, API client, error handling)
5. Can be enhanced incrementally without structural changes

---

## Phase 2: UI/UX Design

### 2.1 Operation Parameters

#### Core Parameters (Required):

1. **URL** (string, required)
   - Display Name: "Start URL"
   - Description: "Starting URL for adaptive crawling"
   - Placeholder: "https://docs.example.com"
   - Type: string

2. **Query** (string, required)
   - Display Name: "Search Query"
   - Description: "Query that guides the crawling process"
   - Placeholder: "python async patterns"
   - Type: string
   - **Critical**: This is what makes adaptive crawling "adaptive"

---

#### Strategy Configuration:

3. **Strategy** (options, default: "statistical")
   - Display Name: "Crawling Strategy"
   - Description: "Method used to evaluate information sufficiency"
   - Options:
     - `statistical` (Default) - Fast, term-based analysis
     - `embedding` - Semantic understanding (slower, more accurate)
   - Type: options

4. **Confidence Threshold** (number, default: 0.7)
   - Display Name: "Confidence Threshold"
   - Description: "Stop crawling when this confidence level is reached (0.0-1.0)"
   - Default: 0.7
   - Range: 0.0 - 1.0
   - Type: number

5. **Max Pages** (number, default: 20)
   - Display Name: "Maximum Pages"
   - Description: "Maximum number of pages to crawl"
   - Default: 20
   - Type: number

6. **Top K Links** (number, default: 3)
   - Display Name: "Links Per Page"
   - Description: "Number of most relevant links to follow from each page"
   - Default: 3
   - Type: number

7. **Min Gain Threshold** (number, default: 0.1)
   - Display Name: "Minimum Information Gain"
   - Description: "Minimum expected information gain to continue (0.0-1.0)"
   - Default: 0.1
   - Range: 0.0 - 1.0
   - Type: number

---

#### Embedding Strategy Options (displayed only when strategy = "embedding"):

8. **Embedding Model** (string, default: "sentence-transformers/all-MiniLM-L6-v2")
   - Display Name: "Embedding Model"
   - Description: "Model to use for semantic embeddings"
   - Default: "sentence-transformers/all-MiniLM-L6-v2"
   - displayOptions: { show: { strategy: ['embedding'] } }

9. **Query Variations** (number, default: 10)
   - Display Name: "Query Variations"
   - Description: "Number of query variations to generate"
   - Default: 10
   - displayOptions: { show: { strategy: ['embedding'] } }

10. **Embedding LLM Provider** (options, optional)
    - Display Name: "LLM for Query Expansion"
    - Description: "LLM provider for generating query variations (optional)"
    - Options: Same as LLM extractor (OpenAI, Anthropic, etc.)
    - displayOptions: { show: { strategy: ['embedding'] } }

---

#### State Management:

11. **Save State** (boolean, default: false)
    - Display Name: "Save Crawl State"
    - Description: "Save progress for resuming later"
    - Default: false

12. **State Path** (string, optional)
    - Display Name: "State File Path"
    - Description: "Path to save/load crawl state (JSON)"
    - Placeholder: "/tmp/crawl_state.json"
    - displayOptions: { show: { saveState: [true] } }

13. **Resume From** (string, optional)
    - Display Name: "Resume From State"
    - Description: "Path to existing state file to resume from"
    - Placeholder: "/tmp/crawl_state.json"

---

#### Result Options:

14. **Top K Results** (number, default: 5)
    - Display Name: "Number of Results"
    - Description: "Number of most relevant pages to return"
    - Default: 5

15. **Include Statistics** (boolean, default: true)
    - Display Name: "Include Statistics"
    - Description: "Include coverage, consistency, and saturation scores"
    - Default: true

---

### 2.2 Parameter Organization

**Group 1: Core Settings**
- URL
- Query
- Strategy

**Group 2: Crawl Limits** (collapsible)
- Confidence Threshold
- Max Pages
- Top K Links
- Min Gain Threshold

**Group 3: Embedding Strategy Options** (conditional, collapsible)
- Embedding Model
- Query Variations
- Embedding LLM Provider

**Group 4: State Management** (collapsible)
- Save State
- State Path
- Resume From

**Group 5: Result Options** (collapsible)
- Top K Results
- Include Statistics

---

## Phase 3: API Integration

### 3.1 API Request Format (Hypothetical - Needs Verification)

Based on Crawl4AI documentation, the expected API call structure:

```typescript
// Hypothetical endpoint - NEEDS VERIFICATION
POST /adaptive/digest

{
  "start_url": "https://docs.python.org/3/",
  "query": "async context managers",
  "config": {
    "strategy": "statistical",
    "confidence_threshold": 0.7,
    "max_pages": 20,
    "top_k_links": 3,
    "min_gain_threshold": 0.1,
    
    // For embedding strategy
    "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
    "n_query_variations": 10,
    "embedding_llm_config": {
      "provider": "openai/gpt-4o-mini",
      "api_token": "sk-...",
      "temperature": 0.7
    },
    
    // State management
    "save_state": true,
    "state_path": "/tmp/state.json"
  },
  "resume_from": null
}
```

---

### 3.2 Expected Response Format

```typescript
{
  "success": true,
  "result": {
    // Crawl state
    "crawled_urls": ["url1", "url2", "..."],
    "visited_urls": ["url1", "url2", "..."],
    
    // Knowledge base (all extracted content)
    "knowledge_base": [
      {
        "url": "https://...",
        "content": "markdown content",
        "metadata": {},
        "relevance_score": 0.95
      }
    ],
    
    // Metrics
    "metrics": {
      "coverage": 0.85,
      "consistency": 0.78,
      "saturation": 0.82,
      "confidence": 0.81
    },
    
    // State information
    "is_sufficient": true,
    "pages_crawled": 15,
    "strategy_used": "statistical"
  }
}
```

---

### 3.3 API Client Updates

**File**: `nodes/Crawl4aiBasicCrawler/helpers/apiClient.ts`

Add new method:

```typescript
async adaptiveCrawl(
  startUrl: string,
  query: string,
  config: AdaptiveConfig,
  resumeFrom?: string
): Promise<AdaptiveResult> {
  const endpoint = this.determineAdaptiveEndpoint(); // '/adaptive/digest' or '/adaptive'?
  
  const payload = {
    start_url: startUrl,
    query: query,
    config: this.formatAdaptiveConfig(config),
    resume_from: resumeFrom || null
  };
  
  const response = await this.post(endpoint, payload);
  return this.parseAdaptiveResponse(response);
}

private formatAdaptiveConfig(config: AdaptiveConfig): object {
  // Convert n8n parameters to API format
  // Handle embedding strategy conditionally
  // Handle LLM config if provided
}

private parseAdaptiveResponse(response: any): AdaptiveResult {
  // Parse and validate response
  // Extract knowledge base
  // Extract metrics
  // Handle errors
}
```

---

## Phase 4: Result Processing & Output Format

### 4.1 Output Schema

The operation should return a rich, structured output:

```json
{
  "json": {
    // Summary
    "summary": {
      "query": "async context managers",
      "startUrl": "https://docs.python.org/3/",
      "pagesCrawled": 15,
      "confidence": 0.81,
      "strategy": "statistical",
      "isSufficient": true
    },
    
    // Most relevant pages (top K)
    "results": [
      {
        "url": "https://docs.python.org/3/reference/datamodel.html#context-managers",
        "title": "Context Managers",
        "relevanceScore": 0.95,
        "content": "Markdown content here...",
        "metadata": {
          "wordCount": 1250,
          "crawlDepth": 2
        }
      }
    ],
    
    // Statistics (if enabled)
    "statistics": {
      "coverage": 0.85,
      "consistency": 0.78,
      "saturation": 0.82,
      "confidence": 0.81
    },
    
    // All crawled URLs
    "crawledUrls": ["url1", "url2", "..."],
    
    // State information
    "stateInfo": {
      "savedTo": "/tmp/state.json",
      "canResume": true
    }
  }
}
```

---

### 4.2 Formatter Implementation

**File**: `nodes/Crawl4aiBasicCrawler/helpers/formatters.ts`

Add new formatter:

```typescript
export function formatAdaptiveResult(
  result: AdaptiveResult,
  query: string,
  startUrl: string,
  topK: number,
  includeStats: boolean
): INodeExecutionData {
  
  // Sort knowledge base by relevance
  const sortedResults = result.knowledge_base
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, topK);
  
  // Build output
  return {
    json: {
      summary: {
        query,
        startUrl,
        pagesCrawled: result.pages_crawled,
        confidence: result.metrics.confidence,
        strategy: result.strategy_used,
        isSufficient: result.is_sufficient
      },
      results: sortedResults.map(page => ({
        url: page.url,
        title: page.metadata?.title || extractTitle(page.content),
        relevanceScore: page.relevance_score,
        content: page.content,
        metadata: page.metadata
      })),
      statistics: includeStats ? result.metrics : undefined,
      crawledUrls: result.crawled_urls,
      stateInfo: result.state_path ? {
        savedTo: result.state_path,
        canResume: true
      } : undefined
    }
  };
}
```

---

## Phase 5: Error Handling & Edge Cases

### 5.1 Error Scenarios

1. **API Endpoint Not Available**
   - Error: "Adaptive crawling not supported by this Crawl4AI version"
   - Suggestion: "Please upgrade to Crawl4AI 0.7.0+"

2. **Query Too Vague**
   - Error: "Insufficient information found for query"
   - Suggestion: "Try a more specific query or lower confidence threshold"

3. **Max Pages Reached**
   - Warning: "Reached maximum pages without sufficient confidence"
   - Action: Return partial results with warning

4. **State File Issues**
   - Error: "Cannot read state file"
   - Error: "Cannot save state file"
   - Validation: Check file paths

5. **Embedding Strategy Without LLM**
   - Error: "Embedding strategy requires LLM configuration"
   - Suggestion: "Provide LLM provider or use statistical strategy"

---

### 5.2 Validation Logic

```typescript
// Pre-flight validation
function validateAdaptiveParams(params: AdaptiveParams): ValidationResult {
  const errors: string[] = [];
  
  // Required fields
  if (!params.url) errors.push("Start URL is required");
  if (!params.query) errors.push("Search query is required");
  
  // Range validation
  if (params.confidenceThreshold < 0 || params.confidenceThreshold > 1) {
    errors.push("Confidence threshold must be between 0.0 and 1.0");
  }
  
  // Strategy validation
  if (params.strategy === 'embedding' && !params.embeddingModel) {
    errors.push("Embedding strategy requires embedding model");
  }
  
  // State file validation
  if (params.saveState && !params.statePath) {
    errors.push("State path required when save state is enabled");
  }
  
  return { valid: errors.length === 0, errors };
}
```

---

## Phase 6: Implementation Checklist

### 6.1 Files to Create

- [ ] `nodes/Crawl4aiBasicCrawler/actions/adaptiveCrawl.operation.ts` (NEW)
  - [ ] Parameter definitions
  - [ ] Execute function
  - [ ] Validation logic
  - [ ] Error handling

---

### 6.2 Files to Modify

- [ ] `nodes/Crawl4aiBasicCrawler/actions/operations.ts`
  - [ ] Add `adaptiveCrawl` to operations list
  
- [ ] `nodes/Crawl4aiBasicCrawler/actions/router.ts`
  - [ ] Add route to `adaptiveCrawl` operation
  
- [ ] `nodes/Crawl4aiBasicCrawler/helpers/apiClient.ts`
  - [ ] Add `adaptiveCrawl()` method
  - [ ] Add `formatAdaptiveConfig()` helper
  - [ ] Add `parseAdaptiveResponse()` helper
  
- [ ] `nodes/Crawl4aiBasicCrawler/helpers/formatters.ts`
  - [ ] Add `formatAdaptiveResult()` function
  
- [ ] `nodes/Crawl4aiBasicCrawler/helpers/interfaces.ts`
  - [ ] Add `AdaptiveConfig` interface
  - [ ] Add `AdaptiveResult` interface
  - [ ] Add `AdaptiveParams` interface

---

### 6.3 Testing Checklist

- [ ] **Basic Functionality**
  - [ ] Test with statistical strategy
  - [ ] Test with embedding strategy
  - [ ] Verify result ranking
  - [ ] Check confidence scoring

- [ ] **Configuration**
  - [ ] Test different confidence thresholds
  - [ ] Test max pages limit
  - [ ] Test top K links parameter
  - [ ] Test query variations (embedding)

- [ ] **State Management**
  - [ ] Save state functionality
  - [ ] Resume from state
  - [ ] State file validation

- [ ] **Error Handling**
  - [ ] Invalid URL
  - [ ] Missing query
  - [ ] API errors
  - [ ] State file errors

- [ ] **Edge Cases**
  - [ ] Very broad query
  - [ ] Very specific query
  - [ ] Query with no results
  - [ ] Max pages without confidence

---

## Phase 7: Documentation & Examples

### 7.1 Documentation Updates

1. **README.md**
   - [ ] Add Adaptive Crawling section
   - [ ] Explain use cases
   - [ ] Add examples

2. **Operation Description**
   - [ ] Clear explanation of what it does
   - [ ] When to use vs traditional crawl
   - [ ] Strategy comparison

3. **Parameter Documentation**
   - [ ] Each parameter clearly explained
   - [ ] Best practices for configuration
   - [ ] Strategy selection guide

---

### 7.2 Example Workflows

**Example 1: Research Assistant**
```
Goal: Find comprehensive information about "Python async patterns"
Configuration:
- Strategy: Statistical
- Confidence: 0.7
- Max Pages: 20
Use Case: Building knowledge base for documentation
```

**Example 2: Semantic Search**
```
Goal: Deep understanding of "machine learning optimization techniques"
Configuration:
- Strategy: Embedding
- Confidence: 0.8
- Query Variations: 15
Use Case: Academic research compilation
```

**Example 3: Resume Previous Crawl**
```
Goal: Continue interrupted crawl
Configuration:
- Resume From: /tmp/previous_state.json
Use Case: Handling long-running crawls
```

---

## Phase 8: Risk Assessment & Mitigation

### 8.1 Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| API endpoint doesn't exist | HIGH | Test against Docker first, fallback gracefully |
| Response format differs | MEDIUM | Defensive parsing, version detection |
| State persistence issues | MEDIUM | Validate paths, handle I/O errors |
| Embedding strategy complexity | LOW | Make it optional, default to statistical |
| Long execution times | LOW | Show progress, allow interruption |

---

### 8.2 User Experience Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Too many parameters | MEDIUM | Smart defaults, collapsible groups |
| Unclear query formulation | HIGH | Examples, placeholders, documentation |
| Unexpected results | MEDIUM | Clear output format, include metrics |
| Confusion with traditional crawl | HIGH | Clear operation naming, descriptions |

---

## Phase 9: Success Criteria

### 9.1 Functional Requirements

- [X] Operation accessible from Crawl4aiBasicCrawler node
- [ ] Successfully integrates with Crawl4AI Docker API
- [ ] Returns ranked, relevant results based on query
- [ ] Supports both statistical and embedding strategies
- [ ] Handles state persistence (save/resume)
- [ ] Provides meaningful error messages

---

### 9.2 Quality Requirements

- [ ] TypeScript compiles without errors
- [ ] All parameters properly validated
- [ ] Output format consistent with other operations
- [ ] Error handling covers all scenarios
- [ ] Documentation complete and clear
- [ ] Tested against real Crawl4AI instance

---

### 9.3 User Acceptance

- [ ] Users can formulate effective queries
- [ ] Results are relevantly ranked
- [ ] Execution time reasonable (< 2 min for 20 pages)
- [ ] State management works reliably
- [ ] Clear feedback on crawl progress

---

## Phase 10: Implementation Timeline

### Estimated Time Breakdown

1. **API Research & Testing** - 1 hour
   - Test Docker API endpoints
   - Verify request/response format
   - Test different strategies

2. **Parameter Definition & UI** - 1 hour
   - Define all parameters
   - Set up display options
   - Organize groups

3. **API Client Integration** - 1.5 hours
   - Implement adaptiveCrawl() method
   - Build config formatters
   - Parse responses

4. **Result Processing** - 1 hour
   - Implement formatters
   - Handle ranking
   - Build output structure

5. **Error Handling** - 0.5 hours
   - Validation logic
   - Error messages
   - Edge cases

6. **Testing** - 1 hour
   - Unit tests
   - Integration tests
   - Edge case testing

7. **Documentation** - 0.5 hours
   - Update README
   - Write examples
   - Parameter docs

**Total Estimated Time**: 6.5 hours

---

## Next Steps

### Immediate Actions (Phase 1):

1. **Verify API Endpoint** ✅ PRIORITY
   - Start Crawl4AI Docker container
   - Test adaptive crawling endpoint
   - Document actual request/response format

2. **Create Proof of Concept**
   - Build minimal version with core parameters
   - Test against Docker API
   - Validate approach

3. **Finalize Architecture**
   - Confirm operation vs node decision
   - Lock parameter list
   - Design output format

Once API is verified and PoC works, proceed to full implementation.

---

## Questions for User

Before proceeding with implementation, confirm:

1. **Architecture**: Agree with adding as operation to BasicCrawler?
2. **Scope**: Should we implement both strategies or start with statistical only?
3. **State Management**: How critical is save/resume functionality?
4. **Timeline**: Is 6-7 hours acceptable for this feature?

---

## Conclusion

Adaptive Crawling is a complex but valuable feature that will complete the Priority 1 implementation phase. This plan provides a comprehensive roadmap from research through implementation to testing.

**Recommendation**: 
- Start with Phase 1 (API verification) immediately
- Build a minimal PoC to validate approach
- Then proceed with full implementation following this plan

This is the final piece to achieve **100% Priority 1 completion** and bring the n8n node to full Crawl4AI 0.7.x compatibility!
