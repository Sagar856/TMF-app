import React, { useState, useMemo } from 'react';
import { UserSettings, InvestmentRecord, ConnectedDematAccount } from '../../types/finance';
import {
  Building2,
  RefreshCw,
  PlusCircle,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Check,
  X,
  Shield,
  Link2,
} from 'lucide-react';
import { InfoButton } from '../InfoButton';
import { newId } from '../../utils/ids';
import { formatMoney } from '../../utils/money';

interface BrokerPortfoliosSectionProps {
  settings: UserSettings;
  investments?: InvestmentRecord[];
  onUpdateSettings: (newSettings: UserSettings) => void;
}

/**
 * Manually tracked brokerage portfolio snapshots (no live broker connection).
 * Extracted from SettingsView so the Settings page stays focused on preferences.
 */
export const BrokerPortfoliosSection: React.FC<BrokerPortfoliosSectionProps> = ({
  settings,
  investments = [],
  onUpdateSettings,
}) => {
  const currencySymbol = settings.currencySymbol;
  const [syncingBrokerId, setSyncingBrokerId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [editingDemat, setEditingDemat] = useState<ConnectedDematAccount | null>(null);
  const [modalBrokerCode, setModalBrokerCode] = useState<string>('Zerodha');
  const [modalBrokerName, setModalBrokerName] = useState<string>('Zerodha Kite');
  const [modalPortfolioValue, setModalPortfolioValue] = useState<string>('0');
  const [modalPortfolioReturns, setModalPortfolioReturns] = useState<string>('0');
  const [modalHoldingCount, setModalHoldingCount] = useState<string>('0');
  const [modalValidationError, setModalValidationError] = useState<string>('');
  // Connected Demat Accounts list
  const dematAccounts: ConnectedDematAccount[] = useMemo(() => {
    return settings.connectedDematAccounts || [];
  }, [settings.connectedDematAccounts]);

  // Compute portfolio stats for a broker (combining live investments logged under this demat or fallback to mock)
  const getBrokerStats = (account: ConnectedDematAccount) => {
    const matching = (investments || []).filter(
      (inv) =>
        (inv.dematAccount && inv.dematAccount.toLowerCase() === account.brokerCode.toLowerCase()) ||
        (inv.dematAccount && inv.dematAccount.toLowerCase() === account.brokerName.toLowerCase()) ||
        (account.clientId && inv.brokerClientId === account.clientId)
    );

    if (matching.length > 0) {
      const val = matching.reduce((sum, inv) => sum + (inv.currentValue || 0), 0);
      const invAmt = matching.reduce((sum, inv) => sum + (inv.amountInvested || 0), 0);
      const ret = invAmt > 0 ? ((val - invAmt) / invAmt) * 100 : 0;
      return {
        value: val,
        invested: invAmt,
        returnsPercent: Math.round(ret * 10) / 10,
        holdingsCount: matching.length,
        isRealData: true,
      };
    }

    const val = account.mockPortfolioValue || 0;
    const ret = account.mockReturnsPercent || 0;
    const invAmt = ret !== -100 ? Math.round(val / (1 + ret / 100)) : val;
    return {
      value: val,
      invested: invAmt,
      returnsPercent: ret,
      holdingsCount: account.totalHoldingsCount || 0,
      isRealData: false,
    };
  };

  // Aggregated summary stats across all connected demat accounts
  const aggregatedStats = useMemo(() => {
    const active = dematAccounts.filter((a) => a.isConnected);
    let totalVal = 0;
    let totalInv = 0;
    let totalHoldings = 0;

    active.forEach((acc) => {
      const stats = getBrokerStats(acc);
      totalVal += stats.value;
      totalInv += stats.invested;
      totalHoldings += stats.holdingsCount;
    });

    const totalGainLoss = totalVal - totalInv;
    const totalGainLossPercent = totalInv > 0 ? (totalGainLoss / totalInv) * 100 : 0;

    return {
      totalVal,
      totalInv,
      totalGainLoss,
      totalGainLossPercent,
      totalHoldings,
      activeCount: active.length,
      activeBrokers: active,
    };
  }, [dematAccounts, investments]);

  // Actions for Demat Accounts
  const handleToggleConnect = (account: ConnectedDematAccount) => {
    const now = new Date().toISOString();
    const updated = dematAccounts.map((acc) => {
      if (acc.id === account.id) {
        const nextConnected = !acc.isConnected;
        return {
          ...acc,
          isConnected: nextConnected,
          connectedAt: nextConnected ? now : acc.connectedAt,
          mockPortfolioValue: acc.mockPortfolioValue || 0,
          mockReturnsPercent: acc.mockReturnsPercent || 0,
          totalHoldingsCount: acc.totalHoldingsCount || 0,
        };
      }
      return acc;
    });

    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });

    const isNowConnected = !account.isConnected;
    setFeedbackMessage(
      isNowConnected
        ? `Resumed manual tracking for ${account.brokerName}.`
        : `Paused manual tracking for ${account.brokerName}.`
    );
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleSyncBroker = (accountId: string) => {
    setSyncingBrokerId(accountId);
    const updated = dematAccounts.map((acc) => {
      if (acc.id === accountId) {
        return {
          ...acc,
          lastSyncedAt: new Date().toISOString(),
        };
      }
      return acc;
    });
    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });
    setSyncingBrokerId(null);
    setFeedbackMessage('Manual portfolio totals recalculated. No external data was fetched.');
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleSyncAll = () => {
    setIsSyncingAll(true);
    const now = new Date().toISOString();
    const updated = dematAccounts.map((acc) => {
      if (acc.isConnected) {
        return { ...acc, lastSyncedAt: now };
      }
      return acc;
    });
    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });
    setIsSyncingAll(false);
    setFeedbackMessage('Manual portfolio totals recalculated. No external data was fetched.');
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleOpenLinkModal = (existing?: ConnectedDematAccount) => {
    setModalValidationError('');
    if (existing) {
      setEditingDemat(existing);
      setModalBrokerCode(existing.brokerCode);
      setModalBrokerName(existing.brokerName);
      setModalPortfolioValue((existing.mockPortfolioValue || 0).toString());
      setModalPortfolioReturns((existing.mockReturnsPercent || 0).toString());
      setModalHoldingCount((existing.totalHoldingsCount || 0).toString());
    } else {
      setEditingDemat(null);
      setModalBrokerCode('Zerodha');
      setModalBrokerName('Zerodha Kite');
      setModalPortfolioValue('0');
      setModalPortfolioReturns('0');
      setModalHoldingCount('0');
    }
    setShowLinkModal(true);
  };

  const handleSaveLinkedAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(modalPortfolioValue);
    const ret = Number(modalPortfolioReturns);
    const holdings = Number(modalHoldingCount);
    if (!Number.isFinite(val) || val < 0) {
      setModalValidationError('Portfolio valuation must be a non-negative number.');
      return;
    }
    if (!Number.isFinite(ret) || ret < -100) {
      setModalValidationError('Estimated return must be at least -100%.');
      return;
    }
    if (!Number.isInteger(holdings) || holdings < 0) {
      setModalValidationError('Holdings count must be a whole number of zero or more.');
      return;
    }
    const now = new Date().toISOString();

    const brokerColors: Record<string, string> = {
      Zerodha: '#387ed1',
      Dhan: '#6842ff',
      Groww: '#00d09c',
      Upstox: '#8833ff',
      'Angel One': '#0066ff',
      'ICICI Direct': '#e65100',
    };

    let updated: ConnectedDematAccount[];
    if (editingDemat) {
      updated = dematAccounts.map((acc) => {
        if (acc.id === editingDemat.id) {
          return {
            ...acc,
            brokerName: modalBrokerName,
            brokerCode: modalBrokerCode,
            mockPortfolioValue: val,
            mockReturnsPercent: ret,
            totalHoldingsCount: holdings,
            color: brokerColors[modalBrokerCode] || acc.color || '#387ed1',
          };
        }
        return acc;
      });
      setFeedbackMessage(`Updated portfolio details for ${modalBrokerName}.`);
    } else {
      const newAcc: ConnectedDematAccount = {
        id: newId('broker'),
        brokerName: modalBrokerName,
        brokerCode: modalBrokerCode,
        clientId: '',
        isConnected: true,
        connectedAt: now,
        mockPortfolioValue: val,
        mockReturnsPercent: ret,
        totalHoldingsCount: holdings,
        color: brokerColors[modalBrokerCode] || '#387ed1',
      };
      updated = [...dematAccounts, newAcc];
      setFeedbackMessage(`Added ${modalBrokerName} portfolio.`);
    }

    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });

    setShowLinkModal(false);
    setEditingDemat(null);
    setTimeout(() => setFeedbackMessage(null), 3000);
  };


  return (
    <>
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-2xl shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#222]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <span>Manual Broker Portfolios</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                      {aggregatedStats.activeCount} TRACKED
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-[#888]">
                    Record portfolio valuations and estimated returns here. Live broker connections are coming soon.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <InfoButton
                  id="connected-demat-info"
                  title="Manual Broker Portfolios"
                  content="Manually record each brokerage portfolio's total valuation, estimated return, and holding count. Live broker connections are coming soon."
                  align="right"
                />
                <button
                  type="button"
                  onClick={() => handleOpenLinkModal()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Portfolio</span>
                </button>
              </div>
            </div>

            {/* Notification Feedback */}
            {feedbackMessage && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 rounded-xl flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 font-mono">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{feedbackMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackMessage(null)}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* SUMMARY CARD: Aggregated External Portfolio Value */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-black p-5 sm:p-6 text-white shadow-lg space-y-4">
              <div className="absolute -right-8 -top-8 w-44 h-44 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -left-8 -bottom-8 w-44 h-44 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                    Aggregated Manual Portfolio Summary
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400">
                    {aggregatedStats.activeCount > 0
                      ? `${aggregatedStats.activeCount} Portfolio${aggregatedStats.activeCount > 1 ? 's' : ''} Tracked`
                      : 'No Portfolios Tracked'}
                  </span>
                  <button
                    type="button"
                    disabled={isSyncingAll || aggregatedStats.activeCount === 0}
                    onClick={handleSyncAll}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 text-emerald-400 ${isSyncingAll ? 'animate-spin' : ''}`} />
                    <span>{isSyncingAll ? 'Updating...' : 'Recalculate Totals'}</span>
                  </button>
                </div>
              </div>

              {/* Primary Portfolio Value Display */}
              <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div className="sm:col-span-2 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                    Total Portfolio Valuation
                  </div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-white">
                      {formatMoney(aggregatedStats.totalVal, { symbol: currencySymbol, locale: settings?.locale })}
                    </div>
                    <div className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1 ${
                      aggregatedStats.totalGainLoss >= 0
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      <TrendingUp className="w-3 h-3" />
                      <span>
                        {aggregatedStats.totalGainLoss >= 0 ? '+' : ''}
                        {formatMoney(Math.abs(aggregatedStats.totalGainLoss), { symbol: currencySymbol, locale: settings?.locale })}
                        {' '}
                        ({aggregatedStats.totalGainLossPercent >= 0 ? '+' : ''}{aggregatedStats.totalGainLossPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t sm:border-t-0 sm:border-l border-white/10 sm:pl-4 pt-2 sm:pt-0">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-mono text-[10px] uppercase">Cost Basis:</span>
                    <span className="font-mono font-bold text-white">
                      {formatMoney(aggregatedStats.totalInv, { symbol: currencySymbol, locale: settings?.locale })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-mono text-[10px] uppercase">Holdings:</span>
                    <span className="font-mono font-bold text-white">
                      {aggregatedStats.totalHoldings} Assets
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-mono text-[10px] uppercase">Portfolios:</span>
                    <span className="font-mono font-bold text-emerald-400 truncate max-w-[120px]">
                      {aggregatedStats.activeBrokers.map(b => b.brokerCode).join(', ') || 'None'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Manual Portfolio Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-[#888]">
                <span className="uppercase text-[10px] font-bold tracking-wider">
                  Manual Portfolios ({dematAccounts.length})
                </span>
                <span className="text-[10px]">Live broker sync coming soon</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {dematAccounts.map((account) => {
                  const stats = getBrokerStats(account);
                  const isSyncing = syncingBrokerId === account.id;

                  return (
                    <div
                      key={account.id}
                      className={`p-4 rounded-xl border transition-all ${
                        account.isConnected
                          ? 'bg-slate-50 dark:bg-[#0e0e14] border-slate-200 dark:border-[#2a2a35] hover:border-emerald-500/40'
                          : 'bg-slate-100/50 dark:bg-[#121217]/50 border-dashed border-slate-300 dark:border-[#222] opacity-75 hover:opacity-100'
                      }`}
                    >
                      {/* Broker Header */}
                      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-200/80 dark:border-[#1a1a24]">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm"
                            style={{ backgroundColor: account.color || '#3b82f6' }}
                          >
                            {account.brokerCode.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                                {account.brokerName}
                              </span>
                              {account.isConnected && (
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 dark:text-[#888]">
                              Status: <span className="font-bold text-slate-700 dark:text-slate-300">{account.isConnected ? 'Active' : 'Paused'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase border ${
                            account.isConnected
                              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-200 dark:bg-[#1f1f26] text-slate-600 dark:text-[#777] border-slate-300 dark:border-[#333]'
                          }`}
                        >
                          {account.isConnected ? 'TRACKING' : 'PAUSED'}
                        </span>
                      </div>

                      {/* Broker Value / Metrics */}
                      <div className="py-3 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono">
                            {stats.isRealData ? 'TRACKED INVESTMENT TOTAL' : 'MANUAL VALUATION'}
                          </div>
                          <div className="text-base font-bold font-mono text-slate-900 dark:text-white">
                            {formatMoney(stats.value, { symbol: currencySymbol, locale: settings?.locale })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xs font-mono font-bold ${
                            stats.returnsPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                          }`}>
                            {stats.returnsPercent >= 0 ? '+' : ''}{stats.returnsPercent}%
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono">
                            {stats.holdingsCount} Holdings {stats.isRealData ? '(Investment records)' : '(Entered manually)'}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2 border-t border-slate-200/80 dark:border-[#1a1a24] flex items-center justify-between gap-2">
                        <div className="text-[9px] font-mono text-slate-400 truncate max-w-[120px]">
                          {account.lastSyncedAt ? `Updated ${new Date(account.lastSyncedAt).toLocaleDateString()}` : 'Manual valuation'}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {account.isConnected ? (
                            <>
                              <button
                                type="button"
                                disabled={isSyncing}
                                onClick={() => handleSyncBroker(account.id)}
                                className="px-2.5 py-1 bg-white dark:bg-[#1a1a24] hover:bg-slate-100 dark:hover:bg-[#252535] border border-slate-200 dark:border-[#333] text-slate-700 dark:text-[#ccc] hover:text-slate-900 dark:hover:text-white rounded-lg text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer"
                                title="Recalculate from saved manual values; no market or broker data is fetched"
                              >
                                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-emerald-500' : ''}`} />
                                <span>{isSyncing ? 'Updating...' : 'Recalculate'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenLinkModal(account)}
                                className="px-2 py-1 bg-white dark:bg-[#1a1a24] hover:bg-slate-100 dark:hover:bg-[#252535] border border-slate-200 dark:border-[#333] text-slate-700 dark:text-[#ccc] hover:text-slate-900 dark:hover:text-white rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer"
                                title="Edit the manually tracked portfolio snapshot"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleConnect(account)}
                                className="px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg text-[10px] font-mono font-bold transition-colors cursor-pointer"
                                title="Pause manual tracking"
                              >
                                Unlink
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleConnect(account)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                            >
                              <Link2 className="w-3 h-3" />
                              <span>Resume Tracking</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>


      {/* Manual Portfolio Modal */}
      {showLinkModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="manual-portfolio-title" className="fixed inset-0 z-modal bg-backdrop backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-surface-1 border border-line p-5 sm:p-6 rounded-3xl max-w-md w-full shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-4 text-content-1 font-mono">
            <div className="flex justify-between items-center pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-700/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="manual-portfolio-title" className="text-sm font-bold uppercase">
                    {editingDemat ? 'Edit Manual Portfolio' : 'Add Manual Portfolio'}
                  </h3>
                  <p className="text-[10px] text-content-3">
                    Record a snapshot now; live broker connections are coming soon.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowLinkModal(false);
                  setEditingDemat(null);
                }}
                aria-label="Close" className="text-content-3 hover:text-content-1 p-1 rounded-lg bg-surface-2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLinkedAccount} className="space-y-3.5">
              {/* Select Portfolio Provider */}
              <div>
                <label className="block text-[10px] text-content-2 uppercase tracking-wider mb-1">
                  Brokerage / Portfolio Name
                </label>
                <select
                  value={modalBrokerCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setModalBrokerCode(code);
                    const brokerNames: Record<string, string> = {
                      Zerodha: 'Zerodha Kite',
                      Dhan: 'Dhan HQ',
                      Groww: 'Groww Direct',
                      Upstox: 'Upstox Pro',
                      'Angel One': 'Angel One',
                      'ICICI Direct': 'ICICI Direct',
                    };
                    setModalBrokerName(brokerNames[code] || code);
                  }}
                  className="w-full px-3 py-2 bg-surface-3 border border-line rounded-xl text-xs text-content-1 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Zerodha">Zerodha</option>
                  <option value="Dhan">Dhan</option>
                  <option value="Groww">Groww</option>
                  <option value="Upstox">Upstox</option>
                  <option value="Angel One">Angel One</option>
                  <option value="ICICI Direct">ICICI Direct</option>
                </select>
              </div>

              {/* Manual Portfolio Snapshot */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] text-content-2 uppercase tracking-wider mb-1">
                    Portfolio Value ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={modalPortfolioValue}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      setModalPortfolioValue(e.target.value);
                      setModalValidationError('');
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-surface-3 border border-line rounded-xl text-xs text-content-1 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-content-2 uppercase tracking-wider mb-1">
                    Estimated Returns (%)
                  </label>
                  <input
                    type="number"
                    min="-100"
                    step="any"
                    required
                    value={modalPortfolioReturns}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      setModalPortfolioReturns(e.target.value);
                      setModalValidationError('');
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-surface-3 border border-line rounded-xl text-xs text-content-1 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] text-content-2 uppercase tracking-wider mb-1">
                    Number of Holdings
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={modalHoldingCount}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      setModalHoldingCount(e.target.value);
                      setModalValidationError('');
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-surface-3 border border-line rounded-xl text-xs text-content-1 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {modalValidationError && (
                <p role="alert" className="text-xs text-red-400">{modalValidationError}</p>
              )}

              {/* Manual Tracking Note */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-start gap-2.5 text-[10px] text-emerald-800 dark:text-emerald-300">
                <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Values are entered manually and stored in app settings. No broker account access or price feed is connected.
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkModal(false);
                    setEditingDemat(null);
                  }}
                  className="flex-1 py-2.5 bg-surface-2 hover:bg-surface-3 border border-line text-content-2 hover:text-content-1 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingDemat ? 'Save Portfolio' : 'Add Portfolio'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
