declare const require: {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(id: string): any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	resolve(id: string, options?: any): string;
	cache?: Record<string, { exports: unknown } | undefined>;
};

import type { DynamicStructuredTool } from '@langchain/core/tools';
import type { z as ZodNamespace } from 'zod';

type DynamicStructuredToolCtor = new (fields: {
	name: string;
	description: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	schema: any;
	func: (params: Record<string, unknown>) => Promise<string>;
}) => DynamicStructuredTool;

export type RuntimeZod = typeof ZodNamespace;

/**
 * n8n resolves @langchain/core and zod from ITS OWN dependency tree, not this
 * package's bundled copies. Getting the wrong copy is a SILENT failure: n8n's
 * normalizeToolSchema does `tool.schema instanceof ZodType` — a foreign ZodType
 * class identity fails that check, the schema degrades to raw JSON Schema, and
 * tools surface as "object schema missing properties" with no error logged.
 *
 * Resolution order:
 *   1. filesystem anchor (ANCHOR_CANDIDATES) — works on hoisted npm/yarn installs
 *      where require.resolve() from this file can walk into n8n's node_modules.
 *   2. requireFromCachedTree — positive anchor for pnpm-strict-isolated n8n
 *      installs (v2.29.x+), where this package lives outside n8n's own
 *      node_modules tree and no filesystem require.resolve() from here can reach
 *      it at all. Finds an already-cached module belonging to an n8n-OWNED
 *      package (which community nodes never bundle) and createRequire()s the
 *      dependency from THAT module — tying the resolved copy to n8n's real
 *      dependency graph by package identity, independent of pnpm's flat
 *      virtual-store realpaths.
 *
 * Both tiers run lazily, inside the Proxy traps below: n8n requires node files
 * for registration before any workflow executes, i.e. before its own
 * langchain-dependent nodes are loaded into require.cache. If neither tier
 * resolves, we fail clean — the Proxy throws a diagnostic error rather than
 * guessing another community node's bundled copy.
 */
const OWN_PACKAGE_NAME = 'n8n-nodes-crawl4ai-plus';

const ANCHOR_CANDIDATES = ['@langchain/core/tools', '@langchain/classic/agents', 'langchain/agents'] as const;

/**
 * n8n-owned package to anchor DynamicStructuredTool resolution against.
 * @langchain/classic is deliberately NOT included: it is a public LangChain
 * package, not n8n-owned, so another community node bundling its own copy
 * could be the one found in require.cache — reintroducing the exact
 * cross-tree contamination this anchor exists to avoid. Only a package n8n
 * itself owns (which community nodes never bundle) is a safe cache anchor.
 */
const LANGCHAIN_TREE_PATTERNS = ['@n8n/n8n-nodes-langchain'] as const;

/**
 * Authoritative zod anchor: @n8n/n8n-nodes-langchain is the package whose
 * `normalizeToolSchema` performs the `instanceof ZodType` check, so its own
 * zod resolution IS the identity that matters. A hit here is safe to memoize
 * permanently.
 */
const ZOD_AUTHORITATIVE_PATTERN = ['@n8n/n8n-nodes-langchain'] as const;

/**
 * Fallback zod anchors, tried only if the authoritative one isn't cached yet.
 * n8n's pnpm workspace does not guarantee every package resolves the same
 * zod version (e.g. n8n-workflow can pin an older zod than the langchain
 * package does) — a hit here is NOT identity-safe and must never be
 * memoized, so a later call can still upgrade to the authoritative copy.
 */
const ZOD_FALLBACK_PATTERNS = ['n8n-workflow', 'n8n-core'] as const;

const { createRequire } = require('module') as {
	createRequire: (filename: string) => NodeRequire;
};

/** Build a cross-platform require.cache-key matcher for a package name. */
function packageKeyPattern(pkg: string): RegExp {
	const parts = pkg.split('/').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(`[\\\\/]${parts.join('[\\\\/]')}[\\\\/]`);
}

/**
 * Positive-anchor resolver. Finds an already-cached module whose path belongs
 * to one of `patterns` (n8n-owned packages), then createRequire()s `id` from
 * that module's location. Patterns are tried in order; the first cached anchor
 * that resolves `id` wins. Returns undefined if none resolve it.
 */
