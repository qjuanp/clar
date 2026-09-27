import { existsSync, mkdirSync, readFileSync, lstatSync, readlinkSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const vault = process.env.OBSIDIAN_TEST_VAULT;
if (!vault) {
	console.error(
		'OBSIDIAN_TEST_VAULT is not set. Point it at the root of an Obsidian vault, e.g.:\n' +
			'  OBSIDIAN_TEST_VAULT="/path/to/vault" npm run setup-test-vault',
	);
	process.exit(1);
}

if (!existsSync(vault)) {
	console.error(`OBSIDIAN_TEST_VAULT does not exist: ${vault}`);
	process.exit(1);
}

const distDir = resolve('dist');
if (!existsSync(distDir)) {
	console.error('dist/ does not exist yet. Run `npm run build` or `npm run dev` first.');
	process.exit(1);
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const pluginsDir = join(vault, '.obsidian', 'plugins');
const target = join(pluginsDir, manifest.id);

mkdirSync(pluginsDir, { recursive: true });

if (existsSync(target) || lstatSync(target, { throwIfNoEntry: false })) {
	const stats = lstatSync(target);
	if (stats.isSymbolicLink() && resolve(readlinkSync(target)) === distDir) {
		console.log(`Already linked: ${target} -> ${distDir}`);
		process.exit(0);
	}
	console.error(
		`${target} already exists and is not a symlink to ${distDir}.\n` +
			'Remove or rename it manually, then re-run this command.',
	);
	process.exit(1);
}

symlinkSync(distDir, target, 'dir');
console.log(`Linked ${target} -> ${distDir}`);
