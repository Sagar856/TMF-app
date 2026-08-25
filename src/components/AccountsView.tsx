import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  Building2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  SlidersHorizontal,
  Search,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Layers,
  Eye,
  EyeOff,
  MoreVertical,
  Check
} from 'lucide-react';
import { FinancialAccount, Transaction, AccountType } from '../types/finance';

interface AccountsViewProps {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  currencySymbol: string;
  onAddAccount: (acc: FinancialAccount) => void;
  onUpdateAccount: (acc: FinancialAccount) => void;
  onDeleteAccount: (id: string) => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  transactions,
  currencySymbol,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
}) => {
  const [selectedType, setSelectedType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState<boolean>(false);

  // Stack vs Side-by-side state for KPIs
  const [isKpiStacked, setIsKpiStacked] = useState<boolean>(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  // Credit Cards Stack state
  const [isCardsStacked, setIsCardsStacked] = useState<boolean>(true);
  const [cardTouchStartY, setCardTouchStartY] = useState<number | null>(null);

  // Auto-collapse when user scrolls down
  React.useEffect(() => {
    const handleScroll = () => {
      const mainEl = document.querySelector('main');
      if (mainEl && mainEl.scrollTop > 50) {
        if (!isKpiStacked) setIsKpiStacked(true);
        if (!isCardsStacked) setIsCardsStacked(true);
      }
    };
    const mainEl = document.querySelector('main');
    mainEl?.addEventListener('scroll', handleScroll);
    return () => mainEl?.removeEventListener('scroll', handleScroll);
  }, [isKpiStacked, isCardsStacked]);

  const handleKpiTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleKpiTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - touchStartY;
    if (diffY > 30) {
      // Swiped down -> Expand
      setIsKpiStacked(false);
    } else if (diffY < -30) {
      // Swiped up -> Stack position
      setIsKpiStacked(true);
    }
    setTouchStartY(null);
  };

  const handleCardTouchStart = (e: React.TouchEvent) => {
    setCardTouchStartY(e.touches[0].clientY);
  };

  const handleCardTouchEnd = (e: React.TouchEvent) => {
    if (cardTouchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - cardTouchStartY;
    if (diffY > 30) {
      // Swipe down -> Expand
      setIsCardsStacked(false);
    } else if (diffY < -30) {
      // Swipe up -> Stack
      setIsCardsStacked(true);
    }
    setCardTouchStartY(null);
  };

  // Modal State for adding/editing account
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingAcc, setEditingAcc] = useState<FinancialAccount | null>(null);

  // Form Fields
  const [accName, setAccName] = useState<string>('');
  const [bankName, setBankName] = useState<string>('Kotak');
  const [accType, setAccType] = useState<AccountType>('Bank');
  const [last4, setLast4] = useState<string>('');
  const [balance, setBalance] = useState<string>('');
  const [creditLimit, setCreditLimit] = useState<string>('');
  const [approxMonthlyBill, setApproxMonthlyBill] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('15th Aug');
  const [cardHolderName, setCardHolderName] = useState<string>('sgrnboff');
  const [cardNetwork, setCardNetwork] = useState<'Visa' | 'Mastercard' | 'RuPay' | 'Amex'>('Visa');
  const [cardTheme, setCardTheme] = useState<'silver' | 'dark' | 'emerald' | 'gold' | 'midnight'>('silver');

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (selectedType !== 'All') {
        if (selectedType === 'Bank' && acc.type !== 'Bank') return false;
        if (selectedType === 'Credit Card' && acc.type !== 'Credit Card') return false;
        if (selectedType === 'Wallet/UPI' && acc.type !== 'Wallet/UPI') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          acc.name.toLowerCase().includes(q) ||
          acc.bankName.toLowerCase().includes(q) ||
          acc.accountNumberLast4.includes(q)
        );
      }
      return true;
    });
  }, [accounts, selectedType, searchQuery]);

  // Calculations
  const bankAccounts = accounts.filter((a) => a.type === 'Bank');
  const creditCards = accounts.filter((a) => a.type === 'Credit Card');
  const wallets = accounts.filter((a) => a.type === 'Wallet/UPI');

  const totalBankBalance = bankAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalWalletBalance = wallets.reduce((sum, a) => sum + a.balance, 0);
  const totalLiquidAssets = totalBankBalance + totalWalletBalance;

  const totalCreditCardSpent = creditCards.reduce((sum, a) => sum + a.balance, 0);
  const totalApproxMonthlyBill = creditCards.reduce((sum, a) => sum + (a.approxMonthlyBill || a.balance), 0);

  // Transactions for selected account
  const selectedAccountObj = accounts.find((a) => a.id === selectedAccountId);
  const accountTxns = useMemo(() => {
    if (!selectedAccountObj) return [];
    return transactions.filter((t) => {
      const pm = (t.paymentMethod || t.rawText || '').toLowerCase();
      const last4Str = selectedAccountObj.accountNumberLast4;
      const bankStr = selectedAccountObj.bankName.toLowerCase();
      return pm.includes(last4Str) || pm.includes(bankStr);
    });
  }, [selectedAccountObj, transactions]);

  const handleOpenAdd = () => {
    setEditingAcc(null);
    setAccName('');
    setBankName('Kotak');
    setAccType('Bank');
    setLast4('');
    setBalance('');
    setCreditLimit('300000');
    setApproxMonthlyBill('');
    setDueDate('15th Aug');
    setCardHolderName('sgrnboff');
    setCardNetwork('Visa');
    setCardTheme('silver');
    setShowModal(true);
  };

  const handleOpenEdit = (acc: FinancialAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAcc(acc);
    setAccName(acc.name);
    setBankName(acc.bankName);
    setAccType(acc.type);
    setLast4(acc.accountNumberLast4);
    setBalance(acc.balance.toString());
    setCreditLimit(acc.creditLimit ? acc.creditLimit.toString() : '');
    setApproxMonthlyBill(acc.approxMonthlyBill ? acc.approxMonthlyBill.toString() : '');
    setDueDate(acc.dueDate || '15th Aug');
    setCardHolderName(acc.cardHolderName || 'sgrnboff');
    setCardNetwork(acc.cardNetwork || 'Visa');
    setCardTheme(acc.cardColorTheme || 'silver');
    setShowModal(true);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const balNum = parseFloat(balance) || 0;
    const limitNum = parseFloat(creditLimit) || 0;
    const billNum = parseFloat(approxMonthlyBill) || balNum;

    const updated: FinancialAccount = {
      id: editingAcc ? editingAcc.id : 'acc_' + Date.now(),
      name: accName.trim() || `${bankName} ${accType}`,
      bankName: bankName.trim(),
      type: accType,
      accountNumberLast4: last4.trim().slice(-4) || '1234',
      balance: balNum,
      creditLimit: accType === 'Credit Card' ? limitNum : undefined,
      approxMonthlyBill: accType === 'Credit Card' ? billNum : undefined,
      dueDate: accType === 'Credit Card' ? dueDate : undefined,
      cardHolderName: cardHolderName.trim() || 'sgrnboff',
      cardNetwork,
      cardColorTheme: cardTheme,
    };

    if (editingAcc) {
      onUpdateAccount(updated);
    } else {
      onAddAccount(updated);
    }
    setShowModal(false);
  };

  // Card theme styling helper with glassmorphic depth
  const getCardThemeClasses = (theme?: string, isActive?: boolean) => {
    switch (theme) {
      case 'dark':
        return 'bg-gradient-to-br from-[#24242e]/90 via-[#16161f]/90 to-[#0a0a0f]/95 border-white/20 text-white backdrop-blur-xl';
      case 'emerald':
        return 'bg-gradient-to-br from-[#064e3b]/90 via-[#022c22]/90 to-[#011711]/95 border-emerald-400/40 text-emerald-100 backdrop-blur-xl';
      case 'midnight':
        return 'bg-gradient-to-br from-[#1e1b4b]/90 via-[#0f172a]/90 to-[#020617]/95 border-blue-400/40 text-blue-100 backdrop-blur-xl';
      case 'gold':
        return 'bg-gradient-to-br from-[#78350f]/90 via-[#451a03]/90 to-[#1c0d02]/95 border-amber-400/40 text-amber-100 backdrop-blur-xl';
      case 'silver':
      default:
        return 'bg-gradient-to-br from-[#e2e8f0]/95 via-[#cbd5e1]/90 to-[#64748b]/95 border-white/50 text-slate-950 backdrop-blur-xl';
    }
  };

  return (
    <div className="space-y-6 pb-16 font-mono text-white">
      {/* Top Header Row - ACCOUNTS title, search bar, filter icon, and three dot menu on same row */}
      <div className="flex items-center justify-between gap-2.5 pb-2 border-b border-[#222]">
        {isSearchExpanded ? (
          /* Search Bar overlapping Page Title */
          <div className="flex-1 relative min-w-0 mr-1 animate-in fade-in duration-200">
            <Search className="w-3.5 h-3.5 text-red-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search account..."
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
          /* Title: ACCOUNTS only */
          <h2 className="text-xs sm:text-sm font-mono font-bold text-white uppercase tracking-wider shrink-0">
            ACCOUNTS
          </h2>
        )}

        {/* Search, Filter Icon, Three-Dot Menu (Aligned on same row at top) */}
        <div className="flex items-center gap-2 shrink-0">
          {!isSearchExpanded && (
            <button
              type="button"
              onClick={() => setIsSearchExpanded(true)}
              title="Search Accounts"
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

          {/* Filter Icon Button (Icon only - toggles popup with ALL, BANK, CARD, UPI) */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              title="Filter Account Types"
              className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                isFilterOpen || selectedType !== 'All'
                  ? 'bg-[#222] border-red-600/80 text-white font-bold'
                  : 'bg-[#0a0a0a] border-[#222] text-[#aaa] hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-red-500" />
              {selectedType !== 'All' && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5" />
              )}
            </button>

            {/* Filter Dropdown Popup (ALL, BANK, CARD, UPI inside filter icon) */}
            {isFilterOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-[#111] border border-[#333] rounded-xl shadow-xl z-50 py-1 font-mono text-xs">
                {['All', 'Bank', 'Credit Card', 'Wallet/UPI'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setSelectedType(type);
                      setIsFilterOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors cursor-pointer text-[11px] ${
                      selectedType === type
                        ? 'bg-red-950/80 text-red-400 font-bold'
                        : 'text-[#aaa] hover:bg-[#222] hover:text-white'
                    }`}
                  >
                    <span>{type === 'All' ? 'ALL' : type === 'Credit Card' ? 'CARD' : type === 'Wallet/UPI' ? 'UPI' : type.toUpperCase()}</span>
                    {selectedType === type && <Check className="w-3 h-3 text-red-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Three-Dot Menu Button (Contains ADD ACCOUNT option) */}
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
              <div className="absolute right-0 mt-1 w-40 bg-[#111] border border-[#333] rounded-xl shadow-xl z-50 py-1 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenAdd();
                    setShowThreeDotMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-[#eee] hover:bg-[#222] hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-red-500" />
                  <span>Add Account</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== REALISTIC CREDIT CARDS SECTION (COLLAPSIBLE STACK LIKE FINANCIAL METRICS) ==================== */}
      {(selectedType === 'All' || selectedType === 'Credit Card') && creditCards.length > 0 && (
        <div className="space-y-2">
          {/* Section Header with Collapsible Toggle */}
          <div className="flex items-center justify-between text-xs font-mono text-[#888]">
            <div className="flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-red-500" />
              <span className="uppercase font-bold tracking-wider text-white">CREDIT CARDS</span>
            </div>

            {creditCards.length > 1 && (
              <button
                type="button"
                onClick={() => setIsCardsStacked(!isCardsStacked)}
                className="p-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] hover:border-red-500 rounded-lg text-white transition-colors cursor-pointer flex items-center justify-center shadow-sm"
                title={isCardsStacked ? "Expand Cards" : "Stack Cards"}
              >
                {isCardsStacked ? (
                  <ChevronDown className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5 text-red-400" />
                )}
              </button>
            )}
          </div>

          {/* Cards Vertical Stack / Grid Container */}
          <div
            onTouchStart={handleCardTouchStart}
            onTouchEnd={handleCardTouchEnd}
            className={`transition-all duration-300 ease-in-out ${
              isCardsStacked
                ? 'space-y-[-115px] sm:space-y-[-120px] pt-1 pb-3 max-w-md mx-auto relative'
                : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            }`}
          >
            {creditCards.map((card, idx) => {
              const themeClasses = getCardThemeClasses(card.cardColorTheme, true);
              const isSilver = card.cardColorTheme === 'silver' || !card.cardColorTheme;
              const textColor = isSilver ? 'text-slate-950' : 'text-white';
              const subTextColor = isSilver ? 'text-slate-700' : 'text-[#bbb]';

              return (
                <div
                  key={card.id}
                  onClick={() => {
                    setSelectedAccountId(card.id);
                    if (isCardsStacked) setIsCardsStacked(false);
                  }}
                  style={isCardsStacked ? { zIndex: creditCards.length - idx } : undefined}
                  className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between h-[168px] sm:h-[180px] max-w-[330px] w-full mx-auto ${themeClasses} ${
                    isCardsStacked
                      ? 'shadow-[0_12px_30px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                      : 'hover:border-white/40 shadow-xl'
                  }`}
                >
                  {/* Metallic Shine */}
                  <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full blur-xl pointer-events-none" />

                  {/* Top Header */}
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black uppercase tracking-wider ${textColor}`}>
                        {card.bankName}
                      </span>
                      <span className={`text-[10px] font-bold opacity-80 ${subTextColor}`}>
                        {card.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(card, e);
                        }}
                        className={`p-1 rounded bg-black/20 hover:bg-black/40 ${textColor} transition-colors`}
                        title="Edit Card"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                        isSilver ? 'border-slate-800 text-slate-950' : 'border-white/30 text-white'
                      }`}>
                        {card.cardNetwork || 'VISA'}
                      </span>
                    </div>
                  </div>

                  {/* Middle Card Number & Chip */}
                  <div className="my-1 relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-4 bg-amber-400/80 rounded border border-amber-300 flex items-center justify-center shadow-inner">
                        <div className="w-3 h-1.5 border-t border-b border-amber-600/60" />
                      </div>
                      <span className={`text-xs font-mono tracking-[0.2em] font-bold ${textColor}`}>
                        •••• {card.accountNumberLast4}
                      </span>
                    </div>

                    {card.dueDate && (
                      <div className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                        isSilver ? 'bg-slate-900/10 border-slate-900/30 text-slate-950' : 'bg-red-950/80 border-red-500/40 text-red-400'
                      }`}>
                        DUE: {card.dueDate}
                      </div>
                    )}
                  </div>

                  {/* Credit Limit utilization progress bar */}
                  {card.creditLimit && card.creditLimit > 0 && (
                    <div className="my-0.5 relative z-10 space-y-0.5">
                      <div className="flex justify-between text-[8px] font-mono opacity-80">
                        <span className={subTextColor}>UTILIZATION</span>
                        <span className={`font-bold ${textColor}`}>
                          {Math.round((card.balance / card.creditLimit) * 100)}% ({currencySymbol}{card.balance.toLocaleString('en-IN')})
                        </span>
                      </div>
                      <div className="w-full h-1 bg-black/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.round((card.balance / card.creditLimit) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Card Bottom Info */}
                  <div className="pt-1.5 border-t border-black/10 relative z-10 flex items-end justify-between text-[10px]">
                    <div>
                      <div className={`text-[8px] uppercase ${subTextColor}`}>HOLDER</div>
                      <div className={`font-bold uppercase tracking-wider ${textColor}`}>
                        {card.cardHolderName || 'sgrnboff'}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-[8px] uppercase ${subTextColor}`}>APPROX BILL</div>
                      <div className={`text-xs font-mono font-black ${textColor}`}>
                        {currencySymbol}{(card.approxMonthlyBill || card.balance).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI Overview Summary Bar - Stackable or Side-by-Side in 1 Row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-[#888]">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-red-500" />
            <span className="uppercase font-bold tracking-wider text-white">ACCOUNT SUMMARY KPIs</span>
          </div>
          <button
            type="button"
            onClick={() => setIsKpiStacked(!isKpiStacked)}
            className="p-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] hover:border-red-500 rounded-lg text-white cursor-pointer flex items-center justify-center shadow-sm"
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
          onTouchStart={handleKpiTouchStart}
          onTouchEnd={handleKpiTouchEnd}
          className={`${
            isKpiStacked
              ? 'space-y-[-50px] sm:space-y-[-54px] pt-1 pb-2 max-w-2xl mx-auto'
              : 'grid grid-cols-3 gap-1.5 sm:gap-3'
          }`}
        >
          {/* NET LIQUID BALANCE */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-2.5 sm:p-3.5 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-emerald-400 rounded-xl space-y-1 min-w-0 ${
              isKpiStacked
                ? 'z-30 shadow-[0_10px_25px_rgba(0,0,0,0.85)] cursor-pointer ring-1 ring-white/10'
                : 'shadow-md'
            }`}
          >
            <div className="text-[8px] sm:text-[9px] font-mono font-bold text-[#aaa] uppercase tracking-wider flex items-center justify-between">
              <span className="truncate">NET LIQUID</span>
              <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </div>
            <div className="text-xs sm:text-lg font-bold text-emerald-400 font-mono truncate">
              {currencySymbol}{totalLiquidAssets.toLocaleString('en-IN')}
            </div>
            <div className="text-[9px] sm:text-[10px] text-[#888] font-mono truncate">
              {bankAccounts.length} Banks + {wallets.length} Wallets
            </div>
          </div>

          {/* CREDIT CARD SPENT */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-2.5 sm:p-3.5 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-red-500 rounded-xl space-y-1 min-w-0 ${
              isKpiStacked
                ? 'z-20 scale-[0.98] shadow-[0_10px_25px_rgba(0,0,0,0.85)] cursor-pointer ring-1 ring-white/10'
                : 'shadow-md'
            }`}
          >
            <div className="text-[8px] sm:text-[9px] font-mono font-bold text-[#aaa] uppercase tracking-wider flex items-center justify-between">
              <span className="truncate">CARD SPENT</span>
              <CreditCard className="w-3.5 h-3.5 text-red-500 shrink-0" />
            </div>
            <div className="text-xs sm:text-lg font-bold text-red-500 font-mono truncate">
              {currencySymbol}{totalCreditCardSpent.toLocaleString('en-IN')}
            </div>
            <div className="text-[9px] sm:text-[10px] text-[#888] font-mono truncate">
              Across {creditCards.length} Cards
            </div>
          </div>

          {/* EST. MONTHLY BILLS */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-2.5 sm:p-3.5 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-amber-400 rounded-xl space-y-1 min-w-0 ${
              isKpiStacked
                ? 'z-10 scale-[0.96] shadow-[0_10px_25px_rgba(0,0,0,0.85)] cursor-pointer ring-1 ring-white/10'
                : 'shadow-md'
            }`}
          >
            <div className="text-[8px] sm:text-[9px] font-mono font-bold text-[#aaa] uppercase tracking-wider flex items-center justify-between">
              <span className="truncate">EST. BILLS</span>
              <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            </div>
            <div className="text-xs sm:text-lg font-bold text-amber-400 font-mono truncate">
              {currencySymbol}{totalApproxMonthlyBill.toLocaleString('en-IN')}
            </div>
            <div className="text-[9px] sm:text-[10px] text-[#888] font-mono truncate">Approx statement due</div>
          </div>
        </div>
      </div>

      {/* ==================== BANK ACCOUNTS & WALLETS ==================== */}
      {(selectedType === 'All' || selectedType === 'Bank' || selectedType === 'Wallet/UPI') && (
        <div className="space-y-4">
          <div className="text-xs font-bold text-[#888] uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-500" />
            <span>BANK ACCOUNTS & WALLETS</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAccounts
              .filter((a) => a.type !== 'Credit Card')
              .map((acc) => (
                <div
                  key={acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  className={`p-5 bg-[#111111] border rounded-2xl space-y-3 transition-all tactile-lift cursor-pointer hover:border-red-600/80 ${
                    selectedAccountId === acc.id ? 'border-red-600 bg-[#161616]' : 'border-[#222]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#1c1c1c] border border-[#333] flex items-center justify-center font-black text-sm text-red-500">
                        {acc.bankName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{acc.name}</div>
                        <div className="text-[10px] text-[#666] font-mono">
                          {acc.type} • A/C **{acc.accountNumberLast4}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleOpenEdit(acc, e)}
                        className="p-1.5 rounded-lg bg-[#1a1a1a] text-[#888] hover:text-white transition-all nav-lift"
                        title="Edit Account"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Are you sure you want to delete ${acc.name}?`)) {
                            onDeleteAccount(acc.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-[#1a1a1a] text-[#888] hover:text-red-400 transition-all nav-lift"
                        title="Delete Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#222] flex items-center justify-between">
                    <span className="text-[10px] text-[#666] uppercase">AVAILABLE BALANCE</span>
                    <span className="text-base font-bold font-mono text-emerald-400">
                      {currencySymbol}{acc.balance.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Selected Account Transactions Detail Panel */}
      {selectedAccountObj && (
        <div className="p-5 bg-[#111111] border border-[#222] rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-white uppercase flex items-center gap-2">
                <span>TRANSACTION LOGS FOR {selectedAccountObj.name}</span>
                <span className="text-[10px] text-red-400 font-mono">(**{selectedAccountObj.accountNumberLast4})</span>
              </h3>
              <p className="text-[10px] text-[#666]">
                Filtered payment records associated with this specific account
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedAccountId(null)}
              className="p-2 rounded-xl bg-[#1c1c1c] text-[#888] hover:text-white transition-all nav-lift text-xs cursor-pointer"
            >
              Close Logs
            </button>
          </div>

          <div className="space-y-2">
            {accountTxns.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#666]">
                No recent transactions found for **{selectedAccountObj.accountNumberLast4}.
              </div>
            ) : (
              accountTxns.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3 bg-[#0a0a0a] border border-[#222] hover:border-[#333] hover:bg-[#121212] rounded-xl flex items-center justify-between text-xs transition-all tactile-lift cursor-pointer"
                >
                  <div>
                    <div className="font-bold text-white">{tx.title}</div>
                    <div className="text-[10px] text-[#666]">{tx.date} • {tx.category} • {tx.paymentMethod}</div>
                  </div>

                  <div className={`font-bold font-mono text-xs ${tx.type === 'debit' ? 'text-red-500' : 'text-emerald-400'}`}>
                    {tx.type === 'debit' ? '-' : '+'}{currencySymbol}{tx.amount.toLocaleString('en-IN')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-[#111111] border border-[#222] w-full max-w-lg rounded-3xl p-6 space-y-4 my-auto text-white">
            <div className="flex items-center justify-between border-b border-[#222] pb-3">
              <h3 className="text-sm font-bold text-white uppercase">
                {editingAcc ? 'EDIT FINANCIAL ACCOUNT' : 'ADD NEW ACCOUNT'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-xl bg-[#1c1c1c] text-[#888] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-[10px] text-[#777] uppercase mb-1">
                  ACCOUNT / CARD NICKNAME
                </label>
                <input
                  type="text"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="e.g. Kotak Mahindra Bank or ICICI Coral RuPay"
                  className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-white focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#777] uppercase mb-1">
                    BANK / ISSUER NAME
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Kotak, HDFC, ICICI, Axis"
                    className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-white focus:outline-none focus:border-red-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#777] uppercase mb-1">
                    ACCOUNT TYPE
                  </label>
                  <select
                    value={accType}
                    onChange={(e) => setAccType(e.target.value as AccountType)}
                    className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-white focus:outline-none focus:border-red-600"
                  >
                    <option value="Bank">Bank Account</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="Wallet/UPI">Wallet / UPI</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#777] uppercase mb-1">
                    LAST 4 DIGITS (SMS **4666 / CRED **0001)
                  </label>
                  <input
                    type="text"
                    value={last4}
                    onChange={(e) => setLast4(e.target.value)}
                    placeholder="4666 or 0001"
                    maxLength={4}
                    className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-white focus:outline-none focus:border-red-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#777] uppercase mb-1">
                    {accType === 'Credit Card' ? 'CURRENT USED BALANCE' : 'AVAILABLE BALANCE'}
                  </label>
                  <input
                    type="number"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    placeholder="185420"
                    className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-white focus:outline-none focus:border-red-600"
                    required
                  />
                </div>
              </div>

              {accType === 'Credit Card' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-[#777] uppercase mb-1">
                        CREDIT LIMIT
                      </label>
                      <input
                        type="number"
                        value={creditLimit}
                        onChange={(e) => setCreditLimit(e.target.value)}
                        placeholder="300000"
                        className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-white focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-[#777] uppercase mb-1">
                        ESTIMATED MONTHLY BILL
                      </label>
                      <input
                        type="number"
                        value={approxMonthlyBill}
                        onChange={(e) => setApproxMonthlyBill(e.target.value)}
                        placeholder="28450"
                        className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-white focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] text-[#777] uppercase mb-1">
                        CARD NETWORK
                      </label>
                      <select
                        value={cardNetwork}
                        onChange={(e) => setCardNetwork(e.target.value as any)}
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-white focus:outline-none focus:border-red-600"
                      >
                        <option value="Visa">Visa</option>
                        <option value="Mastercard">Mastercard</option>
                        <option value="RuPay">RuPay</option>
                        <option value="Amex">Amex</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-[#777] uppercase mb-1">
                        VISUAL THEME
                      </label>
                      <select
                        value={cardTheme}
                        onChange={(e) => setCardTheme(e.target.value as any)}
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-white focus:outline-none focus:border-red-600"
                      >
                        <option value="silver">Silver Titanium</option>
                        <option value="dark">Obsidian Dark</option>
                        <option value="emerald">Emerald Green</option>
                        <option value="midnight">Midnight Navy</option>
                        <option value="gold">Warm Gold</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-[#777] uppercase mb-1">
                        DUE DATE
                      </label>
                      <input
                        type="text"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        placeholder="15th Aug"
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-white focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-[#1c1c1c] text-[#888] rounded-xl hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl"
                >
                  {editingAcc ? 'Update Account' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
