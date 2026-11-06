import { useMoneyFormatter } from '../hooks/useMoneyFormatter';
import React, { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { Search, ChevronDown, Check, Building2, Loader2 } from 'lucide-react';
import { useMarketSnapshot } from '../hooks/useMarketSnapshot';
import { useStockDirectory } from '../hooks/useStockDirectory';
import { getStockQuote, type MarketSnapshot } from '../utils/marketData';
import {
  MARKET_LABELS,
  findDirectoryStock,
  searchStockDirectory,
  type StockItem,
} from '../utils/stockDirectory';

const RESULT_LIMIT = 50;

/** Latest known price for a listing: an intraday quote when newer, otherwise the directory close. */
function withLatestQuote(stock: StockItem, snapshot: MarketSnapshot | null): StockItem {
  const quote = getStockQuote(snapshot, stock.symbol, stock.exchange);
  if (!quote || quote.currency !== stock.currency) return stock;
  return { ...stock, price: quote.price, previousClose: quote.previousClose, asOf: quote.asOf };
}

interface StockSelectorProps {
  selectedSymbol: string;
  /** Exchange of the selected holding ('NSE' | 'BSE' | 'US'); disambiguates dual listings. */
  selectedExchange?: string;
  currencySymbol: string;
  onSelect: (stock: StockItem) => void;
  onCustomSymbolChange?: (symbol: string) => void;
}

export const StockSelector: React.FC<StockSelectorProps> = ({
  selectedSymbol,
  selectedExchange,
  currencySymbol,
  onSelect,
  onCustomSymbolChange,
}) => {
  const formatAmount = useMoneyFormatter();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const marketSnapshot = useMarketSnapshot();
  const { status, directory } = useStockDirectory();
  const priceSymbol = (stock: StockItem) => (stock.currency === 'USD' ? '$' : currencySymbol);
  const asOfLabel = (stock: StockItem) => {
    if (!stock.asOf) return '';
    const date = new Date(stock.asOf);
    return isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = useMemo(
    () => searchStockDirectory(directory, deferredQuery, RESULT_LIMIT).map((stock) => withLatestQuote(stock, marketSnapshot)),
    [directory, deferredQuery, marketSnapshot]
  );

  const currentSelectedStock = useMemo(() => {
    const match = findDirectoryStock(directory, selectedSymbol, selectedExchange);
    return match ? withLatestQuote(match, marketSnapshot) : undefined;
  }, [directory, selectedSymbol, selectedExchange, marketSnapshot]);

  const customTicker = searchQuery.trim().toUpperCase().replace(/\s+/g, '');
  const hasExactMatch = results.some((stock) => stock.symbol === customTicker.replace(/\.(NS|BO)$/, ''));

  const handleSelect = (stock: StockItem) => {
    onSelect(stock);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleCustomApply = () => {
    if (customTicker) {
      onCustomSymbolChange?.(customTicker);
      setSearchQuery('');
      setIsOpen(false);
    }
  };

  const renderPrice = (stock: StockItem) => {
    if (stock.price === null) {
      return <div className="text-[10px] text-[#777]">No recent price</div>;
    }
    const change = stock.previousClose ? stock.price - stock.previousClose : 0;
    const changePct = stock.previousClose ? (change / stock.previousClose) * 100 : 0;
    return (
      <>
        <div className="text-xs font-bold text-emerald-400">
          {priceSymbol(stock)}{formatAmount(stock.price)}
        </div>
        <div className="text-[9px] text-[#777]">
          <span className={change > 0 ? 'text-emerald-500' : change < 0 ? 'text-red-400' : ''}>
            {change >= 0 ? '+' : ''}{changePct.toFixed(2)}%
          </span>
          {asOfLabel(stock) && <> · {asOfLabel(stock)}</>}
        </div>
      </>
    );
  };

  const totalListings = directory?.items.length ?? 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1 flex items-center justify-between">
        <span>Select Stock / ETF (NSE · BSE · US)</span>
        <span className="text-[9px] text-cyan-400 font-mono">
          {currentSelectedStock ? `${MARKET_LABELS[currentSelectedStock.market]}: ${currentSelectedStock.symbol}` : ''}
        </span>
      </label>

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 bg-[#181820] hover:bg-surface-3 border border-[#333] hover:border-line-strong rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-red-950/60 border border-red-700/50 flex items-center justify-center text-red-400 shrink-0">
            <Building2 className="w-3.5 h-3.5" />
          </div>
          <div className="truncate">
            {currentSelectedStock ? (
              <div className="flex items-center gap-2 truncate">
                <span className="text-xs font-bold text-white truncate">{currentSelectedStock.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-surface-2 text-cyan-400 rounded font-mono font-bold shrink-0">
                  {MARKET_LABELS[currentSelectedStock.market]}: {currentSelectedStock.symbol}
                </span>
              </div>
            ) : selectedSymbol ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">{selectedSymbol}</span>
                <span className="text-[10px] text-[#777]">(Custom Ticker)</span>
              </div>
            ) : (
              <span className="text-xs text-[#777]">Search any listed stock or ETF (e.g. RELIANCE, Infosys, AAPL)...</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {currentSelectedStock?.price != null && (
            <span className="text-xs font-bold text-emerald-400">
              {priceSymbol(currentSelectedStock)}{formatAmount(currentSelectedStock.price)}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-[#888] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-1 border border-line rounded-2xl shadow-2xl z-50 p-3 max-h-[360px] flex flex-col font-mono animate-in fade-in zoom-in-95 duration-100">
          <div className="relative mb-2 shrink-0">
            <Search className="w-3.5 h-3.5 text-[#777] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (results[0]) handleSelect(results[0]);
                  else handleCustomApply();
                }
              }}
              placeholder="Search by company name, symbol or ISIN..."
              aria-label="Search stocks"
              className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-white placeholder-content-3 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="overflow-y-auto space-y-1 pr-1 flex-1">
            {!directory && status !== 'unavailable' ? (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-[#777]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading the stock list...
              </div>
            ) : !directory ? (
              <div className="py-4 text-center text-xs text-[#777]">
                The stock list could not be loaded. Check your connection, or enter the ticker below.
              </div>
            ) : !searchQuery.trim() ? (
              <div className="py-6 text-center text-xs text-[#777]">
                Search {totalListings.toLocaleString()} listings on NSE, BSE and US exchanges.
              </div>
            ) : results.length === 0 ? (
              <div className="py-4 text-center text-xs text-[#777]">No listed stock matches "{searchQuery.trim()}".</div>
            ) : (
              results.map((stock) => {
                const isSelected = currentSelectedStock?.symbol === stock.symbol && currentSelectedStock.market === stock.market;
                return (
                  <button
                    key={`${stock.market}:${stock.symbol}`}
                    type="button"
                    onClick={() => handleSelect(stock)}
                    className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-red-950/40 border border-red-700/60 text-white'
                        : 'bg-surface-2 hover:bg-surface-3 text-[#ccc] border border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">{stock.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] px-1.5 py-0.2 bg-surface-3 text-cyan-400 rounded uppercase font-bold shrink-0">
                          {MARKET_LABELS[stock.market]}
                        </span>
                        <span className="text-[10px] text-[#999] truncate">{stock.symbol}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">{renderPrice(stock)}</div>

                    {isSelected && <Check className="w-4 h-4 text-red-400 shrink-0 ml-1" />}
                  </button>
                );
              })
            )}
            {results.length === RESULT_LIMIT && (
              <p className="py-1.5 text-center text-[10px] text-[#666]">Showing the top {RESULT_LIMIT} matches. Type more to narrow down.</p>
            )}
          </div>

          {customTicker && !hasExactMatch && onCustomSymbolChange && (
            <button
              type="button"
              onClick={handleCustomApply}
              className="mt-2 shrink-0 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-line text-[10px] text-[#ccc] rounded-lg transition-colors cursor-pointer"
            >
              Not listed? Use "{customTicker}" as a custom ticker
            </button>
          )}
        </div>
      )}
    </div>
  );
};
