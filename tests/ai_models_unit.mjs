/**
 * Unit tests for Ollama model catalog helpers (server-side pure exports).
 */
import { pathToFileURL } from 'url';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const {
  normalizeOllamaModels,
  mergeModelCatalog,
  isAllowedModel,
} = await import(pathToFileURL(resolve(ROOT, 'server.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ AI MODEL CATALOG ━━━');

const norm = normalizeOllamaModels({
  models: [
    { name: 'gemma4:31b-cloud', model: 'gemma4:31b-cloud', size: 1 },
    { name: 'gpt-oss:120b-cloud' },
  ],
});
check('normalize length 2', norm.length === 2);
check('normalize name', norm[0].name === 'gemma4:31b-cloud');

const merged = mergeModelCatalog(norm);
check('merge includes live', merged.some((m) => m.name === 'gemma4:31b-cloud'));
check('merge includes curated fallbacks', merged.length >= 2);
check('allow default model', isAllowedModel('gemma4:31b-cloud'));
check('reject empty', !isAllowedModel(''));
check('reject injection', !isAllowedModel('../evil'));
check('allow curated gpt-oss', isAllowedModel('gpt-oss:120b-cloud'));

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('ai_models_unit: ok');
