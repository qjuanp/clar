// Fails fast with a readable message on an unsupported Node version, instead
// of the cryptic crashes ESLint 9 (`isBuiltin is not a function`) and vitest
// (`node:fs/promises` import error) produce on old Node. Keep this file
// syntax-compatible with old Node so the check itself can always run.
const MIN_MAJOR = 20;
const major = Number(process.versions.node.split('.')[0]);
if (major < MIN_MAJOR) {
	console.error(
		`\nClár requires Node ${MIN_MAJOR}+ (found ${process.version}).\n` +
			'Switch first, e.g.: source ~/.nvm/nvm.sh && nvm use   (reads .nvmrc)\n',
	);
	process.exit(1);
}
