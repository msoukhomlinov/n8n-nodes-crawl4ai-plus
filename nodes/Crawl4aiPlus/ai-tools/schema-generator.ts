import { z } from 'zod';
// NOTE: z is a compile-time VALUE import — we need z.object(), z.string() etc. at build time.
// Only runtime classes (DynamicStructuredTool, ZodType) come from runtime.ts.
import { LoggerProxy as Logger } from 'n8n-workflow';

import type { RuntimeZod } from './runtime';

// --- Per-operation schema functions ---

function getCrawlSchema() {
	return z.object({
		url: z.string().describe(
			'Full URL to crawl including https://. Example: "https://example.com/page"',
		),
		includeLinks: z.boolean().optional().describe(
			'Include internal and external links found on the page (default: true)',
		),
		includeImages: z.boolean().optional().describe(
			'Include images and media found on the page (default: false)',
		),
		waitFor: z.string().optional().describe(
			'CSS selector to wait for before extracting content. Use when page loads content dynamically.',
		),
		cacheMode: z.enum(['ENABLED', 'BYPASS', 'DISABLED']).optional().describe(
			'Cache behavior: ENABLED = use cached if available, BYPASS = always re-crawl, DISABLED = no cache at all (default: ENABLED)',
		),
	});
}

function getAskQuestionSchema() {
	return z.object({
		url: z.string().describe(
			'Full URL to crawl and ask a question about. Example: "https://example.com/about"',
		),
		question: z.string().min(1).describe(
			'The question to ask about the page content. Be specific for better answers.',
		),
	});
}

function getExtractWithLlmSchema() {
	return z.object({
		url: z.string().describe(
			'Full URL to crawl and extract structured data from.',
		),
		instruction: z.string().min(1).describe(
			'What to extract from the page. Be specific. Example: "Extract all product names and prices"',
		),
		schema: z.string().optional().describe(
			'Optional JSON schema string defining the extraction structure. Example: {"name":"string","price":"number"}. If omitted, LLM extracts freely based on instruction.',
		),
	});
}

function getExtractWithCssSchema() {
	return z.object({
		url: z.string().describe(
			'Full URL to crawl and extract data from using CSS selectors.',
		),
		baseSelector: z.string().min(1).describe(
			'CSS selector for the repeating element to extract. Example: ".product-card" or "table tbody tr"',
		),
		fields: z.string().min(1).describe(
			'JSON array of field definitions. Each field: {"name":"fieldName","selector":"css selector","type":"text|html|attribute","attribute":"href"}. ' +
			'Example: [{"name":"title","selector":"h3","type":"text"},{"name":"link","selector":"a","type":"attribute","attribute":"href"}]',
		),
	});
}

function getExtractSeoSchema() {
	return z.object({
		url: z.string().describe(
			'Full URL to extract SEO metadata from (title, description, OG tags, JSON-LD, etc.).',
		),
	});
}

function getDiscoverLinksSchema() {
	return z.object({
		url: z.string().describe(
			'Full URL to discover links on.',
		),
		linkTypes: z.enum(['internal', 'external', 'both']).optional().describe(
			'Which link types to return: internal (same domain), external (other domains), or both (default: both)',
		),
	});
}

function getHealthCheckSchema() {
	return z.object({});
}

// --- Operation registry ---

import { ALL_OPERATIONS } from './constants';

const OPERATION_LABELS: Record<string, string> = {
	crawl: 'Crawl page',
	askQuestion: 'Ask question',
	extractWithLlm: 'LLM extraction',
	extractWithCss: 'CSS extraction',
	extractSeo: 'SEO metadata',
	discoverLinks: 'Discover links',
	healthCheck: 'Health check',
};

function isValidOperation(op: string): boolean {
	return (ALL_OPERATIONS as readonly string[]).includes(op);
}

function getSchemaForOperation(operation: string): z.ZodObject<z.ZodRawShape> {
	switch (operation) {
		case 'crawl': return getCrawlSchema();
		case 'askQuestion': return getAskQuestionSchema();
		case 'extractWithLlm': return getExtractWithLlmSchema();
		case 'extractWithCss': return getExtractWithCssSchema();
		case 'extractSeo': return getExtractSeoSchema();
		case 'discoverLinks': return getDiscoverLinksSchema();
		case 'healthCheck': return getHealthCheckSchema();
		default: return z.object({});
	}
}

// --- Unified schema builder ---

export function buildUnifiedSchema(
	_resource: string,
	operations: string[],
): z.ZodObject<z.ZodRawShape> {
	const enabledOps = Array.from(new Set(operations.filter(isValidOperation)));

	if (enabledOps.length === 0) {
		return z.object({ operation: z.string().describe('Operation to perform') });
	}

	const operationEnum = z
		.enum(enabledOps as [string, ...string[]])
		.describe(`Operation to perform. Allowed values: ${enabledOps.join(', ')}.`);

	const fieldSources = new Map<string, z.ZodTypeAny>();
	const fieldOps = new Map<string, Set<string>>();

	for (const operation of enabledOps) {
		const schema = getSchemaForOperation(operation);
		for (const [field, fieldSchema] of Object.entries(schema.shape)) {
			if (!fieldSources.has(field)) fieldSources.set(field, fieldSchema as z.ZodTypeAny);
			if (!fieldOps.has(field)) fieldOps.set(field, new Set<string>());
			fieldOps.get(field)?.add(operation);
		}
	}

	const mergedShape: Record<string, z.ZodTypeAny> = { operation: operationEnum };

	for (const [field, fieldSchema] of fieldSources.entries()) {
		const opsForField = Array.from(fieldOps.get(field) ?? []);
		const baseDescription = fieldSchema.description ?? '';
		const opsDescription = `Used by: ${opsForField.map((op) => OPERATION_LABELS[op] ?? op).join(', ')}.`;
		const description = baseDescription ? `${baseDescription} ${opsDescription}` : opsDescription;
		mergedShape[field] = fieldSchema.optional().describe(description);
	}

	return z.object(mergedShape);
}

