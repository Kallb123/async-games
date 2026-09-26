import { readFileSync, statSync } from 'node:fs';
import { globSync } from 'node:fs';

// Phase 0 baseline guards: each limit sits a few percent above the heaviest
// payload measured when the budget was introduced (home route JS 879 KB, the
// Race Cars city board 5,012 KB), so CI catches regressions without failing on
// today's app. Lower them as the plan's later phases shrink the payloads.
const limits = { routeJavaScript: 925_000, largestImage: 5_250_000 };
const manifests = globSync('.next/server/app/**/page_client-reference-manifest.js');
if (!manifests.length) throw new Error('No App Router client manifests found; run `npm run build` first.');
let failed = false;
for (const manifestFile of manifests) {
  const source = readFileSync(manifestFile, 'utf8');
  const jsonStart = source.indexOf(' = {', source.indexOf('] = ')) + 3;
  // Next terminates this generated assignment with a semicolon. Parse only
  // the object literal: JSON.parse rejects that otherwise-valid JS terminator.
  const jsonEnd = source.lastIndexOf('}') + 1;
  if (jsonStart < 3 || jsonEnd <= jsonStart) throw new Error(`Malformed client reference manifest: ${manifestFile}`);
  const manifest = JSON.parse(source.slice(jsonStart, jsonEnd));
  const chunks = new Set(Object.values(manifest.clientModules)
    .flatMap(module => module.chunks).map(chunk => chunk.replace(/^\/_next\//, '')));
  const bytes = [...chunks].reduce((sum, file) => sum + statSync(`.next/${file}`).size, 0);
  const route = manifestFile.replace(/^.*app\//, '/').replace(/\/?page_client-reference-manifest\.js$/, '') || '/';
  console.log(`Route JS ${route}: ${(bytes / 1024).toFixed(1)} KB`);
  if (bytes > limits.routeJavaScript) {
    failed = true;
    console.error(`Over budget: ${route} ships ${(bytes / 1024).toFixed(1)} KB of JavaScript (limit ${(limits.routeJavaScript / 1024).toFixed(1)} KB)`);
  }
}
let largestImage = { file: '', bytes: 0 };
for (const file of globSync('public/**/*.{png,jpg,jpeg,webp,avif,gif}')) {
  const bytes = statSync(file).size;
  if (bytes > largestImage.bytes) largestImage = { file, bytes };
}
console.log(`Largest image: ${largestImage.file} ${(largestImage.bytes / 1024).toFixed(1)} KB / ${(limits.largestImage / 1024).toFixed(1)} KB`);
if (largestImage.bytes > limits.largestImage) {
  failed = true;
  console.error(`Over budget: ${largestImage.file} is larger than the image limit`);
}
if (failed) process.exitCode = 1;
