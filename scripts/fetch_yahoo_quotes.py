"""Daily closes from Yahoo Finance via yfinance.

Yahoo rejects plain HTTP clients from CI runners (HTTP 429); yfinance uses curl_cffi to present a
browser TLS fingerprint and handles Yahoo's cookie/crumb flow. Best effort: always exits 0 and
writes whatever it obtained so scripts/fetch-market-data.mjs can merge it with other sources.

Usage: python scripts/fetch_yahoo_quotes.py <symbols.txt> <out.json>
"""
import json
import math
import sys
from datetime import timezone

INR_SUFFIXES = (".NS", ".BO")


def close_time_iso(ticker, ts):
    day = ts.date().isoformat()
    if ticker.endswith(INR_SUFFIXES):
        return f"{day}T10:00:00.000Z"  # 15:30 IST
    if ticker.endswith("=X"):
        return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return f"{day}T20:00:00.000Z"  # US close (16:00 New York, summer time)


def currency_for(ticker):
    return "INR" if ticker.endswith(INR_SUFFIXES) or ticker == "INR=X" else "USD"


def main():
    symbols_path, out_path = sys.argv[1], sys.argv[2]
    with open(symbols_path, encoding="utf-8") as fh:
        tickers = [line.strip() for line in fh if line.strip()]

    quotes = {}
    try:
        import yfinance as yf

        data = yf.download(
            tickers, period="5d", interval="1d", group_by="ticker",
            auto_adjust=False, progress=False, threads=True,
        )
        for ticker in tickers:
            try:
                frame = data[ticker] if len(tickers) > 1 else data
                closes = frame["Close"].dropna()
                closes = closes[[not math.isnan(float(v)) and float(v) > 0 for v in closes]]
                if closes.empty:
                    continue
                price = float(closes.iloc[-1])
                previous = float(closes.iloc[-2]) if len(closes) > 1 else price
                quotes[ticker] = {
                    "price": round(price, 2),
                    "previousClose": round(previous, 2),
                    "currency": currency_for(ticker),
                    "asOf": close_time_iso(ticker, closes.index[-1].to_pydatetime()),
                }
            except Exception as error:  # noqa: BLE001 - one bad ticker must not drop the rest
                print(f"yfinance: no close for {ticker}: {error}", file=sys.stderr)
    except Exception as error:  # noqa: BLE001
        print(f"::warning::yfinance download failed: {error}", file=sys.stderr)

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(quotes, fh)
    print(f"yfinance: {len(quotes)}/{len(tickers)} closes")


if __name__ == "__main__":
    main()
