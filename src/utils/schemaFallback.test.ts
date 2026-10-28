import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertWithSchemaFallback, SCHEMA_OUTDATED_HINT, type UpsertClientLike } from '../services/supabaseClient';

type Row = Record<string, unknown>;

function makeClient(missingColumns: string[]) {
  const calls: Row[][] = [];
  const client: UpsertClientLike = {
    from: () => ({
      upsert: async (rows: Row[]) => {
        calls.push(rows);
        const offending = missingColumns.find((col) => rows.some((r) => col in r));
        if (offending) {
          return {
            error: {
              code: 'PGRST204',
              message: `Could not find the '${offending}' column of 'transactions' in the schema cache`,
            },
          };
        }
        return { error: null };
      },
    }),
  };
  return { client, calls };
}

test('succeeds normally when the schema is up to date', async () => {
  const { client, calls } = makeClient([]);
  const result = await upsertWithSchemaFallback(client, 'transactions', [{ id: 't1', user_id: 'u', ref_number: 'X' }], 'transactions');
  assert.deepEqual(result, { success: true });
  assert.equal(calls.length, 1);
});

test('strips a column the live schema lacks, retries, and reports a schema warning', async () => {
  const { client, calls } = makeClient(['ref_number']);
  const rows = [{ id: 't1', user_id: 'u', title: 'Lunch', ref_number: 'UTR1' }];
  const result = await upsertWithSchemaFallback(client, 'transactions', rows, 'transactions');

  assert.equal(result.success, true);
  assert.equal(result.schemaOutdated, true);
  assert.match(result.warning || '', /ref_number/);
  assert.ok((result.warning || '').includes(SCHEMA_OUTDATED_HINT));
  assert.equal(calls.length, 2);
  assert.ok(!('ref_number' in calls[1][0]));
  assert.equal(calls[1][0].title, 'Lunch');
  // Caller's rows are not mutated
  assert.ok('ref_number' in rows[0]);
});

test('handles several missing columns across retries', async () => {
  const { client, calls } = makeClient(['ref_number', 'note']);
  const result = await upsertWithSchemaFallback(client, 'transactions', [{ id: 't1', user_id: 'u', ref_number: 'a', note: 'b' }], 'transactions');
  assert.equal(result.success, true);
  assert.equal(calls.length, 3);
  assert.match(result.warning || '', /ref_number, note/);
});

test('never strips identity columns and surfaces a hard error with the schema hint', async () => {
  const { client } = makeClient(['user_id']);
  const result = await upsertWithSchemaFallback(client, 'transactions', [{ id: 't1', user_id: 'u' }], 'transactions');
  assert.equal(result.success, false);
  assert.equal(result.schemaOutdated, true);
  assert.ok((result.error || '').includes(SCHEMA_OUTDATED_HINT));
});

test('returns a plain sync error for non-schema failures', async () => {
  const client: UpsertClientLike = {
    from: () => ({ upsert: async () => ({ error: { code: '42501', message: 'permission denied for table transactions' } }) }),
  };
  const result = await upsertWithSchemaFallback(client, 'transactions', [{ id: 't1', user_id: 'u' }], 'transactions');
  assert.equal(result.success, false);
  assert.equal(result.schemaOutdated, undefined);
  assert.match(result.error || '', /permission denied/);
});

test('recognises Postgres 42703 "column does not exist" as a missing column too', async () => {
  const client: UpsertClientLike = {
    from: () => ({
      upsert: async (rows: Row[]) =>
        rows.some((r) => 'deleted_at' in r)
          ? { error: { code: '42703', message: 'column transactions.deleted_at does not exist' } }
          : { error: null },
    }),
  };
  const result = await upsertWithSchemaFallback(client, 'transactions', [{ id: 't1', user_id: 'u', deleted_at: null }], 'transactions');
  assert.equal(result.success, true);
  assert.match(result.warning || '', /deleted_at/);
});
