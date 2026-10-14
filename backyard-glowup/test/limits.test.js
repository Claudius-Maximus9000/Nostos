import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, createDailyLimits } from '../src/limits.js';

test('each address has its own allowance, and a refused request uses nothing up', () => {
  const limits = createDailyLimits({ perIp: 2, perDay: 3, now: () => Date.parse('2026-10-14T10:00:00Z') });
  assert.equal(limits.take('a'), null);
  assert.equal(limits.take('a'), null);
  assert.equal(limits.take('a'), 'ip');
  assert.equal(limits.take('a'), 'ip');
  assert.equal(limits.take('b'), null);
  assert.equal(limits.take('c'), 'day');
  assert.equal(limits.take('b'), 'day');
});

test('a caller over their own limit hears about that before the whole-server cap', () => {
  const limits = createDailyLimits({ perIp: 1, perDay: 1, now: () => 0 });
  assert.equal(limits.take('a'), null);
  assert.equal(limits.take('a'), 'ip');
  assert.equal(limits.take('b'), 'day');
});

test('counts start over at midnight UTC, not before', () => {
  let time = Date.parse('2026-10-14T23:59:59.999Z');
  const limits = createDailyLimits({ perIp: 1, perDay: 1, now: () => time });
  assert.equal(limits.take('a'), null);
  assert.equal(limits.take('b'), 'day');
  time = Date.parse('2026-10-15T00:00:00Z');
  assert.equal(limits.take('a'), null);
  assert.equal(limits.take('a'), 'ip');
});

test('a use handed back is free again for the caller and the day', () => {
  const limits = createDailyLimits({ perIp: 1, perDay: 2, now: () => 0 });
  assert.equal(limits.take('a'), null);
  limits.giveBack('a');
  assert.equal(limits.take('a'), null);
  assert.equal(limits.take('a'), 'ip');
  assert.equal(limits.take('b'), null);
  assert.equal(limits.take('c'), 'day');
  // Handing back what was never taken changes nothing.
  limits.giveBack('c');
  assert.equal(limits.take('c'), 'day');
});

test('a limit left out is unlimited', () => {
  const perIpOnly = createDailyLimits({ perIp: 1, now: () => 0 });
  for (let i = 0; i < 50; i++) assert.equal(perIpOnly.take(`ip-${i}`), null);
  assert.equal(perIpOnly.take('ip-0'), 'ip');

  const perDayOnly = createDailyLimits({ perDay: 50, now: () => 0 });
  for (let i = 0; i < 50; i++) assert.equal(perDayOnly.take('a'), null);
  assert.equal(perDayOnly.take('a'), 'day');
});

const req = (headers, remoteAddress = '198.51.100.7') => ({ headers, socket: { remoteAddress } });

test('the connection address counts unless the server sits behind a trusted proxy', () => {
  const forwarded = { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' };
  assert.equal(clientIp(req(forwarded), false), '198.51.100.7');
  assert.equal(clientIp(req(forwarded), true), '203.0.113.5');
  assert.equal(clientIp(req({ 'x-forwarded-for': ' 203.0.113.9 ' }), true), '203.0.113.9');
});

test('behind a proxy with no forwarded address, the connection address counts', () => {
  assert.equal(clientIp(req({}), true), '198.51.100.7');
  assert.equal(clientIp(req({ 'x-forwarded-for': ' , 10.0.0.1' }), true), '198.51.100.7');
  assert.equal(clientIp(req({}, null), false), 'unknown');
});
