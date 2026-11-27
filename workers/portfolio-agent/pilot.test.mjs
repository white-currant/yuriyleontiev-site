import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createPilot } from './pilot.mjs';

const home = 'https://yuriyleontiev.music/';
const chatgpt = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot';
const searchbot = 'Mozilla/5.0; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot';
const perplexity = 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)';
const commission = readFileSync(new URL('../../commission/index.html', import.meta.url), 'utf8');
const portfolio = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function request(agent, ip = '192.0.2.4', {
  url = home, method = 'GET', edge = true, headers = {},
} = {}) {
  const req = new Request(url, {
    method,
    headers: { 'User-Agent': agent, 'CF-Connecting-IP': ip, ...headers },
  });
  if (edge) Object.defineProperty(req, 'cf', { value: {} });
  return req;
}

function setup() {
  const feeds = new Map([
    ['https://openai.com/searchbot.json', { prefixes: [{ ipv4Prefix: '203.0.113.96/28' }] }],
    ['https://openai.com/chatgpt-user.json', {
      prefixes: [{ ipv4Prefix: '192.0.2.32/28' }, { ipv6Prefix: '2001:db8::/48' }],
    }],
    ['https://www.perplexity.ai/perplexitybot.json', {
      prefixes: [{ ipv4Prefix: '198.51.100.4/32' }],
    }],
  ]);
  const calls = [];
  let time = 0;
  const serve = createPilot(commission, async (target, options) => {
    calls.push([target, options]);
    if (typeof target === 'string') {
      return feeds.has(target) ? Response.json(feeds.get(target)) : new Response(null, { status: 503 });
    }
    return new Response(target.method === 'HEAD' ? null : portfolio, {
      headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=600' },
    });
  }, () => time);
  return { serve, feeds, calls, advance: (ms) => { time += ms; } };
}

function assertUncacheable(response) {
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Vary'), '*');
}

test('ordinary visitors and other bots get the original HTML regardless of Accept', async () => {
  const { serve, calls } = setup();
  for (const agent of ['Mozilla/5.0', 'Googlebot/2.1', 'bingbot/2.0', 'GPTBot/1.4', 'Perplexity-User/1.0']) {
    const response = await serve(request(agent, '192.0.2.40', { headers: { Accept: 'text/markdown' } }));
    assert.equal(await response.text(), portfolio);
    assertUncacheable(response);
  }
  assert.equal(calls.length, 5);
  assert.ok(calls.every(([target, options]) => target instanceof Request && options.cache === 'no-store'));
});

test('only matching bot ranges get lightweight HTML with the exact Commission body', async () => {
  const { serve } = setup();
  for (const [agent, ip] of [[chatgpt, '192.0.2.40'], [chatgpt, '2001:db8::1'], [perplexity, '198.51.100.4'], [searchbot, '203.0.113.100']]) {
    const response = await serve(request(agent, ip));
    assert.equal(response.headers.get('X-Portfolio-Variant'), 'commission');
    assert.match(response.headers.get('Content-Type'), /^text\/html/);
    assertUncacheable(response);
    const html = await response.text();
    assert.equal(html.split('<body>')[1], commission.split('<body>')[1]);
    assert.doesNotMatch(html, /<style\b|<script\b|rel="stylesheet"/i);
    assert.match(html, /rel="canonical" href="https:\/\/yuriyleontiev\.music\/"/);
  }
  const head = await serve(request(chatgpt, '192.0.2.40', { method: 'HEAD' }));
  assert.equal(head.headers.get('X-Portfolio-Variant'), 'commission');
  assert.equal(await head.text(), '');
});

test('spoofed agents and IP headers are rejected, including after a verified request', async () => {
  const { serve } = setup();
  assert.equal((await serve(request(chatgpt, '192.0.2.40'))).headers.get('X-Portfolio-Variant'), 'commission');
  for (const req of [
    request(chatgpt, '192.0.2.4', { headers: { 'X-Forwarded-For': '192.0.2.40', 'X-Real-IP': '192.0.2.40' } }),
    request(chatgpt, '198.51.100.4'),
    request(searchbot, '192.0.2.40'),
    request(chatgpt, '203.0.113.100'),
    request(searchbot, '203.0.113.112', { headers: { 'X-Forwarded-For': '203.0.113.100' } }),
    request('GPTBot/1.4', '203.0.113.100'),
    request(perplexity, '192.0.2.40'),
    request(chatgpt, '', { headers: { 'X-Forwarded-For': '192.0.2.40' } }),
    request(chatgpt, '192.0.2.40', { edge: false }),
    request(chatgpt, '192.0.2.40', { headers: { 'CF-Worker': 'yuriyleontiev.music' } }),
  ]) {
    const response = await serve(req);
    assert.equal(response.headers.get('X-Portfolio-Variant'), null);
    assert.equal(await response.text(), portfolio);
    assertUncacheable(response);
  }
});

test('other paths and the query-string homepage pass through untouched', async () => {
  const { serve, calls } = setup();
  for (const path of ['commission/', 'fonts.css', 'robots.txt', '?lang=en']) {
    const response = await serve(request(searchbot, '203.0.113.100', { url: home + path }));
    assert.equal(await response.text(), portfolio);
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=600');
  }
  assert.equal(calls.length, 4);
  assert.ok(calls.every(([target]) => target instanceof Request));
});

test('failed refresh or invalid ranges give a normal page, including after an earlier match', async () => {
  const { serve, feeds, advance, calls } = setup();
  const source = 'https://openai.com/chatgpt-user.json';
  const handle = () => serve(request(chatgpt, '192.0.2.40'));
  assert.equal((await handle()).headers.get('X-Portfolio-Variant'), 'commission');
  feeds.delete(source);
  advance(3600_001);
  assert.equal(await (await handle()).text(), portfolio);
  assert.equal(await (await handle()).text(), portfolio);
  assert.equal(calls.filter(([target]) => target === source).length, 2);
  advance(30_001);
  feeds.set(source, { prefixes: [{ ipv4Prefix: '0.0.0.0/0' }] });
  assert.equal(await (await handle()).text(), portfolio);
});
