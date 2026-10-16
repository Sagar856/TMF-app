import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import https from 'https';
import http from 'http';

function stockQuotePlugin(): Plugin {
  return {
    name: 'stock-quote-api',
    configureServer(server) {
      server.middlewares.use('/api/stock-quote', (req, res) => {
        try {
          const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
          let symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
          if (!symbol) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Symbol required' }));
            return;
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
          const reqOptions = {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json',
            },
          };

          const clientReq = https.get(targetUrl, reqOptions, (clientRes) => {
            let data = '';
            clientRes.on('data', (chunk) => {
              data += chunk;
            });
            clientRes.on('end', () => {
              try {
                if (clientRes.statusCode && clientRes.statusCode >= 200 && clientRes.statusCode < 300) {
                  const json = JSON.parse(data);
                  const result = json?.chart?.result?.[0];
                  const meta = result?.meta;
                  if (meta && typeof meta.regularMarketPrice === 'number') {
                    const price = meta.regularMarketPrice;
                    const prevClose = meta.previousClose || meta.chartPreviousClose || price;
                    const diff = Math.round((price - prevClose) * 100) / 100;
                    const diffPct = prevClose > 0 ? Math.round((diff / prevClose) * 10000) / 100 : 0;
                    
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
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
                    }));
                    return;
                  }
                }
                res.statusCode = clientRes.statusCode || 500;
                res.end(JSON.stringify({ error: 'Quote unavailable', rawStatus: clientRes.statusCode }));
              } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Parse failed' }));
              }
            });
          });

          clientReq.on('error', (err) => {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          });
          clientReq.setTimeout(5000, () => {
            clientReq.destroy();
            res.statusCode = 504;
            res.end(JSON.stringify({ error: 'Timeout' }));
          });
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err?.message || 'Server error' }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    stockQuotePlugin(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});