function requireFromCachedTree(patterns: readonly string[], id: string): unknown {
	const cache = require.cache;
	if (!cache) return undefined;
	const keys = Object.keys(cache);
	for (const pkg of patterns) {
		const anchorPattern = packageKeyPattern(pkg);
		for (const key of keys) {
			// Belt-and-braces only: never anchor from our own package's cached files.
			if (key.includes(OWN_PACKAGE_NAME)) continue;
			if (!anchorPattern.test(key)) continue;
			try {
				const anchorReq = createRequire(key);
				const resolved = anchorReq(id);
				if (resolved) return resolved;
			} catch {
				// This cached module can't reach `id`; try the next cached key / pattern.
			}
		}
	}
	return undefined;
}

/** Filesystem anchor probe for hoisted npm/yarn installs. */
function getFilesystemAnchorRequire(): { runtimeReq: NodeRequire | null; diagnostic: string | null } {
	const tried: string[] = [];
	for (const anchor of ANCHOR_CANDIDATES) {
		try {
			const anchorPath = require.resolve(anchor) as string;
			return {
				runtimeReq: createRequire(anchorPath),
				diagnostic: `resolved via filesystem anchor: ${anchor}`,
			};
		} catch (e) {
			tried.push(`${anchor}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	return {
		runtimeReq: null,
		diagnostic:
			`[Crawl4aiPlusAiTools] No filesystem anchor. Tried: ${ANCHOR_CANDIDATES.join(', ')}. ` +
			`Errors: ${tried.join(' | ')}`,
	};
}

const { runtimeReq: _filesystemAnchorReq, diagnostic: _anchorDiagnostic } = getFilesystemAnchorRequire();

let _RuntimeDynamicStructuredTool: DynamicStructuredToolCtor | undefined;
let _runtimeZod: RuntimeZod | undefined;
let langchainResolutionDiagnostic: string | null = _anchorDiagnostic;
let zodResolutionDiagnostic: string | null = null;
let langchainLoadError: string | null = null;
let zodLoadError: string | null = null;

function extractDynamicStructuredTool(mod: unknown): DynamicStructuredToolCtor | undefined {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const rec = mod as Record<string, any> | undefined;
	return typeof rec?.['DynamicStructuredTool'] === 'function'
		? (rec['DynamicStructuredTool'] as DynamicStructuredToolCtor)
		: undefined;
}

function isZodNamespace(mod: unknown): mod is RuntimeZod {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const rec = mod as Record<string, any> | undefined;
	// n8n's normalizeToolSchema does `instanceof ZodType`, so ZodType must be present;
	// `object` is the factory our schema-generator calls. Shape-check, not identity —
	// identity correctness comes from anchoring to an n8n-owned tree.
	return typeof rec?.['ZodType'] === 'function' && typeof rec?.['object'] === 'function';
}

function resolveDynamicStructuredTool(): DynamicStructuredToolCtor | undefined {
	if (_RuntimeDynamicStructuredTool) return _RuntimeDynamicStructuredTool;

	// 1. filesystem anchor — hoisted npm/yarn installs.
	if (_filesystemAnchorReq) {
		try {
			const ctor = extractDynamicStructuredTool(_filesystemAnchorReq('@langchain/core/tools'));
			if (ctor) {
				_RuntimeDynamicStructuredTool = ctor;
				langchainLoadError = null;
				langchainResolutionDiagnostic = _anchorDiagnostic ?? 'resolved via filesystem anchor';
				return ctor;
			}
		} catch (e) {
			langchainLoadError = e instanceof Error ? e.message : String(e);
		}
	}

	// 2. positive n8n-owned-tree anchor — pnpm-strict-isolated installs.
	try {
		const ctor = extractDynamicStructuredTool(
			requireFromCachedTree(LANGCHAIN_TREE_PATTERNS, '@langchain/core/tools'),
		);
		if (ctor) {
			_RuntimeDynamicStructuredTool = ctor;
			langchainLoadError = null;
			langchainResolutionDiagnostic = 'resolved via n8n-owned-tree anchor (pnpm-isolated install)';
			return ctor;
		}
	} catch (e) {
		langchainLoadError = e instanceof Error ? e.message : String(e);
	}

	// Fail clean — Proxy throws with the diagnostics above.
	return undefined;
}

function resolveRuntimeZod(): RuntimeZod | undefined {
	if (_runtimeZod) return _runtimeZod;

	// 1. Authoritative anchor — @n8n/n8n-nodes-langchain is the package whose
	//    instanceof ZodType check this zod must match. Safe to memoize.
	try {
		const mod = requireFromCachedTree(ZOD_AUTHORITATIVE_PATTERN, 'zod');
		if (isZodNamespace(mod)) {
			_runtimeZod = mod;
			zodLoadError = null;
			zodResolutionDiagnostic = 'resolved via @n8n/n8n-nodes-langchain anchor (authoritative)';
			return mod;
		}
	} catch (e) {
		zodLoadError = e instanceof Error ? e.message : String(e);
	}

	// 2. Fallback anchors — may carry a different zod version than the
	//    authoritative package resolves, so NEVER memoize: every call retries
	//    tier 1 first, so a later call can still upgrade once
	//    @n8n/n8n-nodes-langchain is resident in require.cache.
	try {
		const mod = requireFromCachedTree(ZOD_FALLBACK_PATTERNS, 'zod');
		if (isZodNamespace(mod)) {
			zodLoadError = null;
			zodResolutionDiagnostic =
				'resolved via fallback anchor (n8n-workflow/n8n-core) — unverified identity, not memoized';
			return mod;
		}
	} catch (e) {
		zodLoadError = e instanceof Error ? e.message : String(e);
	}

	// Fail clean — Proxy throws with the diagnostics above.
	return undefined;
}

// IMPORTANT: Proxy target MUST be `function () {}`, not `{}`.
// ECMAScript spec §10.5.13: a Proxy only has [[Construct]] if its target does.
export const RuntimeDynamicStructuredTool: DynamicStructuredToolCtor = new Proxy(
	function () {} as unknown as DynamicStructuredToolCtor,
	{
		construct(_target, args) {
			const ctor = resolveDynamicStructuredTool();
			if (!ctor) {
				throw new Error(
					"RuntimeDynamicStructuredTool: @langchain/core/tools could not be resolved from n8n's module tree. " +
						'Ensure @langchain/core is installed in the n8n environment.' +
						(langchainResolutionDiagnostic ? ` Diagnostic: ${langchainResolutionDiagnostic}` : '') +
						(langchainLoadError ? ` Load error: ${langchainLoadError}` : ''),
				);
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return new (ctor as any)(...args) as object;
		},
		get(_target, prop) {
			const ctor = resolveDynamicStructuredTool();
			if (ctor) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return (ctor as any)[prop];
			}
			// Allow Symbol properties and internal checks to pass without error
			if (typeof prop === 'symbol') return undefined;
			throw new Error(
				"RuntimeDynamicStructuredTool: @langchain/core/tools could not be resolved from n8n's module tree." +
					(langchainResolutionDiagnostic ? ` Diagnostic: ${langchainResolutionDiagnostic}` : '') +
					(langchainLoadError ? ` Load error: ${langchainLoadError}` : ''),
			);
		},
	},
) as DynamicStructuredToolCtor;

export const runtimeZod: RuntimeZod = new Proxy({} as RuntimeZod, {
	get(_target, prop) {
		// Guard: frameworks probe Symbol.toPrimitive, Symbol.toStringTag, .then (Promise
		// thenable), and .constructor. Throwing on these causes misleading errors during
		// structural inspection.
		if (typeof prop === 'symbol' || prop === 'then' || prop === 'constructor') return undefined;
		const zod = resolveRuntimeZod();
		if (!zod) {
			throw new Error(
				`runtimeZod: zod could not be resolved from n8n's module tree (accessing .${String(prop)}). ` +
					'Ensure zod is installed in the n8n environment.' +
					(zodResolutionDiagnostic ? ` Diagnostic: ${zodResolutionDiagnostic}` : '') +
					(zodLoadError ? ` Load error: ${zodLoadError}` : ''),
			);
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (zod as any)[prop];
	},
});
