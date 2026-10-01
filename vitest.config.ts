import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
	},
	resolve: {
		alias: {
			// The real `obsidian` package is types-only; the app injects the real
			// classes at plugin-load time. See test/unit/mocks/obsidian.ts.
			obsidian: path.resolve(__dirname, 'test/unit/mocks/obsidian.ts'),
		},
	},
});
