/**
 * Pre-request URL safety filtering utilities.
 *
 * Used by operations that accept user-defined denylists to block known
 * unsafe or undesirable paths before any HTTP request is made.
 */

export interface UrlSafetyResult {
	safeUrls: string[];
	blockedUrls: string[];
}

export interface SuspicionCheck {
	suspicious: boolean;
	reason?: string;
}

/**
 * Parse a newline- or comma-separated denylist string into a trimmed array.
 * Empty lines and whitespace-only entries are discarded.
 * NOT lowercased here — entries are passed as-is to the Crawl4AI URLPatternFilter
 * (server-side). Lowercasing happens at comparison time inside matchesDenylist.
 */
export function parseDenylist(raw: string | undefined): string[] {
	if (!raw) return [];
	return raw
		.split(/[\n,]/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
}

/**
 * Returns true if `url` matches any denylist entry.
 *
 * Entries containing `*` are treated as glob patterns (wildcard → .*).
 * Other entries are matched as path substrings (e.g. "/admin/secret" matches
 * any URL whose pathname contains that segment).
 * Matching is case-insensitive — both entry and URL are lowercased at compare time.
 */
export function matchesDenylist(url: string, denylist: string[]): boolean {
	if (denylist.length === 0) return false;

	let pathname: string;
	let fullUrlLower: string;
	try {
		const parsed = new URL(url);
		pathname = parsed.pathname.toLowerCase();
		fullUrlLower = url.toLowerCase();
	} catch {
		pathname = url.toLowerCase();
		fullUrlLower = url.toLowerCase();
	}

	for (const entry of denylist) {
		const lowerEntry = entry.toLowerCase();
		if (lowerEntry.includes('*')) {
			const escaped = lowerEntry.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(escaped.replace(/\*/g, '.*'));
			if (regex.test(fullUrlLower) || regex.test(pathname)) return true;
		} else {
			if (pathname.includes(lowerEntry) || fullUrlLower.includes(lowerEntry)) return true;
		}
	}
	return false;
}

/**
 * Partition `urls` into safe and blocked sets based on `denylist`.
 */
export function filterUrlsAgainstDenylist(urls: string[], denylist: string[]): UrlSafetyResult {
	if (denylist.length === 0) return { safeUrls: urls, blockedUrls: [] };

	const safeUrls: string[] = [];
	const blockedUrls: string[] = [];
	for (const url of urls) {
		if (matchesDenylist(url, denylist)) {
			blockedUrls.push(url);
		} else {
			safeUrls.push(url);
		}
	}
	return { safeUrls, blockedUrls };
}

/**
 * Check whether a URL matches any suspicious pattern.
 *
 * `customPatterns` is a list of glob patterns (may contain `*`).
 * Returns { suspicious: false } when no match is found.
 */
export function checkSuspiciousUrl(url: string, customPatterns: string[]): SuspicionCheck {
	if (customPatterns.length === 0) return { suspicious: false };

	let pathname: string;
	let fullUrlLower: string;
	try {
		const parsed = new URL(url);
		pathname = parsed.pathname.toLowerCase();
		fullUrlLower = url.toLowerCase();
	} catch {
		pathname = url.toLowerCase();
		fullUrlLower = url.toLowerCase();
	}

	for (const pattern of customPatterns) {
		const lowerPattern = pattern.toLowerCase().trim();
		if (!lowerPattern) continue;
		const escaped = lowerPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(escaped.replace(/\*/g, '.*'));
		if (regex.test(fullUrlLower) || regex.test(pathname)) {
			return { suspicious: true, reason: `Matches suspicious pattern: ${pattern}` };
		}
	}

	return { suspicious: false };
}
