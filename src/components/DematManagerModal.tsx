import React, { useState } from 'react';
import { InvestmentRecord, InvestmentType } from '../types/finance';
import {
  X,
  Building2,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  ShieldCheck,
  ExternalLink,
  PlusCircle,
  ChevronRight,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { findStockBySymbol } from '../services/stocksDatabase';
import { roundCurrency } from '../services/financialCalculations';

interface DematManagerModalProps {
  investments: InvestmentRecord[];
  currencySymbol: string;
  onClose: () => void;
  onImportHoldings: (newHoldings: InvestmentRecord[]) => void;
}

export const POPULAR_BROKERS = [
  { id: 'Zerodha', name: 'Zerodha (Kite / Console)', color: '#387ed1', tag: 'Kite / Console' },
  { id: 'Dhan', name: 'Dhan (DhanHQ / App)', color: '#6842ff', tag: 'Dhan HQ' },
  { id: 'Groww', name: 'Groww', color: '#00d09c', tag: 'Groww Direct' },
  { id: 'Upstox', name: 'Upstox (Pro)', color: '#8833ff', tag: 'Upstox Pro' },
  { id: 'Angel One', name: 'Angel One (SmartAPI)', color: '#f26522', tag: 'SmartAPI' },
  { id: 'ICICI Direct', name: 'ICICI Direct (Breeze)', color: '#d97706', tag: 'Breeze' },
  { id: 'HDFC Sky', name: 'HDFC Sky', color: '#0284c7', tag: 'HDFC Sky' },
  { id: 'Kotak Neo', name: 'Kotak Neo', color: '#dc2626', tag: 'Kotak Neo' },
  { id: 'Other', name: 'Other Demat / Broker', color: '#64748b', tag: 'Custom' },
];

export const DematManagerModal: React.FC<DematManagerModalProps> = ({
  investments,
  currencySymbol,
  onClose,
  onImportHoldings,
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'IMPORT' | 'GUIDE'>('OVERVIEW');
  const [selectedBroker, setSelectedBroker] = useState<string>('Zerodha');
  const [csvText, setCsvText] = useState<string>('');
  const [parsedPreview, setParsedPreview] = useState<InvestmentRecord[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  // Group user's investments by Demat account
  const brokerBreakdown = React.useMemo(() => {
    const stats: Record<string, { count: number; invested: number; current: number }> = {};
    
    // Initialize all popular brokers with zero
    POPULAR_BROKERS.forEach((b) => {
      stats[b.id] = { count: 0, invested: 0, current: 0 };
    });

    investments.forEach((inv) => {
      const broker = inv.dematAccount || 'Unassigned';
      if (!stats[broker]) {
        stats[broker] = { count: 0, invested: 0, current: 0 };
      }
      stats[broker].count += 1;
      stats[broker].invested += inv.amountInvested;
      stats[broker].current += inv.currentValue;
    });

    return stats;
  }, [investments]);

  // Handle sample CSV template load
  const handleLoadSampleCsv = (type: 'zerodha' | 'dhan') => {
    if (type === 'zerodha') {
      setSelectedBroker('Zerodha');
      setCsvText(
        `Instrument,Qty,Avg cost,LTP,Cur val,P&L\n` +
        `NATIONALUM,100,285.50,318.40,31840,3290\n` +
        `RELIANCE,10,2890.00,2985.40,29854,954\n` +
        `TCS,5,3950.00,4210.15,21050.75,1300.75\n` +
        `HDFCBANK,25,1620.00,1680.50,42012.50,1512.50`
      );
    } else {
      setSelectedBroker('Dhan');
      setCsvText(
        `Symbol,Quantity,BuyPrice,LTP\n` +
        `NATIONALUM,150,290.00,318.40\n` +
        `INFY,20,1820.00,1895.80\n` +
        `TATAMOTORS,30,950.00,995.60\n` +
        `ITC,100,480.00,502.80`
      );
    }
    setParseError(null);
  };

  // Parse CSV rows into InvestmentRecord items
  const handleParseCsv = () => {
    setParseError(null);
    setParsedPreview([]);
    setImportSuccessMessage(null);

    const lines = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      setParseError('Please paste at least a CSV header and one data row.');
      return;
    }

    const header = lines[0].toLowerCase();
    const isZerodhaFormat = header.includes('instrument') && header.includes('qty');
    const isDhanFormat = header.includes('symbol') && (header.includes('quantity') || header.includes('qty'));

    const items: InvestmentRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (row.length < 3) continue;

      let symbol = row[0].toUpperCase();
      let shares = parseFloat(row[1]) || 0;
      let buyPrice = parseFloat(row[2]) || 0;
      let ltp = parseFloat(row[3]) || buyPrice;

      if (isZerodhaFormat || isDhanFormat) {
        // Find in stock database for clean company name
        const match = findStockBySymbol(symbol);
        const name = match ? match.name : symbol;
        const finalLtp = ltp > 0 ? ltp : (match?.basePrice || buyPrice);
        const invested = roundCurrency(shares * buyPrice);
        const currentVal = roundCurrency(shares * finalLtp);
        const returnsPct = invested > 0 ? roundCurrency(((currentVal - invested) / invested) * 100) : 0;

        items.push({
          id: `inv_import_${Date.now()}_${i}`,
          name: name,
          type: 'Stocks',
          symbol: match?.symbol || symbol,
          exchange: match?.exchange === 'BSE' ? 'BSE' : (match?.exchange === 'NASDAQ' || match?.exchange === 'NYSE' ? 'US' : 'NSE'),
          shares: shares,
          purchasePrice: buyPrice,
          currentPrice: finalLtp,
          amountInvested: invested,
          currentValue: currentVal,
          returnsPercent: returnsPct,
          date: new Date().toISOString().slice(0, 10),
          dematAccount: selectedBroker,
          status: 'active',
          priceSource: 'Imported CSV',
          monthlyContributions: [{ month: new Date().toISOString().slice(0, 7), amount: invested }],
          notes: `Imported from ${selectedBroker} holdings file`,
        });
      }
    }

    if (items.length === 0) {
      setParseError('Could not recognize holdings in the CSV. Please use the sample template.');
      return;
    }

    setParsedPreview(items);
  };

  const handleConfirmImport = () => {
    if (parsedPreview.length === 0) return;
    onImportHoldings(parsedPreview);
    setImportSuccessMessage(
      `Successfully imported ${parsedPreview.length} holdings into ${selectedBroker} Demat account!`
    );
    setParsedPreview([]);
    setCsvText('');
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 font-mono select-none">
      <div className="bg-[#121218] border border-[#2c2c3c] rounded-3xl max-w-2xl w-full shadow-2xl relative max-h-[92vh] flex flex-col text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#222] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-950/70 border border-purple-700/60 flex items-center justify-center text-purple-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Demat Accounts & Broker Integrations
              </h3>
              <p className="text-[10px] text-[#888]">
                Track Dhan, Zerodha, Groww & Multiple Portfolios in One Place
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#666] hover:text-white p-1 rounded-lg bg-[#181822] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#222] bg-[#0c0c12] px-5 shrink-0">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
              activeTab === 'OVERVIEW'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-[#777] hover:text-[#ccc]'
            }`}
          >
            Accounts Overview
          </button>
          <button
            onClick={() => setActiveTab('IMPORT')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
              activeTab === 'IMPORT'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-[#777] hover:text-[#ccc]'
            }`}
          >
            CSV Holdings Import
          </button>
          <button
            onClick={() => setActiveTab('GUIDE')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
              activeTab === 'GUIDE'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-[#777] hover:text-[#ccc]'
            }`}
          >
            Dhan / Zerodha API Guide
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-gradient-to-r from-purple-950/40 via-blue-950/20 to-transparent border border-purple-800/40 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    Unified Multi-Broker Portfolio
                  </div>
                  <p className="text-[10px] text-[#aaa] mt-0.5">
                    Every stock or mutual fund can be tagged with its broker (Zerodha, Dhan, Groww). Use the Demat filter to isolate or combine your portfolios.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('IMPORT')}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold rounded-xl shrink-0 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import CSV
                </button>
              </div>

              {/* Broker Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {POPULAR_BROKERS.map((broker) => {
                  const data = brokerBreakdown[broker.id] || { count: 0, invested: 0, current: 0 };
                  const pnl = roundCurrency(data.current - data.invested);
                  const pnlPct = data.invested > 0 ? ((pnl / data.invested) * 100).toFixed(1) : '0.0';

                  return (
                    <div
                      key={broker.id}
                      className="p-3.5 bg-[#171722] border border-[#272738] rounded-2xl flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: broker.color }}
                          />
                          <span className="text-xs font-bold text-white">{broker.name}</span>
                        </div>
                        <span className="text-[9px] px-2 py-0.5 bg-[#222232] text-[#aaa] rounded-md font-mono">
                          {data.count} {data.count === 1 ? 'Holding' : 'Holdings'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-[#222230] text-[11px]">
                        <div>
                          <div className="text-[9px] text-[#777] uppercase">Current Value</div>
                          <div className="font-bold text-white text-xs">
                            {currencySymbol}{data.current.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-[#777] uppercase">P&L (% Return)</div>
                          <div
                            className={`font-bold text-xs ${
                              pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {pnl >= 0 ? '+' : ''}{currencySymbol}{pnl.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ({pnlPct}%)
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT CSV */}
          {activeTab === 'IMPORT' && (
            <div className="space-y-4">
              {importSuccessMessage && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-700/60 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{importSuccessMessage}</span>
                </div>
              )}

              {parseError && (
                <div className="p-3 bg-red-950/60 border border-red-700/60 rounded-xl text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Step 1: Select Demat Target */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                    Select Target Demat Account
                  </label>
                  <select
                    value={selectedBroker}
                    onChange={(e) => setSelectedBroker(e.target.value)}
                    className="w-full px-3 py-2 bg-[#181822] border border-[#333] rounded-xl text-xs text-white"
                  >
                    {POPULAR_BROKERS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadSampleCsv('zerodha')}
                    className="flex-1 py-2 px-2.5 bg-[#1f1f2e] hover:bg-[#28283a] border border-[#333] rounded-xl text-[10px] text-[#ccc] hover:text-white transition-colors cursor-pointer"
                  >
                    Sample Zerodha CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleCsv('dhan')}
                    className="flex-1 py-2 px-2.5 bg-[#1f1f2e] hover:bg-[#28283a] border border-[#333] rounded-xl text-[10px] text-[#ccc] hover:text-white transition-colors cursor-pointer"
                  >
                    Sample Dhan CSV
                  </button>
                </div>
              </div>

              {/* Step 2: Paste CSV */}
              <div>
                <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Paste CSV Contents or File Text</span>
                  <span className="text-[9px] text-[#777]">Comma-separated values</span>
                </label>
                <textarea
                  rows={5}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={`Instrument,Qty,Avg cost,LTP\nNATIONALUM,100,285.50,318.40\nRELIANCE,10,2890.00,2985.40`}
                  className="w-full px-3 py-2 bg-[#181822] border border-[#333] rounded-xl text-xs text-white placeholder-[#555] font-mono focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <button
                type="button"
                onClick={handleParseCsv}
                disabled={!csvText.trim()}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Parse & Preview Holdings
              </button>

              {/* Preview table */}
              {parsedPreview.length > 0 && (
                <div className="p-3 bg-[#15151e] border border-purple-800/40 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">
                      Preview: {parsedPreview.length} Holdings Ready to Import
                    </span>
                    <span className="text-[10px] text-purple-400">Target: {selectedBroker}</span>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {parsedPreview.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-[#1c1c28] rounded-xl flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-white">{item.symbol}</div>
                          <div className="text-[10px] text-[#888]">{item.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-cyan-400">
                            {item.shares} shares @ {currencySymbol}{item.purchasePrice}
                          </div>
                          <div className="text-[10px] text-emerald-400">
                            LTP: {currencySymbol}{item.currentPrice}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm & Add to Portfolio
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GUIDE */}
          {activeTab === 'GUIDE' && (
            <div className="space-y-4 text-xs leading-relaxed text-[#ccc]">
              <div className="p-3.5 bg-[#171722] border border-[#272738] rounded-2xl space-y-2">
                <div className="font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  How to Track Other Demat Accounts (Dhan, Zerodha, Groww)
                </div>
                <p className="text-[11px] text-[#aaa]">
                  In India, investors hold Demat accounts across multiple brokers. Here are the 3 industry-standard ways to track them seamlessly in this app:
                </p>
              </div>

              {/* Method 1 */}
              <div className="p-3.5 bg-[#171722] border border-[#272738] rounded-2xl space-y-2">
                <div className="font-bold text-emerald-400 text-xs">
                  Method 1: Direct CSV / Holdings Export (Zero-cost & Instant)
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-[#bbb]">
                  <li>
                    <strong className="text-white">Zerodha</strong>: Go to <span className="text-cyan-400">Console &gt; Portfolio &gt; Holdings &gt; Download CSV</span>.
                  </li>
                  <li>
                    <strong className="text-white">Dhan</strong>: Go to <span className="text-cyan-400">Portfolio &gt; All Holdings &gt; Export to Excel/CSV</span>.
                  </li>
                  <li>
                    <strong className="text-white">Groww / Upstox</strong>: Go to <span className="text-cyan-400">Reports &gt; Holdings Statement &gt; CSV</span>.
                  </li>
                  <li>
                    Open the CSV file, copy and paste the rows in our <strong>CSV Holdings Import</strong> tab above to import your entire portfolio in 5 seconds!
                  </li>
                </ul>
              </div>

              {/* Method 2 */}
              <div className="p-3.5 bg-[#171722] border border-[#272738] rounded-2xl space-y-2">
                <div className="font-bold text-cyan-400 text-xs">
                  Method 2: Consolidated Account Statement (e-CAS) from CDSL / NSDL
                </div>
                <p className="text-[11px] text-[#bbb]">
                  The Central Depository Services (CDSL) and National Securities Depository (NSDL) issue a monthly <strong>e-CAS</strong> PDF. It consolidates every stock, mutual fund, and bond across all your Demat accounts (Zerodha, Dhan, Groww, Bank brokers) under your PAN in one single document.
                </p>
              </div>

              {/* Method 3 */}
              <div className="p-3.5 bg-[#171722] border border-[#272738] rounded-2xl space-y-2">
                <div className="font-bold text-purple-400 text-xs">
                  Method 3: Direct Broker Open API Connection
                </div>
                <div className="space-y-1.5 text-[11px] text-[#bbb]">
                  <p>
                    <strong className="text-white">Dhan (DhanHQ Open API)</strong>: Dhan provides a <strong>100% free open API</strong>. Users can generate an API Access Token in Dhan Web (&gt; My Profile &gt; DhanHQ APIs) to fetch live holdings automatically without fees.
                  </p>
                  <p>
                    <strong className="text-white">Zerodha Kite Connect</strong>: Zerodha offers the Kite Connect API with dedicated endpoints for retrieving user holdings and margins.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