// --- Runtime Zod conversion (v3/v4 dual compat) ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRuntimeZodSchema(schema: any, runtimeZ: RuntimeZod): any {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const def = schema?._def as any;
	const typeName = (def?.type ?? def?.typeName) as string | undefined;
	let converted: unknown;

	switch (typeName) {
		case 'string':
		case 'ZodString': {
			let s = runtimeZ.string();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			for (const check of (def.checks ?? []) as Array<any>) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const cd = (check?._zod?.def ?? check) as any;
				const kind = (cd?.check ?? cd?.kind) as string | undefined;
				switch (kind) {
					case 'min_length': s = s.min(cd.minimum); break;
					case 'max_length': s = s.max(cd.maximum); break;
					case 'min': s = s.min(cd.value); break;
					case 'max': s = s.max(cd.value); break;
					case 'email': s = s.email(); break;
					case 'url': s = s.url(); break;
					case 'uuid': s = s.uuid(); break;
					default: break;
				}
			}
			converted = s; break;
		}
		case 'number':
		case 'ZodNumber': {
			let n = runtimeZ.number();
			let needsInt = false;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			for (const check of (def.checks ?? []) as Array<any>) {
				if (check?.isInt === true) { needsInt = true; continue; }
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const cd = (check?._zod?.def ?? check) as any;
				const kind = (cd?.check ?? cd?.kind) as string | undefined;
				switch (kind) {
					case 'int': needsInt = true; break;
					case 'greater_than':
						n = cd.inclusive ? n.min(cd.value) : n.gt(cd.value); break;
					case 'less_than':
						n = cd.inclusive ? n.max(cd.value) : n.lt(cd.value); break;
					case 'min': n = cd.inclusive === false ? n.gt(cd.value) : n.min(cd.value); break;
					case 'max': n = cd.inclusive === false ? n.lt(cd.value) : n.max(cd.value); break;
					default: break;
				}
			}
			if (needsInt) n = n.int();
			converted = n; break;
		}
		case 'boolean':  case 'ZodBoolean': converted = runtimeZ.boolean(); break;
		case 'unknown':  case 'ZodUnknown': converted = runtimeZ.unknown(); break;
		case 'array':    case 'ZodArray':
			converted = runtimeZ.array(toRuntimeZodSchema(def.element ?? def.type, runtimeZ)); break;
		case 'enum':     case 'ZodEnum': {
			const enumVals: string[] = schema.options ??
				(def.entries ? Object.values(def.entries as Record<string, string>) : undefined) ??
				def.values ?? [];
			converted = runtimeZ.enum(enumVals as [string, ...string[]]);
			break;
		}
		case 'record':   case 'ZodRecord':
			converted = runtimeZ.record(
				toRuntimeZodSchema(def.keyType ?? runtimeZ.string(), runtimeZ),
				toRuntimeZodSchema(def.valueType, runtimeZ),
			); break;
		case 'object':   case 'ZodObject': {
			const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const runtimeShape: Record<string, any> = {};
			for (const [key, value] of Object.entries(shape ?? {})) {
				runtimeShape[key] = toRuntimeZodSchema(value, runtimeZ);
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let obj: any = runtimeZ.object(runtimeShape);
			if (def.unknownKeys === 'passthrough') obj = obj.passthrough();
			if (def.unknownKeys === 'strict') obj = obj.strict();
			converted = obj; break;
		}
		case 'optional':  case 'ZodOptional':
			// Zod v4: inner type at def.type | Zod v3: def.innerType
			converted = toRuntimeZodSchema(def.innerType ?? def.type, runtimeZ).optional(); break;
		case 'nullable':  case 'ZodNullable':
			converted = toRuntimeZodSchema(def.innerType ?? def.type, runtimeZ).nullable(); break;
		case 'default':   case 'ZodDefault':
			converted = toRuntimeZodSchema(def.innerType ?? def.type, runtimeZ).default(
				typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue,
			); break;
		case 'literal':  case 'ZodLiteral':
			converted = runtimeZ.literal(Array.isArray(def.values) ? def.values[0] : def.value); break;
		case 'union':    case 'ZodUnion':
			converted = runtimeZ.union(
				(def.options ?? []).map((o: unknown) => toRuntimeZodSchema(o, runtimeZ)),
			); break;
		default:
			Logger.warn(`[Crawl4aiPlusAiTools] toRuntimeZodSchema: unknown Zod type "${String(typeName)}" — falling back to z.unknown()`);
			converted = runtimeZ.unknown(); break;
	}

	const description = typeof schema?.description === 'string' ? schema.description : undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if (description && typeof (converted as any).describe === 'function') {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (converted as any).describe(description);
	}
	return converted;
}

function withRuntimeZod<T>(schemaBuilder: () => T, runtimeZ: RuntimeZod): T {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return toRuntimeZodSchema(schemaBuilder(), runtimeZ) as any;
}

export function getRuntimeSchemaBuilders(runtimeZ: RuntimeZod) {
	return {
		buildUnifiedSchema: (
			resource: string,
			operations: string[],
		) => withRuntimeZod(() => buildUnifiedSchema(resource, operations), runtimeZ),
	};
}
