import React, { useState, useMemo, useEffect } from 'react';
import { InvestmentRecord, InvestmentType } from '../types/finance';
import {
  TrendingUp,
  Plus,
  BarChart2,
  PieChart as PieIcon,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Calendar,
  Wallet,
  Layers,
  Search,
  Table as TableIcon,
  LayoutList,
  MoreVertical
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface InvestmentsViewProps {
  investments: InvestmentRecord[];
  onAddInvestment: (inv: InvestmentRecord) => void;
  currencySymbol: string;
}

interface InvestmentTxn {
  id: string;
  date: string;
  category: string;
  account: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
}

export const InvestmentsView: React.FC<InvestmentsViewProps> = ({
  investments,
  onAddInvestment,
  currencySymbol,
}) => {
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Collapsible filter state
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState<boolean>(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [isKpiStacked, setIsKpiStacked] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'table' | 'detail'>('table');
  const [selectedMonth, setSelectedMonth] = useState<string>('Jul 2026');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [selectedAccount, setSelectedAccount] = useState<string>('All Accounts');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Auto-collapse when user scrolls down
  useEffect(() => {
    const handleScroll = () => {
      const mainEl = document.querySelector('main');
      if (mainEl && mainEl.scrollTop > 50 && !isKpiStacked) {
        setIsKpiStacked(true);
      }
    };
    const mainEl = document.querySelector('main');
    mainEl?.addEventListener('scroll', handleScroll);
    return () => mainEl?.removeEventListener('scroll', handleScroll);
  }, [isKpiStacked]);

  // Form state
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<InvestmentType>('Mutual Funds');
  const [amountInvested, setAmountInvested] = useState<string>('');
  const [currentValue, setCurrentValue] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedMonth !== 'Jul 2026') count++;
    if (selectedCategory !== 'All Categories') count++;
    if (selectedAccount !== 'All Accounts') count++;
    if (selectedType !== 'All') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedMonth, selectedCategory, selectedAccount, selectedType, searchQuery]);

  // Derive investment transaction history table matching reference image
  const investmentTransactions: InvestmentTxn[] = useMemo(() => {
    return [
      {
        id: 'tx_inv_1',
        date: '2026-07-17',
        category: 'Others Investments',
        account: 'UPI',
        type: 'DEBIT',
        amount: 5000,
      },
      {
        id: 'tx_inv_2',
        date: '2026-07-10',
        category: 'SIP',
        account: 'Bank Account',
        type: 'DEBIT',
        amount: 4500,
      },
      {
        id: 'tx_inv_3',
        date: '2026-07-05',
        category: 'Others Investments',
        account: 'UPI',
        type: 'DEBIT',
        amount: 3471.9,
      },
    ];
  }, []);

  // Filter transactions according to selected filters
  const filteredTxns = useMemo(() => {
    return investmentTransactions.filter((tx) => {
      if (selectedCategory !== 'All Categories' && tx.category !== selectedCategory) return false;
      if (selectedAccount !== 'All Accounts' && tx.account !== selectedAccount) return false;
      if (selectedType !== 'All' && tx.type !== selectedType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !tx.category.toLowerCase().includes(q) &&
          !tx.account.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [investmentTransactions, selectedCategory, selectedAccount, selectedType, searchQuery]);

  // Calculations for summary KPI matching reference image
  const totalDebit = useMemo(() => {
    return filteredTxns
      .filter((t) => t.type === 'DEBIT')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTxns]);

  const totalCredit = useMemo(() => {
    return filteredTxns
      .filter((t) => t.type === 'CREDIT')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTxns]);

  const totalInvestmentAmount = totalDebit - totalCredit;

  // Trend data for Line Chart
  const trendData = useMemo(() => {
    return [
      { date: '02 Jul', amount: 0 },
      { date: '05 Jul', amount: 3471.9 },
      { date: '10 Jul', amount: 7971.9 },
      { date: '17 Jul', amount: 12971.9 },
      { date: '25 Jul', amount: 12971.9 },
      { date: '30 Jul', amount: 12971.9 },
    ];
  }, []);

  // Pie chart data by Category
  const pieData = useMemo(() => {
    return [
      { name: 'Others Investments', value: 8471.9, color: '#06b6d4' },
      { name: 'SIP', value: 4500.0, color: '#3b82f6' },
    ];
  }, []);

  // Overall Portfolio calculations
  const totalInvestedCapital = investments.reduce((sum, i) => sum + i.amountInvested, 0);
  const totalCurrentValue = investments.reduce((sum, i) => sum + i.currentValue, 0);
  const totalProfit = totalCurrentValue - totalInvestedCapital;
  const overallReturnPercent = totalInvestedCapital > 0 ? ((totalProfit / totalInvestedCapital) * 100).toFixed(2) : '0.00';

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  };

  const handleSaveInvestment = (e: React.FormEvent) => {
    e.preventDefault();
    const numInv = parseFloat(amountInvested);
    const numVal = parseFloat(currentValue) || numInv;

    if (isNaN(numInv) || numInv <= 0) return;

    const returnPct = parseFloat((((numVal - numInv) / numInv) * 100).toFixed(2));

    const newInv: InvestmentRecord = {
      id: 'inv_' + Date.now(),
      name: name.trim() || 'New Investment',
      type,
      amountInvested: numInv,
      currentValue: numVal,
      returnsPercent: returnPct,
      date: new Date().toISOString().slice(0, 10),
      monthlyContributions: [
        { month: new Date().toISOString().slice(0, 7), amount: numInv }
      ],
      notes: notes.trim(),
    };

    onAddInvestment(newInv);
    setShowAddModal(false);
    setName('');
    setAmountInvested('');
    setCurrentValue('');
    setNotes('');
  };

  return (
    <div className="space-y-6 pb-16 font-mono text-white relative">
      {/* Backdrop overlay for click-outside auto-collapsing filters or menus */}
      {(isFilterOpen || showThreeDotMenu) && (
        <div
          className="fixed inset-0 z-20 pointer-events-auto cursor-default"
          onClick={() => {
            setIsFilterOpen(false);
            setShowThreeDotMenu(false);
          }}
        />
      )}

      {/* ==================== TOP BAR: TITLE, SEARCH, FILTER ICON & THREE DOT MENU ==================== */}
      <div className="flex items-center justify-between gap-2.5 pb-2 border-b border-[#222] relative z-30">
        {isSearchExpanded ? (
          /* Search Bar overlapping Page Title */
          <div className="flex-1 relative min-w-0 mr-1 animate-in fade-in duration-200">
            <Search className="w-3.5 h-3.5 text-red-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search investments..."
              className="w-full pl-8 pr-8 py-1.5 bg-[#0a0a0a] border border-red-600/80 rounded-lg text-[11px] font-mono text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-red-500 shadow-inner"
            />
            <button
              type="button"
              onClick={() => setIsSearchExpanded(false)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888] hover:text-white p-1 cursor-pointer transition-colors"
              title="Close Search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* Page Title */
          <h2 className="text-xs sm:text-sm font-mono font-bold text-white uppercase tracking-wider shrink-0">
            INVESTMENTS
          </h2>
        )}

        {/* Right Action Icons (Search Icon, Filter Icon, Three-Dot Menu) */}
        <div className="flex items-center gap-2 shrink-0">
          {!isSearchExpanded && (
            <button
              type="button"
              onClick={() => setIsSearchExpanded(true)}
              title="Search Investments"
              className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                searchQuery
                  ? 'bg-[#222] border-red-600/80 text-white font-bold'
                  : 'bg-[#0a0a0a] border-[#222] text-[#aaa] hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-white" />
              {searchQuery && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5" />
              )}
            </button>
          )}

          {/* Filter Icon Button */}
          <button
            type="button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            title="Toggle Filters"
            className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
              isFilterOpen || activeFilterCount > 0
                ? 'bg-[#222] border-red-600/80 text-white font-bold'
                : 'bg-[#0a0a0a] border-[#222] text-[#aaa] hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-red-500" />
            {activeFilterCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5" />
            )}
          </button>

          {/* Three-Dot Menu Button */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowThreeDotMenu(!showThreeDotMenu)}
              className="p-2 bg-[#0a0a0a] border border-[#222] hover:border-[#444] rounded-lg text-white transition-colors cursor-pointer flex items-center justify-center"
              title="More options"
            >
              <MoreVertical className="w-3.5 h-3.5 text-white" />
            </button>

            {showThreeDotMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-[#111] border border-[#333] rounded-xl shadow-xl z-50 py-1 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(true);
                    setShowThreeDotMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-[#eee] hover:bg-[#222] hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-red-500" />
                  <span>Log Investment</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Collapsible Filter Panel */}
      {isFilterOpen && (
        <div className="bg-[#111111] border border-[#222] rounded-xl p-4 space-y-4 relative z-30">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  MONTH
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="Jul 2026">Jul 2026</option>
                  <option value="Jun 2026">Jun 2026</option>
                  <option value="May 2026">May 2026</option>
                  <option value="All">All Months</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  CATEGORY
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="All Categories">All Categories</option>
                  <option value="SIP">SIP</option>
                  <option value="Mutual Funds">Mutual Funds</option>
                  <option value="Others Investments">Others Investments</option>
                  <option value="Stocks">Stocks & ETFs</option>
                  <option value="Crypto">Crypto Assets</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  ACCOUNT
                </label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="All Accounts">All Accounts</option>
                  <option value="UPI">UPI</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Bank Account">Bank Account</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  TYPE
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="All">All</option>
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
            </div>

            {/* Reset Filter Button */}
            {activeFilterCount > 0 && (
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth('Jul 2026');
                    setSelectedCategory('All Categories');
                    setSelectedAccount('All Accounts');
                    setSelectedType('All');
                    setSearchQuery('');
                  }}
                  className="text-[10px] font-mono uppercase text-red-400 hover:underline"
                >
                  RESET FILTERS
                </button>
              </div>
            )}
        </div>
      )}

      {/* ==================== PORTFOLIO SUMMARY & ASSETS ==================== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-[#888]">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-red-500" />
            <span className="uppercase font-bold tracking-wider text-white">PORTFOLIO SUMMARY & ASSETS</span>
          </div>
          <button
            type="button"
            onClick={() => setIsKpiStacked(!isKpiStacked)}
            className="p-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] hover:border-red-500 rounded-lg text-white transition-colors cursor-pointer flex items-center justify-center shadow-sm"
            title={isKpiStacked ? "Expand Metrics" : "Collapse Metrics"}
          >
            {isKpiStacked ? (
              <ChevronDown className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-red-400" />
            )}
          </button>
        </div>

        <div
          className={`transition-all duration-300 ease-in-out ${
            isKpiStacked
              ? 'space-y-[-50px] sm:space-y-[-54px] pt-1 pb-2 max-w-2xl mx-auto'
              : 'grid grid-cols-3 gap-1.5 sm:gap-3'
          }`}
        >
          {/* CURRENT VALUE */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-2.5 sm:p-3.5 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-emerald-400 rounded-xl space-y-1 min-w-0 transition-all duration-300 ${
              isKpiStacked
                ? 'z-30 shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[8px] sm:text-[9px] font-mono font-bold text-[#aaa] uppercase tracking-wider truncate">
                CURRENT VALUE
              </span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </div>
            <div className="text-xs sm:text-lg font-bold font-mono text-white truncate">
              {currencySymbol}{totalCurrentValue.toLocaleString('en-IN')}
            </div>
            <div className="text-[9px] sm:text-[10px] text-emerald-400 font-mono flex items-center gap-0.5 truncate">
              <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
              <span>+{overallReturnPercent}%</span>
            </div>
          </div>

          {/* CAPITAL INVESTED */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-2.5 sm:p-3.5 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-cyan-400 rounded-xl space-y-1 min-w-0 transition-all duration-300 ${
              isKpiStacked
                ? 'z-20 scale-[0.98] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[8px] sm:text-[9px] font-mono font-bold text-[#aaa] uppercase tracking-wider truncate">
                CAPITAL INVESTED
              </span>
              <DollarSign className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            </div>
            <div className="text-xs sm:text-lg font-bold font-mono text-[#aaa] truncate">
              {currencySymbol}{totalInvestedCapital.toLocaleString('en-IN')}
            </div>
            <div className="text-[9px] sm:text-[10px] text-[#666] font-mono truncate">
              Principal
            </div>
          </div>

          {/* UNREALIZED RETURNS */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-2.5 sm:p-3.5 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-emerald-500 rounded-xl space-y-1 min-w-0 transition-all duration-300 ${
              isKpiStacked
                ? 'z-10 scale-[0.96] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[8px] sm:text-[9px] font-mono font-bold text-[#aaa] uppercase tracking-wider truncate">
                UNREALIZED RETURNS
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </div>
            <div className={`text-xs sm:text-lg font-bold font-mono truncate ${
              totalProfit >= 0 ? 'text-emerald-400' : 'text-red-500'
            }`}>
              {totalProfit >= 0 ? '+' : ''}{currencySymbol}{totalProfit.toLocaleString('en-IN')}
            </div>
            <div className="text-[9px] sm:text-[10px] text-emerald-400 font-mono truncate">
              Active
            </div>
          </div>
        </div>
      </div>

      {/* ==================== CHARTS SECTION (TREND OVER TIME & BY CATEGORY) ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* TREND OVER TIME Line Chart */}
        <div className="bg-[#111111] border border-[#222] p-4 sm:p-5 rounded-2xl space-y-3">
          <div className="text-[10px] font-mono font-bold text-[#777] uppercase tracking-widest flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <span>TREND OVER TIME</span>
          </div>

          <div className="h-48 sm:h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" stroke="#555" fontSize={10} tickLine={false} />
                <YAxis stroke="#555" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '12px', fontSize: '11px', fontFamily: 'monospace' }}
                  itemStyle={{ color: '#06b6d4' }}
                  formatter={(value: any) => [`${currencySymbol}${Number(value).toLocaleString()}`, 'Investment']}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#06b6d4' }}
                  activeDot={{ r: 6, fill: '#38bdf8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BY CATEGORY Pie Chart */}
        <div className="bg-[#111111] border border-[#222] p-4 sm:p-5 rounded-2xl space-y-3">
          <div className="text-[10px] font-mono font-bold text-[#777] uppercase tracking-widest flex items-center gap-2">
            <PieIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>BY CATEGORY</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 h-48 sm:h-56">
            <div className="w-full sm:w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={65}
                    paddingAngle={3}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '12px', fontSize: '11px', fontFamily: 'monospace' }}
                    formatter={(val: any) => [`${currencySymbol}${Number(val).toLocaleString()}`, 'Amount']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend list matching image */}
            <div className="w-full sm:w-1/2 space-y-2.5">
              {pieData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs font-mono bg-[#0a0a0a] p-2.5 rounded-xl border border-[#222]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[#ccc] truncate max-w-[110px]">{item.name}</span>
                  </div>
                  <span className="font-bold text-white">
                    {currencySymbol}{item.value.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== TRANSACTIONS TABLE & CARD VIEW ==================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono font-bold text-[#888] uppercase tracking-wider">
            TRANSACTIONS
          </div>

          <div className="flex items-center bg-[#111111] p-0.5 border border-[#222] rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1 px-2 rounded text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-[#222] text-white font-bold' : 'text-[#777] hover:text-white'
              }`}
              title="Table View"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="text-[10px]">Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('detail')}
              className={`p-1 px-2 rounded text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                viewMode === 'detail' ? 'bg-[#222] text-white font-bold' : 'text-[#777] hover:text-white'
              }`}
              title="Card Detail View"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="text-[10px]">Detail</span>
            </button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <div className="bg-[#111111] border border-[#222] rounded-2xl overflow-x-auto shadow-sm">
            <div className="min-w-[620px]">
              {/* Table Header */}
              <div className="grid grid-cols-12 px-4 py-3 border-b border-[#222] text-[#666] text-[10px] font-bold uppercase tracking-wider bg-[#0a0a0a]">
                <div className="col-span-3">DATE</div>
                <div className="col-span-3">CATEGORY</div>
                <div className="col-span-2">ACCOUNT</div>
                <div className="col-span-2">TYPE</div>
                <div className="col-span-2 text-right">AMOUNT</div>
              </div>

              {/* Rows */}
              {filteredTxns.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#666]">
                  No investment transactions match criteria.
                </div>
              ) : (
                filteredTxns.map((tx) => (
                  <div
                    key={tx.id}
                    className="grid grid-cols-12 px-4 py-3 border-b border-[#1a1a1a] items-center text-xs text-white hover:bg-[#161616] transition-colors"
                  >
                    <div className="col-span-3 text-[#aaa]">
                      {formatDateDisplay(tx.date)}
                    </div>
                    <div className="col-span-3 font-bold text-white">
                      {tx.category}
                    </div>
                    <div className="col-span-2 text-[#aaa]">
                      {tx.account}
                    </div>
                    <div className="col-span-2 font-bold text-red-500">
                      {tx.type}
                    </div>
                    <div className="col-span-2 text-right font-bold text-red-500">
                      -{currencySymbol}{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredTxns.length === 0 ? (
              <div className="col-span-2 p-8 text-center text-xs text-[#666] bg-[#111] border border-[#222] rounded-2xl">
                No investment transactions match criteria.
              </div>
            ) : (
              filteredTxns.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3 bg-[#111111] border border-[#222] rounded-2xl flex items-center justify-between gap-3 font-mono hover:border-[#333] transition-colors"
                >
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white">{tx.category}</div>
                    <div className="text-[10px] text-[#777] flex items-center gap-2">
                      <span>{formatDateDisplay(tx.date)}</span>
                      <span>•</span>
                      <span>{tx.account}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-red-500">
                      -{currencySymbol}{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                    </div>
                    <span className="text-[9px] bg-red-950/80 text-red-400 font-bold px-1.5 py-0.5 rounded uppercase">
                      {tx.type}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ==================== INDIVIDUAL HOLDINGS & ASSET CARDS ==================== */}
      <div className="pt-4 border-t border-[#222] space-y-4">
        <div className="text-xs font-mono font-bold text-[#888] uppercase tracking-wider">
          PORTFOLIO ASSETS & INDIVIDUAL HOLDINGS
        </div>

        {/* Existing Asset Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {investments.map((inv) => (
            <div
              key={inv.id}
              className="p-5 bg-carbon border border-nothing hover:border-[#333] rounded-3xl space-y-4 transition-all"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="px-2.5 py-0.5 bg-obsidian border border-nothing text-[9px] font-mono text-red-400 font-bold uppercase rounded">
                    {inv.type}
                  </span>
                  <h3 className="text-base font-bold font-mono text-white mt-2">{inv.name}</h3>
                  {inv.notes && <p className="text-xs text-[#777] font-mono mt-1">{inv.notes}</p>}
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold font-mono text-white">
                    {currencySymbol}{inv.currentValue.toLocaleString('en-IN')}
                  </div>
                  <div className={`text-xs font-mono font-bold ${
                    inv.returnsPercent >= 0 ? 'text-green-400' : 'text-red-500'
                  }`}>
                    {inv.returnsPercent >= 0 ? '+' : ''}{inv.returnsPercent}%
                  </div>
                </div>
              </div>

              {/* Monthly Contributions Log */}
              <div className="pt-3 border-t border-nothing">
                <div className="text-[10px] text-[#666] uppercase tracking-wider font-mono mb-2">
                  Monthly Contributions Record
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {inv.monthlyContributions.length === 0 ? (
                    <span className="text-xs text-[#555] font-mono">No recurring monthly logs</span>
                  ) : (
                    inv.monthlyContributions.map((mc, idx) => (
                      <div key={idx} className="px-2.5 py-1 bg-obsidian border border-nothing rounded-lg text-center shrink-0">
                        <div className="text-[9px] text-[#666] font-mono">{mc.month}</div>
                        <div className="text-xs font-bold font-mono text-white">+{currencySymbol}{mc.amount.toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal for adding investment */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-carbon border border-nothing p-6 rounded-3xl max-w-md w-full shadow-2xl relative">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-nothing">
              <h3 className="text-sm font-bold font-mono text-white uppercase">Log Investment Record</h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#666] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvestment} className="space-y-4">
              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Investment / Asset Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Parag Parikh Flexi Cap Fund"
                  className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Asset Category
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as InvestmentType)}
                  className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="Mutual Funds">Mutual Funds</option>
                  <option value="Stocks">Stocks & ETFs</option>
                  <option value="Crypto">Crypto Assets</option>
                  <option value="Gold">Gold & Commodities</option>
                  <option value="Fixed Deposit">Fixed Deposit / Debt</option>
                  <option value="Real Estate">Real Estate</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                    Amount Invested
                  </label>
                  <input
                    type="number"
                    required
                    value={amountInvested}
                    onChange={(e) => setAmountInvested(e.target.value)}
                    placeholder="10000"
                    className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                    Current Market Value
                  </label>
                  <input
                    type="number"
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    placeholder="Leave empty if same"
                    className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Monthly SIP on 10th"
                  className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-nothing">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-nothing text-[#888] text-xs font-mono rounded-xl hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-white text-black font-mono text-xs font-bold uppercase rounded-xl hover:bg-neutral-200"
                >
                  Save Investment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

