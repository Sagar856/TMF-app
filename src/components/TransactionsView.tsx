import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Category } from '../types/finance';
import { Download, Plus, LayoutList, Table as TableIcon, Filter, ChevronDown, ChevronUp, SlidersHorizontal, Layers, Search, TrendingDown, TrendingUp, Wallet, MoreVertical, X } from 'lucide-react';

interface TransactionsViewProps {
  transactions: Transaction[];
  categories: Category[];
  onAddTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  currencySymbol: string;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  categories,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  currencySymbol,
}) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  // No date range restriction by default — newly added transactions must
  // always show up immediately. (Previously these were hardcoded to a fixed
  // 2026-06-30..2026-07-30 window, silently hiding every record added after
  // that date.) Users can still narrow the range via the filter panel.
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All Categories');
  const [accountFilter, setAccountFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [tagFilter, setTagFilter] = useState<string>('All');

  // Collapsible Filter Panel state
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState<boolean>(false);

  // Stack vs Expanded state for Top KPIs
  const [isKpiStacked, setIsKpiStacked] = useState<boolean>(true);

  // Auto-collapse expanded KPIs when user scrolls down
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

  // View Mode: 'table' | 'detail'
  const [viewMode, setViewMode] = useState<'table' | 'detail'>('table');

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (categoryFilter !== 'All Categories' && categoryFilter !== 'All') count++;
    if (accountFilter !== 'All') count++;
    if (typeFilter !== 'All') count++;
    if (tagFilter !== 'All') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [categoryFilter, accountFilter, typeFilter, tagFilter, searchQuery]);

  // Unique list of accounts (sources / payment methods)
  const uniqueAccounts = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.source) set.add(tx.source);
      if (tx.paymentMethod) set.add(tx.paymentMethod);
    });
    return Array.from(set).sort();
  }, [transactions]);

  // Unique list of tags (subcategories)
  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.subcategory) set.add(tx.subcategory);
    });
    return Array.from(set).sort();
  }, [transactions]);

  // Date formatter e.g. "2026-07-29" -> "29 Jul 2026"
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Filter logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Search matching title, payee, category, account, location
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = tx.title.toLowerCase().includes(q);
        const matchPayee = tx.payeeOrPayer?.toLowerCase().includes(q) || false;
        const matchCat = tx.category.toLowerCase().includes(q);
        const matchSubcat = tx.subcategory.toLowerCase().includes(q);
        const matchAccount = tx.source.toLowerCase().includes(q) || (tx.paymentMethod?.toLowerCase().includes(q) || false);
        const matchPlace = tx.location?.name.toLowerCase().includes(q) || false;
        if (!matchTitle && !matchPayee && !matchCat && !matchSubcat && !matchAccount && !matchPlace) {
          return false;
        }
      }

      // From date
      if (fromDate && tx.date < fromDate) return false;

      // To date
      if (toDate && tx.date > toDate) return false;

      // Category
      if (categoryFilter !== 'All Categories' && categoryFilter !== 'All') {
        if (tx.category !== categoryFilter) return false;
      }

      // Account
      if (accountFilter !== 'All') {
        if (tx.source !== accountFilter && tx.paymentMethod !== accountFilter) return false;
      }

      // Type
      if (typeFilter !== 'All') {
        if (typeFilter === 'Debit' && tx.type !== 'debit') return false;
        if (typeFilter === 'Credit' && tx.type !== 'credit') return false;
      }

      // Tag
      if (tagFilter !== 'All') {
        if (tx.subcategory !== tagFilter) return false;
      }

      return true;
    });
  }, [
    transactions,
    searchQuery,
    fromDate,
    toDate,
    categoryFilter,
    accountFilter,
    typeFilter,
    tagFilter,
  ]);

  // KPI Calculations
  const totalDebit = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const totalCredit = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const netBalance = totalCredit - totalDebit;

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Title', 'Type', 'Amount', 'Category', 'Subcategory', 'Date', 'Time', 'Source', 'Payee', 'Location'];
    const rows = filteredTransactions.map((t) => [
      t.id,
      `"${t.title.replace(/"/g, '""')}"`,
      t.type,
      t.amount,
      `"${t.category}"`,
      `"${t.subcategory}"`,
      t.date,
      t.time,
      t.source,
      `"${t.payeeOrPayer || ''}"`,
      `"${t.location?.name || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Transactions_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              placeholder="Search title, payee, category..."
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
            TRANSACTIONS
          </h2>
        )}

        {/* Right Action Icons (Search Icon, Filter Icon, Three-Dot Menu) */}
        <div className="flex items-center gap-2 shrink-0">
          {!isSearchExpanded && (
            <button
              type="button"
              onClick={() => setIsSearchExpanded(true)}
              title="Search Transactions"
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

          {/* Filter Icon Button (Icon Only) */}
          <button
            type="button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            title="Toggle Filters"
            className={`p-2 rounded-lg border transition-all cursor-pointer shrink-0 flex items-center justify-center ${
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

          {/* Three-Dot Menu Button (Contains Export CSV & Add Transaction) */}
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
                    handleExportCSV();
                    setShowThreeDotMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-[#eee] hover:bg-[#222] hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddTransaction();
                    setShowThreeDotMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-[#eee] hover:bg-[#222] hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-red-500" />
                  <span>Add Transaction</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== COLLAPSIBLE FILTER PANEL ==================== */}
      {isFilterOpen && (
        <div className="bg-[#111111] border border-[#222] rounded-xl p-4 space-y-4 relative z-30">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  FROM DATE
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  TO DATE
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  CATEGORY
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="All Categories">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  ACCOUNT
                </label>
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="All">All Accounts</option>
                  {uniqueAccounts.map((acc) => (
                    <option key={acc} value={acc}>
                      {acc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  TYPE
                </label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="All">All Types</option>
                  <option value="Debit">Debit</option>
                  <option value="Credit">Credit</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  TAG / SUBCATEGORY
                </label>
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="All">All Tags</option>
                  {uniqueTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reset Filter Button */}
            {activeFilterCount > 0 && (
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('All Categories');
                    setAccountFilter('All');
                    setTypeFilter('All');
                    setTagFilter('All');
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

      {/* ==================== KPI SUMMARY CARDS ==================== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-[#888]">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-red-500" />
            <span className="uppercase font-bold tracking-wider text-white">TRANSACTION METRICS</span>
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
          {/* DEBIT */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-2.5 sm:p-3 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-red-500 rounded-xl space-y-1 min-w-0 transition-all duration-300 ${
              isKpiStacked
                ? 'z-30 shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[8px] sm:text-[9px] font-mono font-bold text-[#aaa] uppercase tracking-wider truncate">
                DEBIT
              </span>
              <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
            </div>
            <div className="text-xs sm:text-lg font-bold font-mono text-red-500 truncate">
              -{currencySymbol}{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[9px] text-[#888] font-mono truncate">
              {filteredTransactions.filter(t => t.type === 'Debit' || t.amount < 0).length} debits logged
            </div>
          </div>

          {/* CREDIT */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-2.5 sm:p-3 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-emerald-500 rounded-xl space-y-1 min-w-0 transition-all duration-300 ${
              isKpiStacked
                ? 'z-20 scale-[0.98] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[8px] sm:text-[9px] font-mono font-bold text-[#aaa] uppercase tracking-wider truncate">
                CREDIT
              </span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </div>
            <div className="text-xs sm:text-lg font-bold font-mono text-emerald-400 truncate">
              {currencySymbol}{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[9px] text-[#888] font-mono truncate">
              {filteredTransactions.filter(t => t.type === 'Credit' || t.amount > 0).length} credits logged
            </div>
          </div>

          {/* NET */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-2.5 sm:p-3 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-cyan-400 rounded-xl space-y-1 min-w-0 transition-all duration-300 ${
              isKpiStacked
                ? 'z-10 scale-[0.96] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[8px] sm:text-[9px] font-mono font-bold text-[#aaa] uppercase tracking-wider truncate">
                NET
              </span>
              <Wallet className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            </div>
            <div
              className={`text-xs sm:text-lg font-bold font-mono truncate ${
                netBalance >= 0 ? 'text-emerald-400' : 'text-red-500'
              }`}
            >
              {netBalance < 0 ? '-' : ''}{currencySymbol}{Math.abs(netBalance).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[9px] text-[#888] font-mono truncate">
              {filteredTransactions.length} total records
            </div>
          </div>
        </div>
      </div>

      {/* ==================== VIEW TOGGLE DIRECTLY ABOVE TABLE ==================== */}
      <div className="flex justify-between items-center pt-2">
        <div className="text-xs font-mono font-bold text-[#888] uppercase tracking-wider">
          TRANSACTION RECORDS ({filteredTransactions.length})
        </div>

        {/* Table & Detail view option directly above table */}
        <div className="bg-[#0a0a0a] border border-[#222] p-1 rounded-xl flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-[10px] font-mono uppercase rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'table'
                ? 'bg-[#222] text-white font-bold border border-[#333]'
                : 'text-[#666] hover:text-[#aaa]'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>TABLE</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('detail')}
            className={`px-3 py-1.5 text-[10px] font-mono uppercase rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'detail'
                ? 'bg-[#222] text-white font-bold border border-[#333]'
                : 'text-[#666] hover:text-[#aaa]'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>DETAIL</span>
          </button>
        </div>
      </div>

      {/* ==================== RECORD LISTING ==================== */}
      {viewMode === 'table' ? (
        /* TABLE FORMAT */
        <div className="bg-[#111111] border border-[#222] rounded-2xl overflow-x-auto shadow-sm">
          <div className="min-w-[720px]">
            {/* Header */}
            <div className="grid grid-cols-12 px-4 py-3 border-b border-[#222] text-[#666] text-[10px] font-bold uppercase tracking-wider bg-[#0a0a0a]">
              <div className="col-span-2">DATE</div>
              <div className="col-span-2">CATEGORY</div>
              <div className="col-span-2">AMOUNT</div>
              <div className="col-span-1">ACCOUNT</div>
              <div className="col-span-2">DESCRIPTION</div>
              <div className="col-span-2">PLACE</div>
              <div className="col-span-1 text-right">ACTIONS</div>
            </div>

            {/* Rows */}
            {filteredTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#666]">
                No transactions match your search filters.
              </div>
            ) : (
              filteredTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-12 px-4 py-3 border-b border-[#1a1a1a] items-center text-xs text-white hover:bg-[#161616] transition-colors"
                >
                  {/* DATE */}
                  <div className="col-span-2 text-[#aaa]">
                    {formatDateDisplay(tx.date)}
                  </div>

                  {/* CATEGORY */}
                  <div className="col-span-2 font-bold text-white truncate pr-2">
                    {tx.category}
                  </div>

                  {/* AMOUNT */}
                  <div
                    className={`col-span-2 font-mono font-bold ${
                      tx.type === 'debit' ? 'text-red-500' : 'text-emerald-400'
                    }`}
                  >
                    {tx.type === 'debit' ? '-' : '+'}{currencySymbol}{tx.amount.toLocaleString('en-IN')}
                  </div>

                  {/* ACCOUNT */}
                  <div className="col-span-1 text-[#aaa] truncate">
                    {tx.paymentMethod || tx.source}
                  </div>

                  {/* DESCRIPTION */}
                  <div className="col-span-2 text-white truncate pr-2">
                    {tx.title}
                  </div>

                  {/* PLACE */}
                  <div className="col-span-2 text-[#aaa] truncate">
                    {tx.location?.name || tx.payeeOrPayer || '—'}
                  </div>

                  {/* ACTIONS */}
                  <div className="col-span-1 flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEditTransaction(tx)}
                      className="px-1.5 py-0.5 border border-[#333] text-[#aaa] hover:text-white text-[10px] uppercase rounded transition-colors"
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(tx.id)}
                      className="px-1.5 py-0.5 border border-red-900/80 text-red-500 hover:bg-red-950/40 text-[10px] uppercase rounded transition-colors"
                    >
                      DEL
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* DETAIL FORMAT (Card layout) */
        <div className="bg-[#111111] border border-[#222] rounded-2xl divide-y divide-[#1c1c1c] overflow-hidden">
          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#666]">
              No transactions match your search filters.
            </div>
          ) : (
            filteredTransactions.map((tx) => (
              <div
                key={tx.id}
                className="p-4 hover:bg-[#161616] transition-colors flex items-center justify-between flex-wrap gap-4 group"
              >
                {/* Left: DR/CR badge & Title */}
                <div className="flex items-center gap-3.5 min-w-[240px]">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                      tx.type === 'debit'
                        ? 'bg-red-950/50 border border-red-800/80 text-red-500'
                        : 'bg-emerald-950/50 border border-emerald-800/80 text-emerald-400'
                    }`}
                  >
                    {tx.type === 'debit' ? 'DR' : 'CR'}
                  </div>

                  <div>
                    <div className="text-sm font-bold text-white font-mono group-hover:text-red-400 transition-colors">
                      {tx.title}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#777] font-mono mt-0.5">
                      <span className="text-white">{formatDateDisplay(tx.date)} · {tx.time}</span>
                      <span>•</span>
                      <span className="text-[#aaa]">{tx.category} / {tx.subcategory}</span>
                    </div>
                  </div>
                </div>

                {/* Center: Badges */}
                <div className="hidden md:flex items-center gap-2 text-[10px] font-mono">
                  <span className="px-2 py-0.5 bg-[#0a0a0a] border border-[#222] rounded text-[#aaa]">
                    {tx.source}
                  </span>
                  {tx.location && (
                    <span className="px-2 py-0.5 bg-[#0a0a0a] border border-[#222] rounded text-[#aaa]">
                      {tx.location.name}
                    </span>
                  )}
                </div>

                {/* Right: Amount & Actions */}
                <div className="flex items-center gap-4 ml-auto">
                  <div className="text-right">
                    <div
                      className={`text-base font-mono font-bold ${
                        tx.type === 'debit' ? 'text-red-500' : 'text-emerald-400'
                      }`}
                    >
                      {tx.type === 'debit' ? '-' : '+'}{currencySymbol}{tx.amount.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[9px] font-mono text-[#555]">
                      {tx.paymentMethod || tx.source}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditTransaction(tx)}
                      className="px-2 py-1 border border-[#333] text-[#aaa] hover:text-white text-[10px] uppercase rounded transition-colors"
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(tx.id)}
                      className="px-2 py-1 border border-red-900/80 text-red-500 hover:bg-red-950/40 text-[10px] uppercase rounded transition-colors"
                    >
                      DEL
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
