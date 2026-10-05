import test from 'node:test';
import assert from 'node:assert/strict';
import { POLICY, businessDate, scheduledInstant } from '../src/domain/policy.ts';
import { readConfiguration } from '../src/config.ts';

test('Vietnam midnight uses the actual Vietnam date, not UTC date', () => {
  assert.equal(businessDate(new Date('2026-10-04T16:59:59Z')), '2026-10-04');
  assert.equal(businessDate(new Date('2026-10-04T17:00:00Z')), '2026-10-05');
});
test('10h publishing and 8h history are converted independently', () => {
  assert.equal(scheduledInstant('2026-10-05').toISOString(), '2026-10-05T03:00:00.000Z');
  assert.equal(scheduledInstant('2026-10-05', POLICY.historyCheckTime).toISOString(), '2026-10-05T01:00:00.000Z');
});
test('calendar normalization cannot silently move an invalid date', () => {
  for (const date of ['2026-02-30', '2026-13-01', '05/10/2026', '2026-2-01']) {
    assert.throws(() => scheduledInstant(date));
  }
  assert.equal(scheduledInstant('2028-02-29').toISOString(), '2028-02-29T03:00:00.000Z');
  assert.throws(() => scheduledInstant('2026-10-05', '24:00'));
  assert.throws(() => businessDate(new Date('bad')));
});
test('missing environment and fake integration outside local fail closed', () => {
  assert.throws(() => readConfiguration({}));
  for (const environment of ['staging', 'production']) {
    assert.throws(() => readConfiguration({ APP_ENV: environment, INTEGRATION_MODE: 'fake' }));
  }
  assert.deepEqual(readConfiguration({ APP_ENV: 'local', INTEGRATION_MODE: 'fake' }), {
    environment: 'local', integrationMode: 'fake',
  });
});
