import React, { useState, useMemo } from 'react';
import { UserSettings, InvestmentRecord, ConnectedDematAccount } from '../types/finance';
import { todayLocalISO } from '../utils/dates';
import {
  Building2,
  RefreshCw,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Eye,
  EyeOff,
  Layers,
  ArrowUpRight,
  X,
  Sparkles,
  Unlink,
  Check,
} from 'lucide-react';
import { InfoButton } from './InfoButton';
import { formatMoney } from '../utils/money';

interface ConnectedAccountsViewProps {
  settings: UserSettings;
  investments?: InvestmentRecord[];
  currencySymbol: string;
  onUpdateSettings: (newSettings: UserSettings) => void;
}

const DEFAULT_BROKERS: ConnectedDematAccount[] = [];

export const ConnectedAccountsView: React.FC<ConnectedAccountsViewProps> = ({
  settings,
  investments = [],
  currencySymbol,
  onUpdateSettings,
}) => {
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showValueMasked, setShowValueMasked] = useState<boolean>(false);

  // Modal state for linking/editing a broker
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [brokerToLink, setBrokerToLink] = useState<ConnectedDematAccount | null>(null);
  const [linkInitialValue, setLinkInitialValue] = useState<string>('0');

  // Load connected accounts from settings or fallback to default
  const connectedBrokers = useMemo(() => {
    return settings.connectedDematAccounts || [];
  }, [settings.connectedDematAccounts]);

  // Aggregated External Portfolio Calculation
  const aggregatedStats = useMemo(() => {
    let totalValue = 0;
    let totalInvested = 0;
    let connectedBrokersCount = 0;
    let totalHoldingsCount = 0;

    connectedBrokers.forEach((broker) => {
      if (!broker.isConnected) return;
      connectedBrokersCount++;

      // Check if user has real holdings in `investments` tagged with this broker
      const matchingHoldings = investments.filter(
        (inv) => (inv.dematAccount || '').toLowerCase() === broker.brokerCode.toLowerCase()
      );

      if (matchingHoldings.length > 0) {
        const cur = matchingHoldings.reduce((sum, h) => sum + h.currentValue, 0);
        const inv = matchingHoldings.reduce((sum, h) => sum + h.amountInvested, 0);
        totalValue += cur;
        totalInvested += inv;
        totalHoldingsCount += matchingHoldings.length;
      } else {
        const mockVal = broker.mockPortfolioValue || 0;
        const returns = broker.mockReturnsPercent || 0;
        const mockInv = returns > 0 ? mockVal / (1 + returns / 100) : mockVal;
        totalValue += mockVal;
        totalInvested += mockInv;
        totalHoldingsCount += broker.totalHoldingsCount || 0;
      }
    });

    const totalProfit = Math.round((totalValue - totalInvested) * 100) / 100;
    const returnPct = totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(2) : '0.00';

    return {
      totalValue: Math.round(totalValue * 100) / 100,
      totalInvested: Math.round(totalInvested * 100) / 100,
      totalProfit,
      returnPct,
      connectedBrokersCount,
      totalHoldingsCount,
    };
  }, [connectedBrokers, investments]);

  // Sync all connected portfolios
  const handleSyncAll = () => {
    setIsSyncingAll(true);
    const nowStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const updated = connectedBrokers.map((b) => {
      if (!b.isConnected) return b;
      const matching = investments.filter(
        (inv) => (inv.dematAccount || '').toLowerCase() === b.brokerCode.toLowerCase()
      );
      const totalCur = matching.reduce((sum, h) => sum + h.currentValue, 0);
      const totalInv = matching.reduce((sum, h) => sum + h.amountInvested, 0);
      const retPct = totalInv > 0 ? ((totalCur - totalInv) / totalInv) * 100 : 0;
      return {
        ...b,
        lastSyncedAt: `Today, ${nowStr}`,
        mockPortfolioValue: matching.length > 0 ? totalCur : b.mockPortfolioValue || 0,
        mockReturnsPercent: matching.length > 0 ? Math.round(retPct * 10) / 10 : b.mockReturnsPercent || 0,
        totalHoldingsCount: matching.length > 0 ? matching.length : b.totalHoldingsCount || 0,
      };
    });

    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });

    setIsSyncingAll(false);
    setSyncFeedback('All external Demat portfolios synced successfully!');
    setTimeout(() => setSyncFeedback(null), 3500);
  };

  // Sync a single broker
  const handleSyncSingleBroker = (brokerId: string) => {
    const nowStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const updated = connectedBrokers.map((b) => {
      if (b.id !== brokerId) return b;
      const matching = investments.filter(
        (inv) => (inv.dematAccount || '').toLowerCase() === b.brokerCode.toLowerCase()
      );
      const totalCur = matching.reduce((sum, h) => sum + h.currentValue, 0);
      const totalInv = matching.reduce((sum, h) => sum + h.amountInvested, 0);
      const retPct = totalInv > 0 ? ((totalCur - totalInv) / totalInv) * 100 : 0;
      return {
        ...b,
        lastSyncedAt: `Today, ${nowStr}`,
        mockPortfolioValue: matching.length > 0 ? totalCur : b.mockPortfolioValue || 0,
        mockReturnsPercent: matching.length > 0 ? Math.round(retPct * 10) / 10 : b.mockReturnsPercent || 0,
        totalHoldingsCount: matching.length > 0 ? matching.length : b.totalHoldingsCount || 0,
      };
    });

    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });

    setSyncFeedback(`Portfolio refreshed for ${brokerId.toUpperCase()}`);
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  // Disconnect a broker
  const handleDisconnectBroker = (brokerId: string) => {
    const updated = connectedBrokers.map((b) => {
      if (b.id !== brokerId) return b;
      return {
        ...b,
        isConnected: false,
      };
    });

    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });

    setSyncFeedback('Disconnected Demat account.');
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  // Open modal to link a broker
  const handleOpenLinkModal = (broker: ConnectedDematAccount) => {
    setBrokerToLink(broker);
    setLinkInitialValue(
      broker.mockPortfolioValue && broker.mockPortfolioValue > 0
        ? broker.mockPortfolioValue.toString()
        : '0'
    );
    setShowLinkModal(true);
  };

  // Confirm link broker
  const handleConfirmLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brokerToLink) return;

    const val = parseFloat(linkInitialValue) || 0;
    const nowStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const matching = investments.filter(
      (inv) => (inv.dematAccount || '').toLowerCase() === brokerToLink.brokerCode.toLowerCase()
    );
    const totalCur = matching.reduce((sum, h) => sum + h.currentValue, 0);
    const totalInv = matching.reduce((sum, h) => sum + h.amountInvested, 0);
    const retPct = totalInv > 0 ? ((totalCur - totalInv) / totalInv) * 100 : 0;

    const updated = connectedBrokers.map((b) => {
      if (b.id !== brokerToLink.id) return b;
      return {
        ...b,
        isConnected: true,
        connectedAt: todayLocalISO(),
        lastSyncedAt: `Today, ${nowStr}`,
        mockPortfolioValue: matching.length > 0 ? totalCur : val,
        mockReturnsPercent: matching.length > 0 ? Math.round(retPct * 10) / 10 : 0,
        totalHoldingsCount: matching.length,
      };
    });

    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });

    setShowLinkModal(false);
    setBrokerToLink(null);
    setSyncFeedback(`Successfully linked ${brokerToLink.brokerName} portfolio!`);
    setTimeout(() => setSyncFeedback(null), 3500);
  };

  return (
    <div className="space-y-6 font-mono text-white">
      {/* Toast / Sync Feedback Alert */}
      {syncFeedback && (
        <div className="p-3.5 bg-emerald-950/70 border border-emerald-700/60 rounded-2xl text-emerald-300 text-xs flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="text-emerald-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ==================== 1. AGGREGATED SUMMARY CARD ==================== */}
      <div className="bg-gradient-to-br from-[#1a162b] via-[#14141e] to-[#0f0f15] border border-purple-800/40 p-5 sm:p-6 rounded-3xl shadow-xl relative overflow-hidden">
        {/* Glow backdrop decoration */}
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-purple-900/30 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-950/80 border border-purple-700/60 flex items-center justify-center text-purple-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                  Manual Broker Portfolios (no live connection)
                </h3>
                <span className="text-[10px] px-2 py-0.5 bg-purple-950 text-purple-300 border border-purple-700/50 rounded-full font-bold">
                  {aggregatedStats.connectedBrokersCount} Linked
                </span>
              </div>
              <p className="text-[10px] text-[#888]">
                Manual portfolio aggregation from tracked investment holdings
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isSyncingAll}
              onClick={handleSyncAll}
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
              title="Sync all connected Demat accounts"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span>{isSyncingAll ? 'Syncing...' : 'Sync All'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowValueMasked(!showValueMasked)}
              className="p-1.5 bg-[#1f1f2e] hover:bg-[#28283c] border border-[#37374e] rounded-xl text-[#aaa] hover:text-white cursor-pointer"
              title={showValueMasked ? 'Reveal value' : 'Hide value'}
            >
              {showValueMasked ? <EyeOff className="w-4 h-4 text-red-400" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Aggregated Financial Figures */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 relative z-10">
          {/* Total Value */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#888] mb-1">
              Total External Valuation
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {showValueMasked
                ? '••••••••'
                : formatMoney(aggregatedStats.totalValue, { symbol: currencySymbol, locale: settings?.locale })}
            </div>
          </div>

          {/* Capital Invested */}
          <div className="sm:border-l sm:border-[#222232] sm:pl-4">
            <div className="text-[10px] uppercase tracking-wider text-[#888] mb-1">
              Total Invested Principal
            </div>
            <div className="text-lg sm:text-xl font-bold text-[#bbb]">
              {showValueMasked
                ? '••••••••'
                : formatMoney(aggregatedStats.totalInvested, { symbol: currencySymbol, locale: settings?.locale })}
            </div>
            <div className="text-[10px] text-[#777] mt-1">
              {aggregatedStats.totalHoldingsCount} Holdings Across Connected Demats
            </div>
          </div>

          {/* Unrealized Gain */}
          <div className="sm:border-l sm:border-[#222232] sm:pl-4">
            <div className="text-[10px] uppercase tracking-wider text-[#888] mb-1">
              Total Unrealized P&L
            </div>
            <div className="text-lg sm:text-xl font-bold text-emerald-400">
              {showValueMasked
                ? '••••••••'
                : `+${formatMoney(aggregatedStats.totalProfit, { symbol: currencySymbol, locale: settings?.locale })}`}
            </div>
            <div className="text-[10px] text-emerald-400 font-bold mt-1">
              +{aggregatedStats.returnPct}% Overall Net Return
            </div>
          </div>
        </div>
      </div>

      {/* ==================== 2. BROKER ACCOUNTS GRID ==================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-[#888]">
          <span className="font-bold uppercase tracking-wider text-white">
            Available Broker Integrations
          </span>
          <span className="text-[10px] text-[#777]">
            Mock or API Token Connection Supported
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {connectedBrokers.map((broker) => {
            // Find holdings from investments tagged with this broker
            const brokerHoldings = investments.filter(
              (inv) => (inv.dematAccount || '').toLowerCase() === broker.brokerCode.toLowerCase()
            );

            const displayValue =
              brokerHoldings.length > 0
                ? brokerHoldings.reduce((sum, h) => sum + h.currentValue, 0)
                : broker.mockPortfolioValue || 0;

            const displayCount =
              brokerHoldings.length > 0
                ? brokerHoldings.length
                : broker.totalHoldingsCount || 0;

            return (
              <div
                key={broker.id}
                className={`p-4 bg-[#13131c] border rounded-2xl space-y-3 transition-all relative ${
                  broker.isConnected
                    ? 'border-[#2d2d42] hover:border-purple-600/60'
                    : 'border-[#20202c] opacity-80 hover:opacity-100'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: broker.color || '#387ed1' }}
                    />
                    <div>
                      <h4 className="text-xs font-bold text-white">{broker.brokerName}</h4>
                      <p className="text-[10px] text-[#777]">
                        {broker.isConnected
                          ? `UCC: ${broker.clientId}`
                          : 'Not linked to portfolio'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                      broker.isConnected
                        ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800/60'
                        : 'bg-slate-800 text-[#888] border-slate-700'
                    }`}
                  >
                    {broker.isConnected ? '● Connected' : 'Unlinked'}
                  </span>
                </div>

                {/* Body Metrics if Connected */}
                {broker.isConnected ? (
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-[#171724] border border-[#252538] rounded-xl text-xs">
                    <div>
                      <span className="text-[9px] text-[#777] block uppercase">
                        Portfolio Value
                      </span>
                      <span className="font-bold text-white">
                        {formatMoney(displayValue, { symbol: currencySymbol, locale: settings?.locale })}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-[#777] block uppercase">
                        Tracked Holdings
                      </span>
                      <span className="font-bold text-purple-400">
                        {displayCount} {displayCount === 1 ? 'Asset' : 'Assets'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#777] py-1">
                    Connect your {broker.brokerName} account to automatically aggregate holdings and track live P&L.
                  </p>
                )}

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-[#1e1e2c] text-xs">
                  <span className="text-[9px] text-[#666]">
                    {broker.isConnected
                      ? `Last synced: ${broker.lastSyncedAt || 'Today'}`
                      : 'Mock API ready'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {broker.isConnected ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSyncSingleBroker(broker.id)}
                          className="px-2.5 py-1 bg-[#1a1a28] hover:bg-[#25253a] border border-[#333] hover:border-purple-500 rounded-lg text-[10px] text-[#bbb] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Sync</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnectBroker(broker.id)}
                          className="px-2.5 py-1 bg-[#1a1a28] hover:bg-red-950/60 border border-red-900/50 hover:border-red-500 rounded-lg text-[10px] text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Unlink className="w-3 h-3" />
                          <span>Disconnect</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenLinkModal(broker)}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <PlusCircle className="w-3 h-3" />
                        <span>Link Account</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================== 3. MOCK LINKING MODAL ==================== */}
      {showLinkModal && brokerToLink && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 select-none">
          <div className="bg-[#14141e] border border-[#2e2e42] rounded-3xl max-w-md w-full shadow-2xl p-5 sm:p-6 space-y-4 text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#222]">
              <div className="flex items-center gap-2">
                <div
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: brokerToLink.color || '#387ed1' }}
                />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Link {brokerToLink.brokerName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="text-[#666] hover:text-white p-1 rounded-lg bg-[#181824]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmLink} className="space-y-3.5">
              <div>
                <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                  Manual Initial Portfolio Value ({currencySymbol})
                </label>
                <input
                  type="number"
                  step="any"
                  value={linkInitialValue}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => setLinkInitialValue(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-[#1b1b28] border border-[#37374e] rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="p-3 bg-purple-950/40 border border-purple-800/40 rounded-xl text-[10px] text-[#bbb] space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Manual Portfolio Architecture
                </div>
                <p>
                  This links the account and automatically syncs holdings matching this broker code from your tracked investments.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-lg"
                >
                  Link & Sync Portfolio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
