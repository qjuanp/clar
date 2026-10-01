import * as path from 'node:path';

// wdio-obsidian-service downloads Obsidian into this directory and reuses it
// across runs. Gitignored; see .gitignore.
const cacheDir = path.resolve('.obsidian-cache');

export const config: WebdriverIO.Config = {
	runner: 'local',
	framework: 'mocha',

	specs: ['./test/e2e/specs/**/*.e2e.ts'],

	// Per docs/specs/4_testing.md: only test the latest Obsidian version.
	capabilities: [
		{
			browserName: 'obsidian',
			'wdio:obsidianOptions': {
				appVersion: 'latest',
				installerVersion: 'latest',
				// The built plugin (manifest.json + main.js + styles.css), not the repo root.
				plugins: ['./dist'],
				// wdio-obsidian-service copies this fixture into a sandboxed temp vault
				// per run/reload, so the seed data here is never mutated.
				vault: 'test/e2e/vaults/kanban',
			},
		},
	],

	services: ['obsidian'],
	// Wraps @wdio/spec-reporter but prints the Obsidian version instead of Chromium's.
	reporters: ['obsidian'],

	mochaOpts: {
		ui: 'bdd',
		timeout: 60 * 1000,
	},

	waitforInterval: 250,
	waitforTimeout: 5 * 1000,
	logLevel: 'warn',

	cacheDir,

	// Import describe/it/expect explicitly instead of relying on WDIO's injected globals.
	injectGlobals: false,
};
