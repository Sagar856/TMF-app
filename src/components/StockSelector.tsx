import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, TrendingUp, Sparkles, Building2 } from 'lucide-react';
import { StockItem, POPULAR_STOCKS_CATALOG, searchStocksCatalog } from '../services/stocksDatabase';

interface StockSelectorProps {
  selectedSymbol: string;
  currencySymbol: string;
  onSelect: (stock: StockItem) => void;
  onCustomSymbolChange?: (symbol: string) => void;
}

const SECTOR_PILLS = [
  'All',
  'Metals & Mining',
  'Banking & Finance',
  'Information Technology',
  'Automobile',
  'Energy & Power',
  'FMCG & Retail',
  'Defense & PSU',
  'Healthcare & Pharma',
  'ETFs & Index',
  'Global Tech',
];

export const StockSelector: React.FC<StockSelectorProps> = ({
  selectedSymbol,
  currencySymbol,
  onSelect,
  onCustomSymbolChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('All');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredStocks = useMemo(() => {
    return searchStocksCatalog(searchQuery, selectedSector);
  }, [searchQuery, selectedSector]);

  const currentSelectedStock = useMemo(() => {
    const clean = selectedSymbol.trim().toUpperCase();
    return POPULAR_STOCKS_CATALOG.find(
      (s) => s.symbol === clean || s.aliases?.some((a) => a.toUpperCase() === clean)
    );
  }, [selectedSymbol]);

  const handleSelect = (stock: StockItem) => {
    onSelect(stock);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleCustomApply = () => {
    if (searchQuery.trim()) {
      const sym = searchQuery.trim().toUpperCase();
      if (onCustomSymbolChange) {
        onCustomSymbolChange(sym);
      }
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1 flex items-center justify-between">
        <span>Select Stock / Share (NSE / BSE)</span>
        <span className="text-[9px] text-cyan-400 font-mono">
          {currentSelectedStock ? `${currentSelectedStock.exchange}: ${currentSelectedStock.symbol}` : 'Searchable Catalog'}
        </span>
      </label>

      {/* Button displaying currently selected stock */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 bg-[#181820] hover:bg-[#1e1e28] border border-[#333] hover:border-[#555] rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-red-950/60 border border-red-700/50 flex items-center justify-center text-red-400 shrink-0">
            <Building2 className="w-3.5 h-3.5" />
          </div>
          <div className="truncate">
            {currentSelectedStock ? (
              <div className="flex items-center gap-2 truncate">
                <span className="text-xs font-bold text-white truncate">{currentSelectedStock.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-[#252535] text-cyan-400 rounded font-mono font-bold shrink-0">
                  {currentSelectedStock.exchange}: {currentSelectedStock.symbol}
                </span>
              </div>
            ) : selectedSymbol ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">{selectedSymbol}</span>
                <span className="text-[10px] text-[#777]">(Custom Ticker)</span>
              </div>
            ) : (
              <span className="text-xs text-[#777]">Search or choose stock (e.g. NALCO, RELIANCE)...</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {currentSelectedStock && (
            <span className="text-xs font-bold text-emerald-400">
              {currencySymbol}{currentSelectedStock.basePrice.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-[#888] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#14141c] border border-[#2e2e3e] rounded-2xl shadow-2xl z-50 p-3 max-h-[360px] flex flex-col font-mono animate-in fade-in zoom-in-95 duration-100">
          {/* Search Bar */}
          <div className="relative mb-2 shrink-0">
            <Search className="w-3.5 h-3.5 text-[#777] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, symbol, or alias (e.g. NALCO, Tata, HDFC)..."
              className="w-full pl-9 pr-3 py-2 bg-[#1b1b26] border border-[#37374a] rounded-xl text-xs text-white placeholder-[#666] focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Sector Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-none shrink-0 border-b border-[#252533]">
            {SECTOR_PILLS.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setSelectedSector(sec)}
                className={`px-2 py-0.5 rounded-lg text-[9px] whitespace-nowrap transition-colors cursor-pointer ${
                  selectedSector === sec
                    ? 'bg-red-600 text-white font-bold'
                    : 'bg-[#1e1e2c] text-[#888] hover:text-white hover:bg-[#28283a]'
                }`}
              >
                {sec}
              </button>
            ))}
          </div>

          {/* Stock List */}
          <div className="overflow-y-auto space-y-1 pr-1 flex-1">
            {filteredStocks.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#777]">
                <p>No matching stocks found for "{searchQuery}".</p>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={handleCustomApply}
                    className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] rounded-lg font-bold transition-colors cursor-pointer"
                  >
                    Use "{searchQuery.trim().toUpperCase()}" as Custom Ticker
                  </button>
                )}
              </div>
            ) : (
              filteredStocks.map((stock) => {
                const isSelected = selectedSymbol.toUpperCase() === stock.symbol;
                return (
                  <button
                    key={stock.symbol}
                    type="button"
                    onClick={() => handleSelect(stock)}
                    className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-red-950/40 border border-red-700/60 text-white'
                        : 'bg-[#181824] hover:bg-[#202030] text-[#ccc] border border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">{stock.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 bg-[#222232] text-cyan-400 rounded uppercase font-bold shrink-0">
                          {stock.exchange}: {stock.symbol}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#777] flex items-center gap-2 mt-0.5">
                        <span>{stock.sector}</span>
                        {stock.category && (
                          <>
                            <span>•</span>
                            <span>{stock.category}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-emerald-400">
                        {currencySymbol}{stock.basePrice.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[9px] text-[#666]">
                        Prev {currencySymbol}{stock.previousClose}
                      </div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-red-400 shrink-0 ml-1" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
