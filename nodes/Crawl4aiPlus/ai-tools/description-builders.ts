const OPERATION_DESCRIPTIONS: Record<string, string> = {
	crawl:
		'Fetch a webpage and return its content as clean markdown. ' +
		'Returns page text, optionally with links and media. ' +
		'Use cacheMode BYPASS to force a fresh crawl.',

	askQuestion:
		'Ask a question about a webpage using LLM. ' +
		'REQUIRES LLM credentials configured in Crawl4AI credentials. ' +
		'Returns answer, supporting details, and source quotes from the page.',

	extractWithLlm:
		'Extract structured data from a webpage using LLM. ' +
		'REQUIRES LLM credentials. ' +
		'Pass an instruction describing what to extract. ' +
		'Optionally pass a JSON schema string to define the output structure.',

	extractWithCss:
		'Extract repeating data from a webpage using CSS selectors. No LLM needed. ' +
		'Pass baseSelector for the repeating element (e.g. ".product-card") and ' +
		'fields as a JSON array of {name, selector, type, attribute?}.',

	extractSeo:
		'Extract SEO metadata from a webpage: title, meta description, OG tags, ' +
		'Twitter cards, JSON-LD structured data, robots directives, and hreflang tags.',

	discoverLinks:
		'Find all links on a webpage. Filter by internal (same domain), ' +
		'external (other domains), or both. Returns URL, text, and title for each link.',

	healthCheck:
		'Check Crawl4AI server status including memory usage, CPU, uptime, ' +
		'and endpoint statistics. No parameters needed.',
};

export function buildUnifiedDescription(operations: string[]): string {
	const lines = operations.map((op) => {
		const desc = OPERATION_DESCRIPTIONS[op];
		return desc ? `- ${op}: ${desc}` : null;
	}).filter(Boolean);

	return [
		'Web crawling and data extraction via Crawl4AI.',
		'Pass one of the following values in the required "operation" field:',
		...lines,
	].join('\n');
}
