import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import worker from '../src/worker.ts';
import { createLocalServer } from '../scripts/dev.mjs';

test('health reports liveness without claiming readiness or leaking account details', async () => {
  const response = await worker.fetch(new Request('https://local.invalid/health'), { APP_ENV: 'local', INTEGRATION_MODE: 'fake' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.publishingImplemented, false);
  assert.equal(body.databaseChecked, false);
  assert.equal(body.schedulerImplemented, false);
  assert.equal(JSON.stringify(body).includes('tranthanhtung37'), false);
});
test('an unconfigured or fake production worker fails closed', async () => {
  for (const bindings of [{}, { APP_ENV: 'production', INTEGRATION_MODE: 'fake' }]) {
    const response = await worker.fetch(new Request('https://local.invalid/health'), bindings);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'CONFIGURATION_NOT_READY');
  }
});
test('publishing endpoints cannot claim success before implementation', async () => {
  for (const path of ['/api/trial-publish', '/api/publishing/resume']) {
    const response = await worker.fetch(new Request(`https://local.invalid${path}`, { method: 'POST' }), { APP_ENV: 'local', INTEGRATION_MODE: 'fake' });
    assert.equal(response.status, 501);
  }
});
test('loopback server serves the worker over real HTTP', async () => {
  const server = createLocalServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).integrationMode, 'fake');
    const missing = await fetch(`http://127.0.0.1:${address.port}/missing`);
    assert.equal(missing.status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
