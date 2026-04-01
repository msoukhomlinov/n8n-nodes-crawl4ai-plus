import type { IDataObject } from 'n8n-workflow';

export interface SeoField {
	name: string;
	selector: string;
	type: 'text' | 'attribute' | 'html';
	attribute?: string;
}

export const SEO_FIELDS: Record<string, SeoField[]> = {
	basic: [
		{ name: 'title', selector: 'title', type: 'text' },
		{ name: 'metaDescription', selector: 'meta[name="description"]', type: 'attribute', attribute: 'content' },
		{ name: 'metaKeywords', selector: 'meta[name="keywords"]', type: 'attribute', attribute: 'content' },
		{ name: 'canonicalUrl', selector: 'link[rel="canonical"]', type: 'attribute', attribute: 'href' },
		{ name: 'author', selector: 'meta[name="author"]', type: 'attribute', attribute: 'content' },
		{ name: 'viewport', selector: 'meta[name="viewport"]', type: 'attribute', attribute: 'content' },
	],
	openGraph: [
		{ name: 'ogTitle', selector: 'meta[property="og:title"]', type: 'attribute', attribute: 'content' },
		{ name: 'ogDescription', selector: 'meta[property="og:description"]', type: 'attribute', attribute: 'content' },
		{ name: 'ogImage', selector: 'meta[property="og:image"]', type: 'attribute', attribute: 'content' },
		{ name: 'ogType', selector: 'meta[property="og:type"]', type: 'attribute', attribute: 'content' },
		{ name: 'ogUrl', selector: 'meta[property="og:url"]', type: 'attribute', attribute: 'content' },
		{ name: 'ogSiteName', selector: 'meta[property="og:site_name"]', type: 'attribute', attribute: 'content' },
		{ name: 'ogLocale', selector: 'meta[property="og:locale"]', type: 'attribute', attribute: 'content' },
	],
	twitter: [
		{ name: 'twitterCard', selector: 'meta[name="twitter:card"]', type: 'attribute', attribute: 'content' },
		{ name: 'twitterTitle', selector: 'meta[name="twitter:title"]', type: 'attribute', attribute: 'content' },
		{ name: 'twitterDescription', selector: 'meta[name="twitter:description"]', type: 'attribute', attribute: 'content' },
		{ name: 'twitterImage', selector: 'meta[name="twitter:image"]', type: 'attribute', attribute: 'content' },
		{ name: 'twitterSite', selector: 'meta[name="twitter:site"]', type: 'attribute', attribute: 'content' },
		{ name: 'twitterCreator', selector: 'meta[name="twitter:creator"]', type: 'attribute', attribute: 'content' },
	],
	robots: [
		{ name: 'robots', selector: 'meta[name="robots"]', type: 'attribute', attribute: 'content' },
		{ name: 'googlebot', selector: 'meta[name="googlebot"]', type: 'attribute', attribute: 'content' },
		{ name: 'bingbot', selector: 'meta[name="bingbot"]', type: 'attribute', attribute: 'content' },
	],
	language: [
		{ name: 'htmlLang', selector: 'html', type: 'attribute', attribute: 'lang' },
		{ name: 'contentLanguage', selector: 'meta[http-equiv="content-language"]', type: 'attribute', attribute: 'content' },
	],
};

export function extractJsonLd(html: string): { data: IDataObject[]; parseErrors: number } {
	const jsonLdData: IDataObject[] = [];
	let parseErrors = 0;
	const scriptTagRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let match;

	while ((match = scriptTagRegex.exec(html)) !== null) {
		try {
			const data = JSON.parse(match[1].trim()) as IDataObject;
			jsonLdData.push(data);
		} catch {
			parseErrors++;
		}
	}

	return { data: jsonLdData, parseErrors };
}

export function extractHreflang(html: string): Array<{ lang: string; href: string }> {
	const hreflangTags: Array<{ lang: string; href: string }> = [];

	const linkTagPattern = /<link[^>]*rel=["']alternate["'][^>]*\/?>/gi;
	let tagMatch;

	while ((tagMatch = linkTagPattern.exec(html)) !== null) {
		const tag = tagMatch[0];
		const hreflangMatch = tag.match(/hreflang=["']([^"']+)["']/i);
		const hrefMatch = tag.match(/href=["']([^"']+)["']/i);

		if (hreflangMatch && hrefMatch) {
			hreflangTags.push({ lang: hreflangMatch[1], href: hrefMatch[1] });
		}
	}

	const seen = new Set<string>();
	return hreflangTags.filter(tag => {
		const key = `${tag.lang}:${tag.href}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function extractHead(html: string): string {
	const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
	return match ? match[1] : '';
}
