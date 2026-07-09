#!/usr/bin/env node
'use strict';

/*
 * Post-install integrity check for n8n-nodes-crawl4ai-plus.
 *
 * In n8n queue mode, multiple worker processes can share a single `.n8n/nodes`
 * volume. The npm install into that shared directory can race, leaving one of
 * this package's nested runtime dependencies truncated — the package directory
 * exists but its entry-point file is missing. That corruption otherwise stays
 * hidden until n8n later tries to load this package, surfacing as an opaque,
 * deep `Cannot find module '.../node_modules/axios/dist/node/axios.cjs'` and a
 * confusing `Unrecognized node type` error.
 *
 * This script fully loads (require()s, not just resolves) each runtime
 * dependency immediately at install time, so the failure is caught early with a
 * clear, actionable message rather than deferred to n8n startup. Requiring —
 * rather than only resolving — matters because `require.resolve()` verifies only
 * that a module's own entry file exists; it never executes the module, so it
 * cannot detect corruption in that module's OWN transitive dependencies. Fully
 * requiring `axios` transitively requires `form-data` (and the rest of its
 * graph), so a truncated nested file anywhere under one of these five packages
 * throws here and is caught, not just corruption of the five entry files.
 *
 * Plain CommonJS with no build step and no dependency on `dist/` or any
 * devDependency — it must run from a freshly-extracted npm tarball via
 * `node scripts/verify-install.js`.
 */

var REQUIRED_DEPENDENCIES = ['axios', 'zod', 'libphonenumber-js', 'keyv', 'keyv-file'];

var failed = [];

for (var i = 0; i < REQUIRED_DEPENDENCIES.length; i++) {
	var name = REQUIRED_DEPENDENCIES[i];
	try {
		require(name);
	} catch (err) {
		// require() throws when the dependency (or anything in its own transitive
		// dependency graph) is missing or has a truncated entry file. Catch it here
		// so this script never crashes with a raw stack trace — fold it into the
		// single clear message printed below.
		failed.push(name);
	}
}

if (failed.length === 0) {
	// All dependencies present — stay silent so normal installs add no noise.
	process.exit(0);
}

var repairCommand =
	'cd ' + __dirname.replace(/[\\/]scripts$/, '') +
	' && npm install --no-save --legacy-peer-deps ' +
	failed.join(' ');

var lines = [
	'',
	'n8n-nodes-crawl4ai-plus: nested dependency install is corrupted or incomplete.',
	'',
	'These runtime dependencies could not be resolved:',
	'  - ' + failed.join('\n  - '),
	'',
	'This usually means the nested dependency install was left truncated (the',
	'package directory exists but its entry-point file is missing). It is a known',
	'failure mode of n8n queue-mode / shared-volume installs, where multiple worker',
	'processes race during npm extraction into a single shared `.n8n/nodes` volume.',
	'',
	'To repair, reinstall the affected dependencies scoped to this package:',
	'',
	'  ' + repairCommand,
	'',
	'See the "Troubleshooting" section of this package README, or issue #27',
	'(https://github.com/msoukhomlinov/n8n-nodes-crawl4ai-plus/issues/27), for details.',
	'',
];

process.stderr.write(lines.join('\n') + '\n');
process.exit(1);
