# Changelog

## 5.1.0

### Added

- **AI Tools node** (`Crawl4aiPlusAiTools`): New node exposing Crawl4AI as AI tools for n8n AI Agent and MCP Trigger. Supports 7 operations: crawl, askQuestion, extractWithLlm, extractWithCss, extractSeo, discoverLinks, healthCheck.
- **Shared SEO helpers** (`nodes/shared/seo-helpers.ts`): Extracted `SEO_FIELDS`, `extractJsonLd()`, `extractHreflang()`, `extractHead()` from `seoExtractor.operation.ts` for reuse across nodes.

## 5.0.1

### Fixed

- **Credential validation**: Added `test` property (health endpoint check) and `icon` (SVG) to credential class, fixing lint errors that blocked publishing
- **Type safety**: Replaced ~55 `any` types across shared code and all operation files with proper types (`unknown`, `Record<string, unknown>`, `IDataObject`, `AxiosResponse`, `Link[]`, etc.)
- **Unused variables**: Removed unused `context` parameter from `parseApiError()`, fixed unused `error` bindings in catch blocks, suppressed interface-required `_nodeOptions` params
- **Stale lint directives**: Removed 9 unused `eslint-disable` comments and fixed `as any` cast in `operations.ts`
- **Cloud support**: Disabled n8n Cloud compatibility checks (node requires axios for Docker REST API communication, inherently incompatible with n8n Cloud)

## 5.0.0

Major rewrite — see CLAUDE.md for full architecture documentation.
