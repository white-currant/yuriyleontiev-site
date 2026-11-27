import { BlockList, isIP } from 'node:net';

const home = 'https://yuriyleontiev.music/';
const feeds = [
  {
    agent: /(?:^|[\s;(])OAI-SearchBot\/\d+(?:\.\d+)*(?=$|[\s;)])/i,
    url: 'https://openai.com/searchbot.json',
  },
  {
    agent: /(?:^|[\s;(])ChatGPT-User\/\d+(?:\.\d+)*(?=$|[\s;)])/i,
    url: 'https://openai.com/chatgpt-user.json',
  },
  {
    agent: /(?:^|[\s;(])PerplexityBot\/\d+(?:\.\d+)*(?=$|[\s;)])/i,
    url: 'https://www.perplexity.ai/perplexitybot.json',
  },
];
const cacheHeaders = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  Vary: '*',
};

function asBlockList({ prefixes }) {
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    throw new Error('Missing IP prefixes');
  }

  const allowlist = new BlockList();
  for (const { ipv4Prefix, ipv6Prefix } of prefixes) {
    const [address, mask, extra] = (ipv4Prefix ?? ipv6Prefix ?? '').split('/');
    const family = isIP(address);
    const bits = Number(mask);
    if (extra !== undefined || !/^\d+$/.test(mask) || bits === 0 ||
        family !== (ipv4Prefix ? 4 : 6) || bits > (family === 4 ? 32 : 128)) {
      throw new Error('Invalid IP prefix');
    }
    allowlist.addSubnet(address, bits, family === 4 ? 'ipv4' : 'ipv6');
  }
  return allowlist;
}

export function createPilot(commission, forward = fetch, now = Date.now) {
  // Change the wrapper only. Commission is the source for every credit and link.
  const portfolio = commission
    .replace(/<style>[\s\S]*?<\/style>\s*/i, '')
    .replace(/^<link rel="stylesheet" href="\/fonts\.css">\s*/m, '')
    .replace('<link rel="canonical" href="https://yuriyleontiev.music/commission/">', `<link rel="canonical" href="${home}">`);
  const ranges = new Map();

  async function verified(request) {
    // CF-Connecting-IP is edge-managed on a direct request to the proxied zone.
    // Same-zone Worker subrequests can supply their own x-real-ip.
    if (!request.cf || request.headers.has('CF-Worker')) return false;
    const ip = request.headers.get('CF-Connecting-IP') ?? '';
    const family = isIP(ip);
    if (!family) return false;

    const userAgent = request.headers.get('User-Agent') ?? '';
    const feed = feeds.find(({ agent }) => agent.test(userAgent));
    if (!feed) return false;

    let snapshot = ranges.get(feed.url);
    if (!snapshot || snapshot.expires <= now()) {
      try {
        const response = await forward(feed.url, {
          cache: 'no-store',
          redirect: 'manual',
          signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) throw new Error('IP feed unavailable');
        snapshot = { allowlist: asBlockList(await response.json()), expires: now() + 3600_000 };
      } catch {
        // An unavailable or invalid feed never authenticates a request.
        snapshot = { allowlist: null, expires: now() + 30_000 };
      }
      ranges.set(feed.url, snapshot);
    }

    return snapshot.allowlist?.check(ip, family === 4 ? 'ipv4' : 'ipv6') === true;
  }

  return async (request) => {
    if (request.url !== home || !['GET', 'HEAD'].includes(request.method)) {
      return forward(request, { redirect: 'manual' });
    }

    if (await verified(request)) {
      return new Response(request.method === 'HEAD' ? null : portfolio, {
        headers: {
          ...cacheHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Language': 'en',
          'X-Portfolio-Variant': 'commission',
        },
      });
    }

    const upstream = await forward(request, { cache: 'no-store', redirect: 'manual' });
    const response = new Response(upstream.body, upstream);
    for (const [name, value] of Object.entries(cacheHeaders)) {
      response.headers.set(name, value);
    }
    return response;
  };
}
