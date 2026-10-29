import test from 'node:test';
import assert from 'node:assert/strict';
import { createInAppToken, verifyInAppToken } from './auth';

test('in-app session tokens verify their signed identity', () => {
  const payload = {
    uid: 'inapp-test-user',
    email: 'test@example.com',
    username: 'tester',
  };
  const token = createInAppToken(payload);

  assert.deepEqual(verifyInAppToken(token), payload);
});

test('in-app session verification rejects tampered and unsigned tokens', () => {
  const token = createInAppToken({
    uid: 'inapp-test-user',
    email: 'test@example.com',
  });
  const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

  assert.equal(verifyInAppToken(tampered), null);
  assert.equal(
    verifyInAppToken('eyJhbGciOiJub25lIn0.eyJ1aWQiOiJvd25lci1zYXVyYWJoIn0.'),
    null
  );
});
