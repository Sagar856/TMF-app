import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('location consent is shared by transaction forms rather than hidden inside the investment branch', () => {
  const source = readFileSync(new URL('./EditTransactionModal.tsx', import.meta.url), 'utf8');
  const permission = source.indexOf('{showLocationPermission && (');
  assert.ok(permission > source.lastIndexOf('</form>'), 'Permission disclosure must render outside every category-specific form');
  assert.equal(source.match(/\{showLocationPermission && \(/g)?.length, 1);
  assert.match(source, /if \(!granted\) \{\s*setShowLocationPermission\(true\)/);
  assert.match(source, /requestDeviceLocationPermission\(\)/);
});
