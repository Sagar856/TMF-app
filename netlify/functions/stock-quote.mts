const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    let symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Symbol required' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Alias resolution for popular Indian stocks
    if (symbol === 'NALCO') symbol = 'NATIONALUM';
    if (symbol === 'SBI') symbol = 'SBIN';
    if (symbol === 'RIL') symbol = 'RELIANCE';

    // Format ticker for Yahoo Finance (add .NS for standard Indian symbols unless already specified)
    let yahooTicker = symbol;
    const usSymbols = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA', 'META', 'SPY', 'QQQ'];
    if (!usSymbols.includes(symbol) && !symbol.includes('.')) {
      yahooTicker = `${symbol}.NS`;
    }

    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=1d`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const yahooRes = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (yahooRes.ok) {
      const json: any = await yahooRes.json();
      const result = json?.chart?.result?.[0];
      const meta = result?.meta;
      if (meta && typeof meta.regularMarketPrice === 'number') {
        const price = meta.regularMarketPrice;
        const prevClose = meta.previousClose || meta.chartPreviousClose || price;
        const diff = Math.round((price - prevClose) * 100) / 100;
        const diffPct = prevClose > 0 ? Math.round((diff / prevClose) * 10000) / 100 : 0;

        return new Response(
          JSON.stringify({
            symbol: symbol,
            yahooTicker: yahooTicker,
            currentPrice: price,
            previousClose: prevClose,
            change: diff,
            changePercent: diffPct,
            currency: meta.currency || 'INR',
            exchange: meta.exchangeName || 'NSE',
            lastUpdated: new Date().toISOString(),
            source: 'NSE/BSE (Live)',
            status: 'live',
          }),
          {
            status: 200,
            headers: corsHeaders,
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Quote unavailable', rawStatus: yahooRes.status }),
      {
        status: yahooRes.status || 500,
        headers: corsHeaders,
      }
    );
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    return new Response(
      JSON.stringify({ error: isTimeout ? 'Timeout' : err?.message || 'Server error' }),
      {
        status: isTimeout ? 504 : 500,
        headers: corsHeaders,
      }
    );
  }
};
