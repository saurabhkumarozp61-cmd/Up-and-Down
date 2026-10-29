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
  const [, data, signature] = token.split('.');
  const tamperedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  const base64UrlAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const lastSignatureCharIndex = base64UrlAlphabet.indexOf(signature.at(-1)!);
  assert.equal(lastSignatureCharIndex % 4, 0);
  const aliasedSignature =
    `${signature.slice(0, -1)}${base64UrlAlphabet[lastSignatureCharIndex + 1]}`;

  assert.equal(verifyInAppToken(`inapp.${data}.${tamperedSignature}`), null);
  assert.deepEqual(
    Buffer.from(aliasedSignature, 'base64url'),
    Buffer.from(signature, 'base64url'),
    'the altered final character must decode to the same signature bytes'
  );
  assert.equal(verifyInAppToken(`inapp.${data}.${aliasedSignature}`), null);
  assert.equal(
    verifyInAppToken('eyJhbGciOiJub25lIn0.eyJ1aWQiOiJvd25lci1zYXVyYWJoIn0.'),
    null
  );
});
