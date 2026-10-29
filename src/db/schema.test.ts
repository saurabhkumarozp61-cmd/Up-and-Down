import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const sqlSchema = readFileSync(join(projectRoot, 'supabase/schema.sql'), 'utf8');
const drizzleSchema = readFileSync(join(projectRoot, 'src/db/schema.ts'), 'utf8');

test('SQL and Drizzle agree on gateway ledger fields and precise INR amounts', () => {
  for (const field of [
    'username',
    'user_email',
    'amount_inr',
    'gateway_order_id',
    'gateway_payment_id',
    'gateway_signature',
  ]) {
    assert.match(sqlSchema, new RegExp(`\\b${field}\\b`));
    assert.match(drizzleSchema, new RegExp(`['\"]${field}['\"]`));
  }
  assert.match(sqlSchema, /amount_inr NUMERIC\(14, 2\) NOT NULL/);
  assert.match(drizzleSchema, /numeric\('amount_inr',[\s\S]*?precision: 14,[\s\S]*?scale: 2,[\s\S]*?mode: 'number'/);
  assert.match(sqlSchema, /username TEXT NOT NULL/);
  assert.match(sqlSchema, /user_email TEXT NOT NULL/);
});

test('SQL and Drizzle use the same partial unique payment-reference indexes', () => {
  for (const indexName of [
    'wallet_transactions_gateway_order_id_unique',
    'wallet_transactions_utr_number_unique',
    'wallet_transactions_gateway_payment_id_unique',
  ]) {
    assert.match(sqlSchema, new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName}[\\s\\S]*?WHERE [a-z_]+ IS NOT NULL;`));
    assert.ok(drizzleSchema.includes(`uniqueIndex('${indexName}')`));
  }
  assert.equal((drizzleSchema.match(/\.where\(sql`\$\{table\.[A-Za-z]+\} IS NOT NULL`\)/g) || []).length, 3);
});

test('SQL and Drizzle both use the runtime trade share column and early-exit action', () => {
  assert.match(sqlSchema, /shares NUMERIC\(14, 4\) NOT NULL/);
  assert.match(sqlSchema, /action IN \('BUY', 'SELL_EARLY'\)/);
  assert.match(drizzleSchema, /numeric\('shares',[\s\S]*?precision: 14,[\s\S]*?scale: 4/);
  assert.match(drizzleSchema, /'SELL_EARLY'/);
});
