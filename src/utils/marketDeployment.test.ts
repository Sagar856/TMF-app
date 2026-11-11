import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Vercel excludes the data-only branch, including its orphan commits', () => {
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.git.deploymentEnabled['market-data'], false);
  const workflow = readFileSync(new URL('../../.github/workflows/market-data.yml', import.meta.url), 'utf8');
  assert.ok(workflow.includes('cp vercel.json publish/vercel.json'));
  assert.ok(workflow.indexOf('cp vercel.json publish/vercel.json') < workflow.indexOf('git add .'));
});
