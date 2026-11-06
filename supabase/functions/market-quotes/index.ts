// Supabase Edge Function: on-demand (intraday) stock quotes for signed-in MINARTH users.
// Deploy with .github/workflows/deploy-supabase-functions.yml (or the dashboard editor) and
// create the cache tables with supabase_market_quotes.sql first.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  type IntradayQuote,
  type QuoteRequest,
  USD_INR_TICKER,
  googleTickers,
  isBlockedStatus,
  parseGoogleFinance,
  parseQuoteRequests,
  parseYahooChart,
} from './quotes.ts';

/** Shared cache: every user asking for the same ticker within this window reuses one upstream call. */
const CACHE_TTL_MS = 15 * 60_000;
/** When the last trade was well before the fetch, the market was closed; the close will not change soon. */
const CLOSED_MARKET_TTL_MS = 2 * 60 * 60_000;
const PROVIDER_COOLDOWN_MS = 30 * 60_000;
const UPSTREAM_TIMEOUT_MS = 5_000;
/** Stop starting upstream calls after this long so the response returns well inside client timeouts. */
const FETCH_BUDGET_MS = 15_000;
const CONCURRENCY = 6;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  'Accept-Language': 'en-IN,en;q=0.9',
};

type Provider = 'yahoo' | 'google';

interface CacheRow {
  ticker: string;
  price: number;
  previous_close: number;
  currency: string;
  as_of: string;
  source: string;
  fetched_at: string;
}

class BlockedError extends Error {
  constructor(public status: number) {
    super(`Blocked with HTTP ${status}`);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

async function upstream(url: string, accept: string): Promise<Response | null> {
  const res = await fetch(url, { headers: { ...UPSTREAM_HEADERS, Accept: accept }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (isBlockedStatus(res.status)) {
    await res.body?.cancel();
    throw new BlockedError(res.status);
  }
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  return res;
}

async function fromYahoo(request: QuoteRequest): Promise<IntradayQuote | null> {
  const res = await upstream(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(request.ticker)}?range=1d&interval=1d`,
    'application/json'
  );
  return res ? parseYahooChart(await res.json()) : null;
}

async function fromGoogle(request: QuoteRequest): Promise<IntradayQuote | null> {
  for (const id of googleTickers(request)) {
    const res = await upstream(`https://www.google.com/finance/quote/${encodeURIComponent(id)}?hl=en`, 'text/html');
    const quote = res ? parseGoogleFinance(await res.text()) : null;
    if (quote) return quote;
  }
  return null;
}

const PROVIDERS: Record<Provider, (request: QuoteRequest) => Promise<IntradayQuote | null>> = {
  yahoo: fromYahoo,
  google: fromGoogle,
};

function isCacheFresh(row: CacheRow, now: number): boolean {
  const fetchedAt = Date.parse(row.fetched_at);
  const marketWasClosed = fetchedAt - Date.parse(row.as_of) > 30 * 60_000;
  return now - fetchedAt < (marketWasClosed ? CLOSED_MARKET_TTL_MS : CACHE_TTL_MS);
}

const toQuote = (row: CacheRow): IntradayQuote => ({
  price: Number(row.price),
  previousClose: Number(row.previous_close),
  currency: row.currency,
  asOf: new Date(row.as_of).toISOString(),
  source: row.source,
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Function is not configured' }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Only signed-in users may use the proxy, so it cannot be abused as an open relay.
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const { data: userData, error: userError } = token ? await admin.auth.getUser(token) : { data: { user: null }, error: null };
  if (userError || !userData?.user) return json({ error: 'Sign in required' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const requests = parseQuoteRequests(body);
  if (requests.some((r) => r.exchange === 'US')) {
    requests.push({ key: 'USDINR', exchange: 'US', ticker: USD_INR_TICKER });
  }
  if (!requests.length) return json({ quotes: {}, fx: {}, unavailable: [] });

  const started = Date.now();
  const tickers = requests.map((r) => r.ticker);
  const [{ data: cachedRows }, { data: providerRows }] = await Promise.all([
    admin.from('market_quotes').select('ticker, price, previous_close, currency, as_of, source, fetched_at').in('ticker', tickers),
    admin.from('market_quote_providers').select('provider, blocked_until'),
  ]);
  const cache = new Map<string, CacheRow>((cachedRows as CacheRow[] | null || []).map((row) => [row.ticker, row]));
  const blockedUntil = new Map<string, number>(
    ((providerRows as Array<{ provider: string; blocked_until: string }> | null) || []).map((row) => [row.provider, Date.parse(row.blocked_until)])
  );
  const available = (provider: Provider) => !(blockedUntil.get(provider)! > Date.now());
  const newlyBlocked = new Map<Provider, number>();

  const stale = requests.filter((r) => !cache.has(r.ticker) || !isCacheFresh(cache.get(r.ticker)!, started));
  const fetched: CacheRow[] = [];

  const work = async (request: QuoteRequest) => {
    for (const provider of ['yahoo', 'google'] as Provider[]) {
      if (!available(provider) || Date.now() - started > FETCH_BUDGET_MS) continue;
      try {
        const quote = await PROVIDERS[provider](request);
        if (quote) {
          fetched.push({
            ticker: request.ticker,
            price: quote.price,
            previous_close: quote.previousClose,
            currency: quote.currency,
            as_of: quote.asOf,
            source: quote.source,
            fetched_at: new Date().toISOString(),
          });
          return;
        }
      } catch (error) {
        if (error instanceof BlockedError) {
          // Back off from a throttling provider for everyone instead of hammering it.
          blockedUntil.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
          newlyBlocked.set(provider, error.status);
        }
      }
    }
  };
  for (let i = 0; i < stale.length; i += CONCURRENCY) {
    await Promise.all(stale.slice(i, i + CONCURRENCY).map(work));
  }

  const writes: Promise<unknown>[] = [];
  if (fetched.length) writes.push(admin.from('market_quotes').upsert(fetched, { onConflict: 'ticker' }));
  if (newlyBlocked.size) {
    writes.push(admin.from('market_quote_providers').upsert(
      [...newlyBlocked].map(([provider, status]) => ({
        provider,
        blocked_until: new Date(blockedUntil.get(provider)!).toISOString(),
        last_status: status,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'provider' }
    ));
  }
  await Promise.all(writes);

  fetched.forEach((row) => cache.set(row.ticker, row));
  const quotes: Record<string, IntradayQuote> = {};
  const fx: Record<string, { rate: number; asOf: string; source: string }> = {};
  const unavailable: string[] = [];
  for (const request of requests) {
    // A stale cached quote is still returned; the app keeps whichever price is newest.
    const row = cache.get(request.ticker);
    if (!row) {
      if (request.ticker !== USD_INR_TICKER) unavailable.push(request.key);
      continue;
    }
    const quote = toQuote(row);
    if (request.ticker === USD_INR_TICKER) fx.USDINR = { rate: quote.price, asOf: quote.asOf, source: quote.source };
    else quotes[request.key] = quote;
  }

  return json({
    quotes,
    fx,
    unavailable,
    throttled: [...blockedUntil].filter(([, until]) => until > Date.now()).map(([provider]) => provider),
  });
});
