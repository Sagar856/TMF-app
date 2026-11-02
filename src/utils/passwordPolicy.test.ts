import assert from 'node:assert/strict';
import test from 'node:test';
import { isStrongPassword, passwordRequirements } from './passwordPolicy';

test('password strength requires length, uppercase, lowercase, digits and a symbol', () => {
  for (const password of ['', 'short', 'Password', 'password1!', 'PASSWORD1!', 'Password!!', 'Password11', 'Pw1!']) {
    assert.equal(isStrongPassword(password), false, password);
  }
  assert.equal(isStrongPassword('Password1!'), true);
  assert.equal(isStrongPassword('Password1 '), false);
  assert.equal(passwordRequirements('').filter(item => item.met).length, 0);
  assert.equal(passwordRequirements('Password1!').filter(item => item.met).length, 5);
});
