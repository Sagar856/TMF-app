import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { fetchMutualFundNav, searchMutualFunds, type MutualFundSearchResult } from '../services/marketDataService';
import { normalizeNavDate } from '../utils/marketData';

export interface SelectedMutualFund {
  schemeCode: string;
  schemeName: string;
  latestNav?: number;
  navDate?: string;
}

interface MutualFundSelectorProps {
  schemeCode: string;
  schemeName: string;
  currencySymbol: string;
  onSelect: (fund: SelectedMutualFund) => void;
  /** Called when the user types a name without picking a scheme (offline/manual entry). */
  onManualNameChange: (name: string) => void;
}

export const MutualFundSelector: React.FC<MutualFundSelectorProps> = ({
  schemeCode,
  schemeName,
  currencySymbol,
  onSelect,
  onManualNameChange,
}) => {
  const [query, setQuery] = useState(schemeName);
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<MutualFundSearchResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');
  const [latest, setLatest] = useState<{ nav: number; date: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(schemeName);
  }, [schemeName]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced AMFI search across all schemes.
  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (q.length < 3 || (schemeCode && q === schemeName)) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    const timer = setTimeout(() => {
      searchMutualFunds(q, controller.signal)
        .then((items) => {
          setResults(items.slice(0, 30));
          setStatus(items.length ? 'idle' : 'empty');
        })
        .catch((error) => {
          if ((error as Error).name !== 'AbortError') setStatus('error');
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen, schemeCode, schemeName]);

  // Show the latest NAV for the selected scheme.
  useEffect(() => {
    setLatest(null);
    if (!/^\d{5,6}$/.test(schemeCode)) return;
    let cancelled = false;
    void fetchMutualFundNav(schemeCode).then((quote) => {
      const date = quote ? normalizeNavDate(quote.lastUpdated) : null;
      if (!cancelled && quote && date) setLatest({ nav: quote.currentPrice, date });
    });
    return () => {
      cancelled = true;
    };
  }, [schemeCode]);

  const handlePick = async (item: MutualFundSearchResult) => {
    const code = String(item.schemeCode);
    setQuery(item.schemeName);
    setIsOpen(false);
    setResults([]);
    const quote = await fetchMutualFundNav(code);
    const navDate = quote ? normalizeNavDate(quote.lastUpdated) ?? undefined : undefined;
    onSelect({ schemeCode: code, schemeName: item.schemeName, latestNav: quote?.currentPrice, navDate });
  };

  const clearSelection = () => {
    setQuery('');
    setResults([]);
    onSelect({ schemeCode: '', schemeName: '' });
    setIsOpen(true);
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1 flex items-center justify-between">
        <span>Mutual Fund Scheme</span>
        {schemeCode && <span className="text-[9px] text-cyan-400 font-mono">AMFI {schemeCode}</span>}
      </label>
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-[#777] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            onManualNameChange(e.target.value);
          }}
          placeholder="Search any fund, e.g. Parag Parikh Flexi Cap Direct"
          className="w-full pl-9 pr-9 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
        />
        {status === 'loading' ? (
          <Loader2 className="w-3.5 h-3.5 text-[#888] absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
        ) : query ? (
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear scheme"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#888] hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {latest && schemeCode && (
        <p className="mt-1 text-[10px] font-mono text-[#888]">
          Latest NAV <span className="text-cyan-400 font-bold">{currencySymbol}{latest.nav}</span> · {latest.date} · AMFI
        </p>
      )}

      {isOpen && query.trim().length >= 3 && !(schemeCode && query === schemeName) && (
        <div
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1.5 max-h-64 overflow-y-auto bg-surface-1 border border-line rounded-2xl shadow-2xl z-50 p-1.5 font-mono"
        >
          {status === 'loading' && results.length === 0 && (
            <div className="py-4 text-center text-[11px] text-[#888]">Searching AMFI schemes…</div>
          )}
          {status === 'error' && (
            <div className="py-4 text-center text-[11px] text-red-300">
              Couldn't reach AMFI. You can still type the scheme name manually.
            </div>
          )}
          {status === 'empty' && (
            <div className="py-4 text-center text-[11px] text-[#888]">No schemes match "{query.trim()}".</div>
          )}
          {results.map((item) => {
            const selected = String(item.schemeCode) === schemeCode;
            return (
              <button
                key={item.schemeCode}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => void handlePick(item)}
                className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  selected ? 'bg-red-950/40 text-white' : 'hover:bg-surface-3 text-[#ccc]'
                }`}
              >
                <span className="text-[11px] leading-snug flex-1">{item.schemeName}</span>
                <span className="text-[10px] text-cyan-400 shrink-0 font-bold">{item.schemeCode}</span>
                {selected && <Check className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
