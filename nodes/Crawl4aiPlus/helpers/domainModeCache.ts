import * as os from 'os';
import * as path from 'path';
import Keyv from 'keyv';
import { KeyvFile } from 'keyv-file';

// Bump SCHEMA_VERSION when the shape of DomainCacheSchema changes in a
// non-backward-compatible way. Entries with a different schemaVersion are
// treated as cache misses, forcing a fresh Standard attempt.
const SCHEMA_VERSION = 1 as const;

// Read the package version once at module load. Stored alongside cache
// entries for diagnostic purposes ONLY — it does NOT invalidate entries.
// Allows operators to spot stale entries written by older node versions
// when inspecting the cache file.
import * as pkg from '../../../package.json';
const NODE_PACKAGE_VERSION: string = (pkg as { version: string }).version;

export interface DomainCacheSchema {
	schemaVersion: typeof SCHEMA_VERSION;
	nodePackageVersion: string;
	mode: 'antiBotCloudflare';
}

const DEFAULT_CACHE_PATH = path.join(os.homedir(), '.n8n', 'crawl4ai-mode-cache.json');

function resolvePath(configuredPath: string): string {
	if (!configuredPath || !configuredPath.trim()) return DEFAULT_CACHE_PATH;
	// Accept both forward-slash (Unix/placeholder) and backslash (Windows) after ~
	return configuredPath.trim().replace(/^~(?=[/\\]|$)/, os.homedir());
}

// Singleton KeyvFile instances keyed by resolved file path.
// KeyvFile reads the cache file synchronously in its constructor and keeps
// its own in-memory Map; multiple instances against the same file would each
// load the file at construction time and could see stale views of each other's
// writes. One instance per path avoids both the redundant disk read and
// inconsistent in-memory state.
const storeInstances = new Map<string, KeyvFile>();

function buildKeyv(configuredPath: string): Keyv<DomainCacheSchema> {
	const filePath = resolvePath(configuredPath);
	if (!storeInstances.has(filePath)) {
		storeInstances.set(filePath, new KeyvFile({ filename: filePath }));
	}
	return new Keyv<DomainCacheSchema>({ store: storeInstances.get(filePath)! });
}

// Strip leading www. so example.com and www.example.com share one cache entry.
export function normalizeHostname(hostname: string): string {
	return hostname.replace(/^www\./, '');
}

export async function getCachedMode(
	configuredPath: string,
	domain: string,
): Promise<'antiBotCloudflare' | null> {
	try {
		const keyv = buildKeyv(configuredPath);
		const entry = await keyv.get(normalizeHostname(domain));
		if (!entry) return null;
		// Forward-compatibility guard: treat unknown schema versions as cache miss.
		// nodePackageVersion is informational only — never used to invalidate.
		if (entry.schemaVersion !== SCHEMA_VERSION) return null;
		return entry.mode;
	} catch {
		return null;
	}
}

/**
 * Store the crawl mode for one or more domains (pass both requested + redirected
 * FQDNs after a redirect so either hostname hits the cache next time).
 * All hostnames are www-normalised before storage.
 * keyv-file calls clearExpire() on every set(), so explicit post-write purge
 * is not needed — TTL cleanup is handled natively.
 */
export async function setCachedMode(
	configuredPath: string,
	domains: string | string[],
	mode: 'antiBotCloudflare',
	ttlDays: number,
): Promise<void> {
	try {
		const keyv = buildKeyv(configuredPath);
		const value: DomainCacheSchema = {
			schemaVersion: SCHEMA_VERSION,
			nodePackageVersion: NODE_PACKAGE_VERSION,
			mode,
		};
		const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
		const normalizedDomains = [
			...new Set((Array.isArray(domains) ? domains : [domains]).map(normalizeHostname)),
		];
		await Promise.all(normalizedDomains.map((d) => keyv.set(d, value, ttlMs)));
	} catch {
		// Best-effort — a cache write failure must never break a crawl
	}
}
