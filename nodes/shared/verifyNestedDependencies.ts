declare const require: {
	resolve(id: string): string;
};

/**
 * Load-time nested-dependency integrity guard.
 *
 * This module has no exports — its entire job is a side-effecting check that
 * runs once at module-evaluation time. Node caches require()/import results, so
 * importing it from all four of this package's n8n entry points (the three
 * `*.node.ts` files and the credential file) only actually executes the check
 * on whichever n8n happens to load first.
 *
 * WHY THIS EXISTS (and why the postinstall script is not enough): n8n's in-app
 * "Install a community node" UI runs `npm install --ignore-scripts=true`, so
 * this package's `postinstall` (scripts/verify-install.js) NEVER runs for that
 * install path — the exact path issue #27 is about. n8n's loader also requires
 * the whole package in one try/catch: if requiring ANY single declared node or
 * credential file throws (because it, or anything it transitively imports, hits
 * a corrupted `axios`/`zod`/`libphonenumber-js`), the ENTIRE package fails to
 * register and an unrelated node type shows as "Unrecognized node type" with a
 * deep, opaque `MODULE_NOT_FOUND` as the only clue.
 *
 * Importing this module FIRST in every entry file guarantees our clear
 * diagnostic fires before any import that could transitively reach the
 * corrupted dependency — converting that opaque failure into an actionable
 * message in n8n's own startup logs. (With `module: "commonjs"`, tsc emits the
 * import as the first `require()` call in the compiled file, preserving order.)
 *
 * This does NOT catch corruption earlier than n8n's next load attempt for the
 * `--ignore-scripts` path — there is no way to intercept mid-install when
 * scripts are disabled. It simply makes the failure diagnosable directly from
 * n8n's logs, immediately, instead of leaving a raw stack trace.
 */
const REQUIRED_DEPENDENCIES = ['axios', 'zod', 'libphonenumber-js', 'keyv', 'keyv-file'] as const;

const missing: string[] = [];

for (const name of REQUIRED_DEPENDENCIES) {
	try {
		require.resolve(name);
	} catch {
		// require.resolve throws MODULE_NOT_FOUND when the dependency is missing
		// or its entry-point file is truncated. Collect it for one clear message.
		missing.push(name);
	}
}

if (missing.length > 0) {
	throw new Error(
		'n8n-nodes-crawl4ai-plus: nested dependency install is corrupted or incomplete. ' +
			`These runtime dependencies could not be resolved: ${missing.join(', ')}. ` +
			'This usually means the nested dependency install was left truncated (the ' +
			'package directory exists but its entry-point file is missing) — a known ' +
			'failure mode of n8n queue-mode / shared-volume installs, where multiple ' +
			'worker processes race during npm extraction into one shared `.n8n/nodes` ' +
			'volume (issue #27). To repair, reinstall the affected dependencies scoped ' +
			"to this package's own directory (inside the container/volume where n8n " +
			'resolves community nodes from): ' +
			`\`cd <path-to-this-package> && npm install --no-save --legacy-peer-deps ${missing.join(' ')}\`, ` +
			'then restart n8n. See the "Troubleshooting" section of this package README, ' +
			'or issue #27 (https://github.com/msoukhomlinov/n8n-nodes-crawl4ai-plus/issues/27), ' +
			'for details.',
	);
}

export {};
