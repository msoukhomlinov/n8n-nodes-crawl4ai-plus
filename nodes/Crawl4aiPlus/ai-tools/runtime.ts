// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: { (id: string): any; resolve(id: string, options?: any): string };

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
 * Anchor candidates — packages in n8n's dependency tree that can serve as
 * a createRequire() anchor to resolve @langchain/core and zod from n8n's
 * module tree (not this package's bundled copies).
 */
const ANCHOR_CANDIDATES = ['@langchain/core/tools', '@langchain/classic/agents', 'langchain/agents'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRuntimeRequire(): { runtimeReq: any; diagnostic: string | null } {
	const errors: string[] = [];

	for (const anchor of ANCHOR_CANDIDATES) {
		try {
			const anchorPath = require.resolve(anchor) as string;
			const { createRequire } = require('module') as {
				createRequire: (filename: string) => NodeRequire;
			};
			return { runtimeReq: createRequire(anchorPath), diagnostic: null };
		} catch (e) {
			errors.push(`${anchor}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	const diagnostic =
		`[Crawl4aiPlusAiTools] No runtime anchor found. Tried: ${ANCHOR_CANDIDATES.join(', ')}. ` +
		`Errors: ${errors.join(' | ')}`;
	// eslint-disable-next-line no-console
	console.warn(diagnostic);
	return { runtimeReq: null, diagnostic };
}

const { runtimeReq, diagnostic } = getRuntimeRequire();

let _RuntimeDynamicStructuredTool: DynamicStructuredToolCtor | undefined;
let _runtimeZod: RuntimeZod | undefined;

if (runtimeReq) {
	try {
		const coreTools = runtimeReq('@langchain/core/tools') as Record<string, unknown>;
		_RuntimeDynamicStructuredTool = coreTools['DynamicStructuredTool'] as DynamicStructuredToolCtor;
	} catch (e) {
		// eslint-disable-next-line no-console
		console.warn('[Crawl4aiPlusAiTools] Failed to resolve @langchain/core/tools from runtime require:', e);
	}

	try {
		_runtimeZod = runtimeReq('zod') as RuntimeZod;
	} catch (e) {
		// eslint-disable-next-line no-console
		console.warn('[Crawl4aiPlusAiTools] Failed to resolve zod from runtime require:', e);
	}
}

// IMPORTANT: Proxy target MUST be `function () {}`, not `{}`.
// ECMAScript spec §10.5.13: a Proxy only has [[Construct]] if its target does.
export const RuntimeDynamicStructuredTool: DynamicStructuredToolCtor = new Proxy(
	function () {} as unknown as DynamicStructuredToolCtor,
	{
		construct(_target, args) {
			if (!_RuntimeDynamicStructuredTool) {
				throw new Error(
					'RuntimeDynamicStructuredTool: @langchain/core/tools could not be resolved from n8n\'s module tree. ' +
					'Ensure @langchain/core is installed in the n8n environment.' +
					(diagnostic ? ` Diagnostic: ${diagnostic}` : ''),
				);
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return new (_RuntimeDynamicStructuredTool as any)(...args) as object;
		},
		get(_target, prop) {
			if (_RuntimeDynamicStructuredTool) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return (_RuntimeDynamicStructuredTool as any)[prop];
			}
			// Allow Symbol properties and internal checks to pass without error
			if (typeof prop === 'symbol') return undefined;
			throw new Error(
				'RuntimeDynamicStructuredTool: @langchain/core/tools could not be resolved from n8n\'s module tree.' +
				(diagnostic ? ` Diagnostic: ${diagnostic}` : ''),
			);
		},
	},
) as DynamicStructuredToolCtor;

export const runtimeZod: RuntimeZod = new Proxy({} as RuntimeZod, {
	get(_target, prop) {
		if (!_runtimeZod) {
			throw new Error(
				`runtimeZod: zod could not be resolved from n8n's module tree (accessing .${String(prop)}). ` +
				'Ensure zod is installed in the n8n environment.' +
				(diagnostic ? ` Diagnostic: ${diagnostic}` : ''),
			);
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (_runtimeZod as any)[prop];
	},
});
