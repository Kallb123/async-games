// Bumps the version in package.json/package-lock.json and commits the
// result. Meant to be run once per PR (patch bump by default) so the
// version shown in the Settings page footer (src/app/settings/page.tsx)
// advances with every release.
//
// Usage: node scripts/bump-version.mjs [patch|minor|major]  (default: patch)

import { execFileSync } from 'node:child_process';

const releaseType = process.argv[2] ?? 'patch';

if (!['patch', 'minor', 'major'].includes(releaseType)) {
    console.error(`Unknown release type "${releaseType}". Use patch, minor or major.`);
    process.exit(1);
}

const newVersion = execFileSync(
    'npm',
    ['version', releaseType, '--no-git-tag-version'],
    { encoding: 'utf8' },
).trim();

execFileSync('git', ['add', 'package.json', 'package-lock.json']);
execFileSync('git', ['commit', '-m', `Bump version to ${newVersion}`]);

console.log(`Bumped version to ${newVersion}`);
