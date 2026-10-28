import { useMoneyFormatter } from '../hooks/useMoneyFormatter';
import { useReducedMotion } from '../hooks/useReducedMotion';
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { InvestmentRecord, InvestmentType, Transaction, UserSettings } from '../types/finance';
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
  MoreVertical,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  AlertTriangle
} from 'lucide-react';
import { EmptyState } from './EmptyState';
import { InfoButton } from './InfoButton';
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
import { InvestmentRedemptionModal } from './InvestmentRedemptionModal';
import { InvestmentRedemption, FinancialAccount } from '../types/finance';
import { fetchStockPrice, fetchMutualFundNav } from '../services/marketDataService';
import { calculateFixedDeposit, roundCurrency, type FdCalculationResult } from '../services/financialCalculations';
import { parseNumberInput, parsePositiveAmount } from '../utils/numberInput';
import { RefreshCw, CheckCircle2, History, ShieldAlert, Building2, Sparkles } from 'lucide-react';
import { StockSelector } from './StockSelector';
import { DematManagerModal } from './DematManagerModal';
import { StockItem } from '../services/stocksDatabase';
import { newId } from '../utils/ids';
import { todayLocalISO, currentMonthLocal, addMonthsClamped, parseLocalDate } from '../utils/dates';

interface InvestmentsViewProps {
  investments: InvestmentRecord[];
  transactions?: Transaction[];
  accounts?: FinancialAccount[];
  onAddInvestment: (inv: InvestmentRecord, accountId?: string, recordInLedger?: boolean) => void;
  onUpdateInvestment?: (inv: InvestmentRecord) => void;
  onDeleteInvestment?: (id: string) => void;
  onEditTransaction?: (tx: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  onConfirmRedemption?: (
    investmentId: string,
    redemption: InvestmentRedemption,
    updatedInvestment: InvestmentRecord,
    creditedAccountId: string,
    netProceeds: number
  ) => void;
  currencySymbol: string;
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
}

interface InvestmentTxn {
  id: string;
  date: string;
  category: string;
  account: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
}

const PALETTE = ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

function isQuoteLive(inv: InvestmentRecord): boolean {
  const isLiveSource = inv.priceSource === 'NSE/BSE (Live)' || inv.priceSource === 'AMFI';
  const tsStr = inv.priceTimestamp || inv.navDate;
  if (!isLiveSource || !tsStr) return false;
  const ts = new Date(tsStr).getTime();
  if (isNaN(ts)) return false;
  const diffMs = Math.abs(Date.now() - ts);
  return diffMs < 24 * 60 * 60 * 1000;
}

export const InvestmentsView: React.FC<InvestmentsViewProps> = ({
  investments,
  transactions = [],
  accounts = [],
  onAddInvestment,
  onUpdateInvestment,
  onDeleteInvestment,
  onEditTransaction,
  onDeleteTransaction,
  onConfirmRedemption,
  currencySymbol,
  settings,
  onUpdateSettings,
}) => {
  const formatAmount = useMoneyFormatter();
  const reduceMotion = useReducedMotion();
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingInv, setEditingInv] = useState<InvestmentRecord | null>(null);
  const [redeemingInv, setRedeemingInv] = useState<InvestmentRecord | null>(null);
  const [activeViewTab, setActiveViewTab] = useState<'HOLDINGS' | 'REDEMPTIONS' | 'LEDGER'>('HOLDINGS');
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState<boolean>(false);
  const [quoteNotice, setQuoteNotice] = useState<string | null>(null);
  const [lastQuoteRefreshTime, setLastQuoteRefreshTime] = useState<string>(() => {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  // Deletion modal state
  const [txnToDelete, setTxnToDelete] = useState<InvestmentTxn | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; name: string; type: string; amount: number } | null>(null);
  const [doNotAskAgainChecked, setDoNotAskAgainChecked] = useState<boolean>(false);

  // Collapsible filter state
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState<boolean>(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [isKpiStacked, setIsKpiStacked] = useState<boolean>(true);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [showCurrentValue, setShowCurrentValue] = useState<boolean>(true);
  const [showInvestedCapital, setShowInvestedCapital] = useState<boolean>(true);
  const [showTotalProfit, setShowTotalProfit] = useState<boolean>(true);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - touchStartY;
    if (diffY > 25) {
      setIsKpiStacked(false);
    } else if (diffY < -25) {
      setIsKpiStacked(true);
    }
    setTouchStartY(null);
  };
  const [viewMode, setViewMode] = useState<'table' | 'detail'>('table');
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [selectedAccount, setSelectedAccount] = useState<string>('All Accounts');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedDemat, setSelectedDemat] = useState<string>('All');
  const [showDematManager, setShowDematManager] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Auto-refresh quotes on page load
  const hasAutoRefreshedOnMount = React.useRef<boolean>(false);
  useEffect(() => {
    if (!hasAutoRefreshedOnMount.current && investments.length > 0) {
      hasAutoRefreshedOnMount.current = true;
      handleRefreshMarketQuotes();
    }
  }, [investments.length]);

  // Global handler to prevent number inputs from changing value on scroll
  useEffect(() => {
    const handleWheelPrevent = (e: WheelEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement &&
        document.activeElement.type === 'number'
      ) {
        document.activeElement.blur();
      }
    };
    window.addEventListener('wheel', handleWheelPrevent, { passive: true });
    return () => window.removeEventListener('wheel', handleWheelPrevent);
  }, []);

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
  const [dematAccount, setDematAccount] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(todayLocalISO());
  
  // Asset specific inputs
  const [schemeCode, setSchemeCode] = useState<string>('');
  const [investmentPlan, setInvestmentPlan] = useState<'lump_sum' | 'sip'>('lump_sum');
  const [purchaseNav, setPurchaseNav] = useState<string>('');
  const [units, setUnits] = useState<string>('');
  const [exitLoadPercent, setExitLoadPercent] = useState<string>('0');
  
  const [stockSymbol, setStockSymbol] = useState<string>('');
  const [stockExchange, setStockExchange] = useState<'NSE' | 'BSE' | 'US'>('NSE');
  const [shares, setShares] = useState<string>('');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [brokerageFees, setBrokerageFees] = useState<string>('0');

  const [fdBankName, setFdBankName] = useState<string>('');
  const [fdInterestRate, setFdInterestRate] = useState<string>('7.25');
  const [fdTenureMonths, setFdTenureMonths] = useState<string>('12');
  const [fdCompounding, setFdCompounding] = useState<'quarterly' | 'monthly' | 'yearly' | 'simple'>('quarterly');
  const [fdPayout, setFdPayout] = useState<'at_maturity' | 'monthly' | 'quarterly'>('at_maturity');
  const [fdPrematurePenalty, setFdPrematurePenalty] = useState<string>('1.0');
  const [linkedAccountId, setLinkedAccountId] = useState<string>(accounts[0]?.id || '');
  const [recordInLedger, setRecordInLedger] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSearchingMf, setIsSearchingMf] = useState<boolean>(false);
  const [mfSearchResults, setMfSearchResults] = useState<Array<{ schemeCode: number; schemeName: string }>>([]);
  const [showMfSearchResults, setShowMfSearchResults] = useState<boolean>(false);

  const resetForm = () => {
    setEditingInv(null);
    setName('');
    setType('Mutual Funds');
    setAmountInvested('');
    setCurrentValue('');
    setNotes('');
    setDematAccount('');
    setPurchaseDate(todayLocalISO());
    setStockSymbol('');
    setStockExchange('NSE');
    setShares('');
    setPurchasePrice('');
    setBrokerageFees('0');
    setSchemeCode('');
    setInvestmentPlan('lump_sum');
    setPurchaseNav('');
    setUnits('');
    setExitLoadPercent('0');
    setFdBankName('');
    setFdInterestRate('7.25');
    setFdTenureMonths('12');
    setFdCompounding('quarterly');
    setFdPayout('at_maturity');
    setFdPrematurePenalty('1.0');
    setLinkedAccountId(accounts[0]?.id || '');
    setRecordInLedger(true);
    setFormError(null);
    setShowMfSearchResults(false);
    setMfSearchResults([]);
  };

  const handleSearchMfCode = async () => {
    const q = (name || schemeCode).trim();
    if (!q) {
      setFormError('Type a mutual fund name first to search for AMFI scheme code');
      return;
    }
    setFormError(null);
    setIsSearchingMf(true);
    setShowMfSearchResults(false);
    try {
      const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMfSearchResults(data.slice(0, 10));
          setShowMfSearchResults(true);
        } else {
          setFormError(`No schemes found matching "${q}". Enter code manually or try another keyword.`);
        }
      } else {
        setFormError('Failed to fetch scheme search results from AMFI.');
      }
    } catch {
      setFormError('Network error while searching AMFI scheme codes.');
    } finally {
      setIsSearchingMf(false);
    }
  };

  const handleSelectMfScheme = (item: { schemeCode: number; schemeName: string }) => {
    setSchemeCode(item.schemeCode.toString());
    setName(item.schemeName);
    setShowMfSearchResults(false);
    setFormError(null);
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedMonth !== 'All') count++;
    if (selectedCategory !== 'All Categories') count++;
    if (selectedAccount !== 'All Accounts') count++;
    if (selectedType !== 'All') count++;
    if (selectedDemat !== 'All') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedMonth, selectedCategory, selectedAccount, selectedType, selectedDemat, searchQuery]);

  // Derive investment transaction history dynamically from real transactions & investment records
  const investmentTransactions: InvestmentTxn[] = useMemo(() => {
    const fromTx: InvestmentTxn[] = transactions
      .filter((t) => {
        const cat = (t.category || '').toLowerCase();
        const sub = (t.subcategory || '').toLowerCase();
        const title = (t.title || '').toLowerCase();
        return (
          cat.includes('invest') ||
          cat.includes('sip') ||
          cat.includes('stock') ||
          cat.includes('fund') ||
          cat.includes('crypto') ||
          cat.includes('gold') ||
          sub.includes('invest') ||
          sub.includes('sip') ||
          title.includes('sip') ||
          title.includes('mutual') ||
          title.includes('groww') ||
          title.includes('zerodha') ||
          title.includes('coin')
        );
      })
      .map((t) => ({
        id: t.id,
        date: t.date,
        category: t.category || 'Investment',
        account: t.paymentMethod || t.source || 'Account',
        type: (t.type === 'credit' ? 'CREDIT' : 'DEBIT') as 'DEBIT' | 'CREDIT',
        amount: t.amount,
      }));

    if (fromTx.length > 0) {
      return fromTx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    // Fallback: derive transactions from investment records so the ledger is never blank if investments exist.
    // monthlyContributions are the dated pieces that make up amountInvested, so only the remainder
    // (if any) is emitted as an initial lump-sum row — otherwise the initial amount would be double-counted.
    const fromInv: InvestmentTxn[] = [];
    investments.forEach((inv) => {
      const contributions = inv.monthlyContributions || [];
      const contributed = contributions.reduce((sum, mc) => sum + (Number(mc.amount) || 0), 0);
      const initialRemainder = Math.round(((Number(inv.amountInvested) || 0) - contributed) * 100) / 100;

      if (contributions.length === 0 || initialRemainder > 0) {
        fromInv.push({
          id: `tx_${inv.id}_initial`,
          date: inv.date || todayLocalISO(),
          category: inv.name,
          account: inv.type,
          type: 'DEBIT',
          amount: contributions.length === 0 ? inv.amountInvested : initialRemainder,
        });
      }

      contributions.forEach((mc, idx) => {
        fromInv.push({
          id: `tx_${inv.id}_mc_${idx}`,
          date: `${mc.month}-01`,
          category: contributions.length > 1 || inv.investmentPlan === 'sip' ? `${inv.name} (SIP)` : inv.name,
          account: inv.type,
          type: 'DEBIT',
          amount: mc.amount,
        });
      });
    });

    return fromInv.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, investments]);

  // Unique categories and accounts for filter dropdowns
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    investmentTransactions.forEach((t) => set.add(t.category));
    investments.forEach((i) => set.add(i.type));
    return Array.from(set);
  }, [investmentTransactions, investments]);

  const availableAccounts = useMemo(() => {
    const set = new Set<string>();
    investmentTransactions.forEach((t) => set.add(t.account));
    return Array.from(set);
  }, [investmentTransactions]);

  // Filter transactions according to selected filters
  const filteredTxns = useMemo(() => {
    return investmentTransactions.filter((tx) => {
      if (selectedMonth !== 'All' && !tx.date.startsWith(selectedMonth)) return false;
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
  }, [investmentTransactions, selectedMonth, selectedCategory, selectedAccount, selectedType, searchQuery]);

  // Calculations for summary KPI
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

  const totalInvestmentAmount = Math.round((totalDebit - totalCredit) * 100) / 100;

  // Dynamic Trend data for Line Chart
  const trendData = useMemo(() => {
    if (filteredTxns.length === 0) {
      return [
        { date: 'Start', amount: 0 },
        { date: 'Current', amount: 0 },
      ];
    }

    const sortedAsc = [...filteredTxns].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let runningTotal = 0;
    const points: { date: string; amount: number }[] = [];

    sortedAsc.forEach((tx) => {
      runningTotal += tx.type === 'DEBIT' ? tx.amount : -tx.amount;
      const d = new Date(tx.date);
      const dateLabel = isNaN(d.getTime())
        ? tx.date
        : d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      points.push({ date: dateLabel, amount: Math.max(0, Math.round(runningTotal * 100) / 100) });
    });

    return points;
  }, [filteredTxns]);

  // Dynamic Pie chart data by Category or Type
  const pieData = useMemo(() => {
    if (investments.length > 0) {
      const typeMap: { [key: string]: number } = {};
      investments.forEach((inv) => {
        typeMap[inv.type] = (typeMap[inv.type] || 0) + inv.currentValue;
      });
      return Object.entries(typeMap).map(([name, value], idx) => ({
        name,
        value: Math.round(value * 100) / 100,
        color: PALETTE[idx % PALETTE.length],
      }));
    }

    if (filteredTxns.length > 0) {
      const catMap: { [key: string]: number } = {};
      filteredTxns.forEach((tx) => {
        catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
      });
      return Object.entries(catMap).map(([name, value], idx) => ({
        name,
        value: Math.round(value * 100) / 100,
        color: PALETTE[idx % PALETTE.length],
      }));
    }

    return [{ name: 'No Assets', value: 1, color: '#333' }];
  }, [investments, filteredTxns]);

  // Overall Portfolio calculations
  const totalInvestedCapital = Math.round(investments.reduce((sum, i) => sum + i.amountInvested, 0) * 100) / 100;
  const totalCurrentValue = Math.round(investments.reduce((sum, i) => sum + i.currentValue, 0) * 100) / 100;
  const totalProfit = Math.round((totalCurrentValue - totalInvestedCapital) * 100) / 100;
  const overallReturnPercent =
    totalInvestedCapital > 0
      ? (((totalCurrentValue - totalInvestedCapital) / totalInvestedCapital) * 100).toFixed(2)
      : '0.00';

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const d = parseLocalDate(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  };

  const handleOpenEditModal = (inv: InvestmentRecord) => {
    resetForm();
    setEditingInv(inv);
    setName(inv.name || '');
    setType(inv.type);
    setAmountInvested(inv.amountInvested !== undefined ? inv.amountInvested.toString() : '');
    setCurrentValue(inv.currentValue !== undefined ? inv.currentValue.toString() : '');
    setNotes(inv.notes || '');
    setDematAccount(inv.dematAccount || '');
    setPurchaseDate(inv.date || inv.depositDate || todayLocalISO());

    // Stocks
    if (inv.symbol) setStockSymbol(inv.symbol);
    if (inv.exchange && (inv.exchange === 'NSE' || inv.exchange === 'BSE' || inv.exchange === 'US')) {
      setStockExchange(inv.exchange);
    }
    if (inv.shares !== undefined) setShares(inv.shares.toString());
    if (inv.purchasePrice !== undefined) setPurchasePrice(inv.purchasePrice.toString());
    if (inv.brokerageFees !== undefined) setBrokerageFees(inv.brokerageFees.toString());

    // Mutual Funds
    if (inv.schemeCode) setSchemeCode(inv.schemeCode);
    if (inv.investmentPlan) setInvestmentPlan(inv.investmentPlan);
    if (inv.purchaseNav !== undefined) setPurchaseNav(inv.purchaseNav.toString());
    if (inv.units !== undefined) setUnits(inv.units.toString());
    if (inv.exitLoadPercent !== undefined) setExitLoadPercent(inv.exitLoadPercent.toString());

    // Fixed Deposit
    if (inv.bankName) setFdBankName(inv.bankName);
    if (inv.interestRate !== undefined) setFdInterestRate(inv.interestRate.toString());
    if (inv.tenureMonths !== undefined) setFdTenureMonths(inv.tenureMonths.toString());
    if (inv.compoundingFrequency) setFdCompounding(inv.compoundingFrequency);
    if (inv.payoutFrequency) setFdPayout(inv.payoutFrequency);
    if (inv.prematurePenaltyPercent !== undefined) setFdPrematurePenalty(inv.prematurePenaltyPercent.toString());

    if (inv.linkedAccountId) setLinkedAccountId(inv.linkedAccountId);

    setShowAddModal(true);
  };

  // Filter investments according to Demat account, Type, and Search query
  const filteredInvestments = useMemo(() => {
    return investments.filter((inv) => {
      if (selectedDemat !== 'All' && (inv.dematAccount || 'Unassigned') !== selectedDemat) return false;
      if (selectedType !== 'All' && inv.type !== selectedType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = inv.name.toLowerCase().includes(q);
        const matchSym = inv.symbol?.toLowerCase().includes(q);
        const matchType = inv.type.toLowerCase().includes(q);
        const matchBroker = inv.dematAccount?.toLowerCase().includes(q);
        if (!matchName && !matchSym && !matchType && !matchBroker) return false;
      }
      return true;
    });
  }, [investments, selectedDemat, selectedType, searchQuery]);

  // Collect all historical redemptions across all investments
  const allRedemptions = useMemo(() => {
    const list: InvestmentRedemption[] = [];
    investments.forEach((inv) => {
      if (inv.redemptions && inv.redemptions.length > 0) {
        inv.redemptions.forEach((r) => {
          list.push({
            ...r,
            notes: r.notes || inv.name,
          });
        });
      }
    });
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [investments]);

  const totalRealizedGain = useMemo(() => {
    return roundCurrency(
      investments.reduce((sum, i) => sum + (i.realizedProfitLoss || 0), 0)
    );
  }, [investments]);

  const handleRefreshMarketQuotes = async () => {
    setIsRefreshingQuotes(true);
    let skippedCount = 0;
    try {
      for (const inv of investments) {
        if (inv.type === 'Stocks') {
          const sym = inv.symbol || inv.name;
          if (!sym) {
            skippedCount++;
            continue;
          }
          const quote = await fetchStockPrice(sym);
          if (quote && quote.status === 'live' && quote.currentPrice > 0) {
            const sh = inv.shares || (inv.amountInvested / (inv.purchasePrice || quote.currentPrice || 100));
            const newCurVal = roundCurrency(sh * quote.currentPrice);
            const returnPct = inv.amountInvested > 0
              ? roundCurrency(((newCurVal - inv.amountInvested) / inv.amountInvested) * 100)
              : 0;
            onUpdateInvestment?.({
              ...inv,
              symbol: inv.symbol || quote.symbol,
              currentPrice: quote.currentPrice,
              currentValue: newCurVal,
              returnsPercent: returnPct,
              priceTimestamp: quote.lastUpdated,
              priceSource: quote.source,
            });
          } else {
            skippedCount++;
          }
        } else if (inv.type === 'Mutual Funds') {
          const code = (inv.schemeCode || '').trim();
          if (/^\d{5,6}$/.test(code)) {
            const quote = await fetchMutualFundNav(code);
            if (quote && quote.status === 'live' && quote.currentPrice > 0) {
              const u = inv.units || (inv.amountInvested / (inv.purchaseNav || 100));
              const newCurVal = roundCurrency(u * quote.currentPrice);
              const returnPct = inv.amountInvested > 0
                ? roundCurrency(((newCurVal - inv.amountInvested) / inv.amountInvested) * 100)
                : 0;
              onUpdateInvestment?.({
                ...inv,
                currentNav: quote.currentPrice,
                currentValue: newCurVal,
                returnsPercent: returnPct,
                navDate: quote.lastUpdated.slice(0, 10),
                priceSource: 'AMFI',
                priceTimestamp: quote.lastUpdated,
              });
            } else {
              skippedCount++;
            }
          } else {
            skippedCount++;
          }
        }
      }

      if (skippedCount > 0) {
        setQuoteNotice('Live quotes unavailable — showing your last saved values');
      } else {
        setQuoteNotice(null);
      }

      setLastQuoteRefreshTime(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } catch {
      setQuoteNotice('Live quotes unavailable — showing your last saved values');
    } finally {
      setIsRefreshingQuotes(false);
    }
  };

  const handleSaveInvestment = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const invParse = parsePositiveAmount(amountInvested, 'Amount invested');
    if (invParse.ok === false) {
      setFormError(invParse.error);
      return;
    }
    const valParse = parseNumberInput(currentValue, { label: 'Current value', min: 0, allowEmpty: true });
    if (valParse.ok === false) {
      setFormError(valParse.error);
      return;
    }
    let numInv = invParse.value as number;
    let numVal = valParse.ok ? valParse.value ?? 0 : 0;
    let fdCalc: FdCalculationResult | null = null;

    let calculatedUnits = units.trim() ? parseFloat(units) : 0;
    let calculatedShares = shares.trim() ? parseFloat(shares) : 0;
    let pNav = purchaseNav.trim() ? parseFloat(purchaseNav) : 0;
    let cNav = pNav;
    let pPrice = purchasePrice.trim() ? parseFloat(purchasePrice) : 0;
    let cPrice = pPrice;

    if (type === 'Mutual Funds') {
      const isEditing = Boolean(editingInv);
      const isAmountChanged = isEditing && numInv !== editingInv!.amountInvested;
      const isNavChanged = isEditing && purchaseNav.trim() !== '' && pNav !== (editingInv!.purchaseNav ?? 0);
      const isUnitsChanged = isEditing && units.trim() !== '' && calculatedUnits !== (editingInv!.units ?? 0);
      const isMfHoldingsChanged = !isEditing || isAmountChanged || isNavChanged || isUnitsChanged;

      if (!isMfHoldingsChanged && editingInv) {
        // Keep existing holdings values completely intact
        calculatedUnits = editingInv.units ?? calculatedUnits;
        pNav = editingInv.purchaseNav ?? pNav;
        cNav = editingInv.currentNav ?? pNav;
        if (numVal <= 0) {
          numVal = editingInv.currentValue ?? roundCurrency(calculatedUnits * cNav);
        }
      } else {
        if (pNav <= 0 && editingInv?.purchaseNav) {
          pNav = editingInv.purchaseNav;
        }

        if (calculatedUnits <= 0 && numInv > 0) {
          if (pNav <= 0) {
            setFormError('Please enter a valid Purchase NAV');
            return;
          }
          calculatedUnits = roundCurrency(numInv / pNav);
        } else if (numInv <= 0 && calculatedUnits > 0) {
          if (pNav <= 0) {
            setFormError('Please enter a valid Purchase NAV');
            return;
          }
          numInv = roundCurrency(calculatedUnits * pNav);
        }

        if (numInv <= 0 && calculatedUnits <= 0) {
          setFormError('Please enter an investment amount or units held');
          return;
        }

        if (numVal <= 0 && calculatedUnits > 0) {
          cNav = editingInv?.currentNav && !isNavChanged ? editingInv.currentNav : pNav;
          numVal = roundCurrency(calculatedUnits * cNav);
        } else if (numVal > 0 && calculatedUnits > 0) {
          cNav = roundCurrency(numVal / calculatedUnits);
        }
      }
    } else if (type === 'Stocks') {
      const isEditing = Boolean(editingInv);
      const isAmountChanged = isEditing && numInv !== editingInv!.amountInvested;
      const isPriceChanged = isEditing && purchasePrice.trim() !== '' && pPrice !== (editingInv!.purchasePrice ?? 0);
      const isSharesChanged = isEditing && shares.trim() !== '' && calculatedShares !== (editingInv!.shares ?? 0);
      const isStockHoldingsChanged = !isEditing || isAmountChanged || isPriceChanged || isSharesChanged;

      const fees = parseFloat(brokerageFees) || 0;

      if (!isStockHoldingsChanged && editingInv) {
        // Keep existing stock holdings values intact
        calculatedShares = editingInv.shares ?? calculatedShares;
        pPrice = editingInv.purchasePrice ?? pPrice;
        cPrice = editingInv.currentPrice ?? pPrice;
        if (numVal <= 0) {
          numVal = editingInv.currentValue ?? roundCurrency(calculatedShares * cPrice);
        }
      } else {
        if (pPrice <= 0 && editingInv?.purchasePrice) {
          pPrice = editingInv.purchasePrice;
        }

        if (calculatedShares <= 0 && numInv > 0) {
          if (pPrice <= 0) {
            setFormError('Please enter a valid Buy Price per share');
            return;
          }
          calculatedShares = Math.floor(numInv / pPrice);
        } else if (numInv <= 0 && calculatedShares > 0) {
          if (pPrice <= 0) {
            setFormError('Please enter a valid Buy Price per share');
            return;
          }
          numInv = roundCurrency(calculatedShares * pPrice + fees);
        }

        if (numInv <= 0 && calculatedShares <= 0) {
          setFormError('Please enter an investment amount or number of shares');
          return;
        }

        if (numVal <= 0 && calculatedShares > 0) {
          cPrice = editingInv?.currentPrice && !isPriceChanged ? editingInv.currentPrice : pPrice;
          numVal = roundCurrency(calculatedShares * cPrice);
        } else if (numVal > 0 && calculatedShares > 0) {
          cPrice = roundCurrency(numVal / calculatedShares);
        }
      }
    } else if (type === 'Fixed Deposit') {
      const rateParse = parseNumberInput(fdInterestRate, { label: 'Interest rate', min: 0, max: 100 });
      const tenureParse = parseNumberInput(fdTenureMonths, { label: 'Tenure (months)', min: 1, integer: true });
      const penaltyParse = parseNumberInput(fdPrematurePenalty, { label: 'Premature penalty', min: 0, max: 100, allowEmpty: true });
      const fdInputError = [rateParse, tenureParse, penaltyParse].find((r) => r.ok === false) as { ok: false; error: string } | undefined;
      if (fdInputError) {
        setFormError(fdInputError.error);
        return;
      }
      const fdRate = rateParse.ok ? (rateParse.value as number) : 0;
      const fdTenure = tenureParse.ok ? (tenureParse.value as number) : 0;
      const penalty = penaltyParse.ok ? penaltyParse.value ?? 0 : 0;
      fdCalc = calculateFixedDeposit({
        principal: numInv,
        annualInterestRate: fdRate,
        depositDate: purchaseDate,
        tenureMonths: fdTenure,
        compoundingFrequency: fdCompounding,
        payoutFrequency: fdPayout,
        prematurePenaltyPercent: penalty,
      });
      if (!fdCalc.isValid) {
        setFormError(fdCalc.validationError || 'Fixed deposit details are invalid.');
        return;
      }
      if (numVal <= 0 || !editingInv || numInv !== editingInv.amountInvested) {
        numVal = roundCurrency(numInv + fdCalc.accruedInterestToDate);
      }
    }

    if (numInv <= 0) {
      setFormError('Please enter a valid investment amount');
      return;
    }

    if (numVal <= 0) {
      numVal = numInv;
    }

    const returnPct = numInv > 0 ? parseFloat((((numVal - numInv) / numInv) * 100).toFixed(2)) : 0;

    if (editingInv && onUpdateInvestment) {
      onUpdateInvestment({
        ...editingInv,
        name: name.trim() || 'Investment',
        type,
        amountInvested: numInv,
        currentValue: numVal,
        returnsPercent: returnPct,
        date: purchaseDate,
        notes: notes.trim(),
        dematAccount: (type === 'Stocks' || type === 'Mutual Funds') && dematAccount ? dematAccount : undefined,
        linkedAccountId: linkedAccountId || undefined,
        // MF fields
        schemeCode: type === 'Mutual Funds' ? (schemeCode.trim() || undefined) : editingInv.schemeCode,
        investmentPlan: type === 'Mutual Funds' ? investmentPlan : editingInv.investmentPlan,
        purchaseNav: type === 'Mutual Funds' ? pNav : editingInv.purchaseNav,
        currentNav: type === 'Mutual Funds' ? cNav : editingInv.currentNav,
        units: type === 'Mutual Funds' ? calculatedUnits : editingInv.units,
        exitLoadPercent: type === 'Mutual Funds' ? (parseFloat(exitLoadPercent) || 0) : editingInv.exitLoadPercent,
        // Stocks fields
        symbol: type === 'Stocks' ? (stockSymbol.trim().toUpperCase() || undefined) : editingInv.symbol,
        exchange: type === 'Stocks' ? stockExchange : editingInv.exchange,
        shares: type === 'Stocks' ? calculatedShares : editingInv.shares,
        purchasePrice: type === 'Stocks' ? pPrice : editingInv.purchasePrice,
        currentPrice: type === 'Stocks' ? cPrice : editingInv.currentPrice,
        brokerageFees: type === 'Stocks' ? (parseFloat(brokerageFees) || 0) : editingInv.brokerageFees,
        // FD fields (recomputed from the engine so edits to rate/tenure/payout refresh maturity & accrual)
        bankName: type === 'Fixed Deposit' ? fdBankName : editingInv.bankName,
        interestRate: type === 'Fixed Deposit' ? Number(fdInterestRate) : editingInv.interestRate,
        depositDate: type === 'Fixed Deposit' ? purchaseDate : editingInv.depositDate,
        maturityDate: type === 'Fixed Deposit' ? addMonthsClamped(purchaseDate, Number(fdTenureMonths)) : editingInv.maturityDate,
        maturityAmount: type === 'Fixed Deposit' && fdCalc ? fdCalc.totalMaturityAmount : editingInv.maturityAmount,
        accruedInterest: type === 'Fixed Deposit' && fdCalc ? fdCalc.accruedInterestToDate : editingInv.accruedInterest,
        tenureMonths: type === 'Fixed Deposit' ? Number(fdTenureMonths) : editingInv.tenureMonths,
        compoundingFrequency: type === 'Fixed Deposit' ? fdCompounding : editingInv.compoundingFrequency,
        payoutFrequency: type === 'Fixed Deposit' ? fdPayout : editingInv.payoutFrequency,
        prematurePenaltyPercent: type === 'Fixed Deposit' ? (Number(fdPrematurePenalty) || 0) : editingInv.prematurePenaltyPercent,
      });
    } else {
      const fdTenure = Number(fdTenureMonths) || 0;
      const penalty = Number(fdPrematurePenalty) || 0;

      const newInv: InvestmentRecord = {
        id: newId('inv'),
        name: name.trim() || (type === 'Stocks' ? stockSymbol : 'New Investment'),
        type,
        amountInvested: numInv,
        currentValue: numVal,
        returnsPercent: returnPct,
        date: purchaseDate,
        status: 'active',
        linkedAccountId: linkedAccountId || undefined,
        dematAccount: (type === 'Stocks' || type === 'Mutual Funds') && dematAccount ? dematAccount : undefined,
        monthlyContributions: [
          { month: (purchaseDate || todayLocalISO()).slice(0, 7), amount: numInv },
        ],
        notes: notes.trim(),
        // MF fields
        schemeCode: type === 'Mutual Funds' ? (schemeCode.trim() || undefined) : undefined,
        investmentPlan: type === 'Mutual Funds' ? investmentPlan : undefined,
        purchaseNav: type === 'Mutual Funds' ? pNav : undefined,
        currentNav: type === 'Mutual Funds' ? cNav : undefined,
        units: type === 'Mutual Funds' ? calculatedUnits : undefined,
        exitLoadPercent: type === 'Mutual Funds' ? (parseFloat(exitLoadPercent) || 0) : undefined,
        // Stocks fields
        symbol: type === 'Stocks' ? stockSymbol.trim().toUpperCase() : undefined,
        exchange: type === 'Stocks' ? stockExchange : undefined,
        shares: type === 'Stocks' ? calculatedShares : undefined,
        purchasePrice: type === 'Stocks' ? pPrice : undefined,
        currentPrice: type === 'Stocks' ? cPrice : undefined,
        brokerageFees: type === 'Stocks' ? (parseFloat(brokerageFees) || 0) : undefined,
        lots: type === 'Stocks' ? [{ id: 'lot_1', date: purchaseDate, shares: calculatedShares, purchasePrice: pPrice, brokerageFees: parseFloat(brokerageFees) || 0 }] : undefined,
        // FD fields
        bankName: type === 'Fixed Deposit' ? fdBankName : undefined,
        interestRate: type === 'Fixed Deposit' ? Number(fdInterestRate) : undefined,
        depositDate: type === 'Fixed Deposit' ? purchaseDate : undefined,
        maturityDate: type === 'Fixed Deposit' ? addMonthsClamped(purchaseDate, fdTenure) : undefined,
        maturityAmount: type === 'Fixed Deposit' && fdCalc ? fdCalc.totalMaturityAmount : undefined,
        accruedInterest: type === 'Fixed Deposit' && fdCalc ? fdCalc.accruedInterestToDate : undefined,
        tenureMonths: type === 'Fixed Deposit' ? fdTenure : undefined,
        compoundingFrequency: type === 'Fixed Deposit' ? fdCompounding : undefined,
        payoutFrequency: type === 'Fixed Deposit' ? fdPayout : undefined,
        prematurePenaltyPercent: type === 'Fixed Deposit' ? penalty : undefined,
      };
      onAddInvestment(newInv, linkedAccountId || undefined, recordInLedger);
    }

    resetForm();
    setShowAddModal(false);
  };

  const handleDeleteInv = (id: string, name: string, type: string, amount: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (settings.skipInvestmentDeleteConfirmation) {
      onDeleteInvestment?.(id);
    } else {
      setAssetToDelete({ id, name, type, amount });
      setDoNotAskAgainChecked(false);
    }
  };

  const handleConfirmDeleteAsset = () => {
    if (!assetToDelete) return;
    if (doNotAskAgainChecked) {
      onUpdateSettings({
        ...settings,
        skipInvestmentDeleteConfirmation: true,
      });
    }
    onDeleteInvestment?.(assetToDelete.id);
    setAssetToDelete(null);
  };

  const handleEditTxn = (tx: InvestmentTxn) => {
    const realTx = transactions.find((t) => t.id === tx.id);
    if (realTx && onEditTransaction) {
      onEditTransaction(realTx);
      return;
    }
    const inv = investments.find((i) => tx.id.startsWith(`tx_${i.id}`) || i.id === tx.id || i.name === tx.category);
    if (inv) {
      handleOpenEditModal(inv);
      return;
    }
    if (onEditTransaction) {
      onEditTransaction({
        id: tx.id,
        date: tx.date,
        title: tx.category,
        amount: tx.amount,
        type: tx.type === 'CREDIT' ? 'credit' : 'debit',
        category: 'Investment',
        paymentMethod: tx.account,
        source: 'Manual',
      });
    }
  };

  const performDeleteTxn = (tx: InvestmentTxn) => {
    const realTx = transactions.find((t) => t.id === tx.id);
    if (realTx && onDeleteTransaction) {
      onDeleteTransaction(realTx.id);
      return;
    }
    const inv = investments.find((i) => tx.id.startsWith(`tx_${i.id}`) || i.id === tx.id || i.name === tx.category);
    if (inv && onDeleteInvestment) {
      onDeleteInvestment(inv.id);
      return;
    }
    if (onDeleteTransaction) {
      onDeleteTransaction(tx.id);
    }
  };

  const handleDeleteTxn = (tx: InvestmentTxn) => {
    if (settings.skipDeleteConfirmation) {
      performDeleteTxn(tx);
    } else {
      setTxnToDelete(tx);
      setDoNotAskAgainChecked(false);
    }
  };

  const handleConfirmDeleteTxn = () => {
    if (!txnToDelete) return;
    if (doNotAskAgainChecked) {
      onUpdateSettings({
        ...settings,
        skipDeleteConfirmation: true,
      });
    }
    performDeleteTxn(txnToDelete);
    setTxnToDelete(null);
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
              placeholder="Search investment transactions or accounts..."
              className="w-full bg-[#111111] border border-red-500/60 rounded-xl py-1.5 pl-8 pr-7 text-xs font-mono text-white placeholder-content-3 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <button
              type="button"
              onClick={() => {
                setIsSearchExpanded(false);
                setSearchQuery('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#777] hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* Standard Header Title */
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shrink-0" />
            <h1 className="text-sm font-bold tracking-wider uppercase text-white truncate">
              INVESTMENTS & SIPs
            </h1>
            <InfoButton
              id="investments-page-info"
              title="Investments & SIPs"
              content="Monitor stock holdings, mutual funds, crypto assets, fixed deposits, and recurring SIP investment trajectories."
              align="left"
            />
          </div>
        )}

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isSearchExpanded && (
            <button
              type="button"
              onClick={() => setIsSearchExpanded(true)}
              className="p-1.5 bg-[#111111] hover:bg-surface-3 border border-[#222] hover:border-[#444] rounded-lg text-[#aaa] hover:text-white transition-colors cursor-pointer"
              title="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Filter Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setIsFilterOpen(!isFilterOpen);
              setShowThreeDotMenu(false);
            }}
            className={`p-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
              isFilterOpen || activeFilterCount > 0
                ? 'bg-red-950/40 border-red-500 text-red-400'
                : 'bg-[#111111] hover:bg-surface-3 border-[#222] hover:border-[#444] text-[#aaa] hover:text-white'
            }`}
            title="Filter Investments"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Add Investment Button */}
          <button
            type="button"
            onClick={() => {
              setEditingInv(null);
              setName('');
              setAmountInvested('');
              setCurrentValue('');
              setNotes('');
              setShowAddModal(true);
            }}
            className="hidden sm:flex px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-mono font-bold items-center gap-1 transition-colors cursor-pointer"
            title="Add investment holding"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ADD</span>
          </button>
        </div>
      </div>

      {/* ==================== COLLAPSIBLE FILTER PANEL ==================== */}
      {isFilterOpen && (
        <div className="bg-[#111111] border border-[#222] p-4 rounded-2xl space-y-3 z-30 relative animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl">
          <div className="flex items-center justify-between text-xs font-mono text-[#888] pb-1 border-b border-[#222]">
            <span className="font-bold uppercase tracking-wider text-white">FILTER INVESTMENTS</span>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="text-[#666] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            <div>
              <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                MONTH / YEAR
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-2.5 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
              >
                <option value="All">All Months</option>
                <option value="2026-08">Aug 2026</option>
                <option value="2026-07">Jul 2026</option>
                <option value="2026-06">Jun 2026</option>
                <option value="2026-05">May 2026</option>
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                CATEGORY
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-2.5 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
              >
                <option value="All Categories">All Categories</option>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                DEMAT / BROKER
              </label>
              <select
                value={selectedDemat}
                onChange={(e) => setSelectedDemat(e.target.value)}
                className="w-full px-2.5 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
              >
                <option value="All">All Demat Accounts</option>
                <option value="Zerodha">Zerodha (Kite)</option>
                <option value="Dhan">Dhan</option>
                <option value="Groww">Groww</option>
                <option value="Upstox">Upstox</option>
                <option value="Angel One">Angel One</option>
                <option value="ICICI Direct">ICICI Direct</option>
                <option value="HDFC Sky">HDFC Sky</option>
                <option value="Kotak Neo">Kotak Neo</option>
                <option value="Other">Other / Physical</option>
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                ACCOUNT
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full px-2.5 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
              >
                <option value="All Accounts">All Accounts</option>
                {availableAccounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                TYPE
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-2.5 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
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
                  setSelectedMonth('All');
                  setSelectedCategory('All Categories');
                  setSelectedAccount('All Accounts');
                  setSelectedType('All');
                  setSelectedDemat('All');
                  setSearchQuery('');
                }}
                className="text-[10px] font-mono uppercase text-red-400 hover:underline cursor-pointer"
              >
                RESET FILTERS
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================== EMPTY STATE IF NO INVESTMENTS ==================== */}
      {investments.length === 0 && (
        <EmptyState
          icon={TrendingUp}
          title="No Investments Logged"
          description="Track your mutual funds, equities, crypto, and fixed deposits in real time."
          actionLabel="Add Investment"
          onAction={() => setShowAddModal(true)}
        />
      )}

      {/* ==================== PORTFOLIO SUMMARY & ASSETS ==================== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-[#888]">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-red-500" />
            <span className="uppercase font-bold tracking-wider text-white">PORTFOLIO SUMMARY & ASSETS</span>
            <InfoButton
              id="portfolio-summary-info"
              title="Portfolio Summary & Assets"
              content="Aggregated portfolio value, total capital deployed, and unrealized profit/loss metrics."
              align="left"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsKpiStacked(!isKpiStacked)}
            className="p-1 bg-[#1a1a1a] hover:bg-surface-3 border border-[#333] hover:border-red-500 rounded-lg text-white transition-colors cursor-pointer flex items-center justify-center shadow-sm"
            title={isKpiStacked ? "Expand Metrics" : "Collapse Metrics"}
          >
            {isKpiStacked ? (
              <ChevronDown className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-red-400" />
            )}
          </button>
        </div>

        {/* Vertical Stack / Expanded Container with Touch Swipe Support */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`transition-all duration-300 ease-in-out ${
            isKpiStacked
              ? 'kpi-stack space-y-[-50px] sm:space-y-[-54px] pt-1 pb-2 max-w-2xl mx-auto'
              : 'space-y-2.5 sm:space-y-3'
          }`}
        >
          {/* 1. CURRENT VALUE */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-emerald-500 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-30 shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-bold text-white tracking-wider">Current Value</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCurrentValue(!showCurrentValue);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showCurrentValue ? "Hide amount" : "Show amount"}
              >
                {showCurrentValue ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight">
                {showCurrentValue ? `${currencySymbol}${formatAmount(totalCurrentValue)}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-emerald-400 flex items-center gap-0.5 font-bold">
                <TrendingUp className="w-3 h-3" />
                <span>+{overallReturnPercent}% Returns</span>
              </div>
            </div>
          </div>

          {/* 2. CAPITAL INVESTED */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-cyan-400 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-20 scale-[0.98] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="font-bold text-white tracking-wider">Capital Invested</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInvestedCapital(!showInvestedCapital);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showInvestedCapital ? "Hide amount" : "Show amount"}
              >
                {showInvestedCapital ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-[#aaa] tracking-tight">
                {showInvestedCapital ? `${currencySymbol}${formatAmount(totalInvestedCapital)}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#aaa]">
                Net Principal
              </div>
            </div>
          </div>

          {/* 3. TOTAL PROFIT/LOSS */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-purple-400 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-10 scale-[0.96] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <PieIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="font-bold text-white tracking-wider">Total Profit/Loss</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTotalProfit(!showTotalProfit);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showTotalProfit ? "Hide amount" : "Show amount"}
              >
                {showTotalProfit ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className={`text-base sm:text-lg lg:text-xl font-bold tracking-tight ${
                totalProfit >= 0 ? 'text-emerald-400' : 'text-red-500'
              }`}>
                {showTotalProfit ? `${totalProfit >= 0 ? '+' : ''}${currencySymbol}${formatAmount(totalProfit)}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#aaa]">
                Unrealized Gain
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== CHARTS: TREND & ALLOCATION ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* OVER TIME Line Chart */}
        <div className="bg-[#111111] border border-[#222] p-4 sm:p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[#777] uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>CUMULATIVE INVESTMENT OVER TIME</span>
              <InfoButton
                id="inv-trend-info"
                title="Investment Trajectory"
                content="Tracks historical capital accumulation and net asset expansion over time."
                align="left"
              />
            </div>
            <span className="text-white">
              {currencySymbol}{formatAmount(totalInvestmentAmount)}
            </span>
          </div>

          <div className="h-48 sm:h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  stroke="#555"
                  tick={{ fontSize: 10, fill: '#777', fontFamily: 'monospace' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#555"
                  tick={{ fontSize: 10, fill: '#777', fontFamily: 'monospace' }}
                  tickLine={false}
                  tickFormatter={(v) => `${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '12px', fontSize: '11px', fontFamily: 'monospace' }}
                  formatter={(val: any) => [`${currencySymbol}${formatAmount(Number(val))}`, 'Cumulative']}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  isAnimationActive={!reduceMotion}
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
            <span>PORTFOLIO ALLOCATION</span>
            <InfoButton
              id="portfolio-alloc-info"
              title="Portfolio Allocation"
              content="Breakdown of your investments across asset classes, types, and sectors."
              align="left"
            />
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
                    isAnimationActive={!reduceMotion}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '12px', fontSize: '11px', fontFamily: 'monospace' }}
                    formatter={(val: any) => [`${currencySymbol}${formatAmount(Number(val))}`, 'Value']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend list */}
            <div className="w-full sm:w-1/2 space-y-2.5 overflow-y-auto max-h-48">
              {pieData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs font-mono bg-[#0a0a0a] p-2 rounded-xl border border-[#222]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[#ccc] truncate max-w-[110px]">{item.name}</span>
                  </div>
                  <span className="font-bold text-white shrink-0">
                    {currencySymbol}{formatAmount(item.value)}
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
          <div className="text-xs font-mono font-bold text-[#888] uppercase tracking-wider flex items-center gap-2">
            <span>INVESTMENT LEDGER TRANSACTIONS</span>
            <InfoButton
              id="inv-ledger-info"
              title="Investment Ledger"
              content="Chronological ledger of buy, sell, dividend, and contribution transactions with table and detail view options."
              align="left"
            />
          </div>

          <div className="flex items-center bg-[#111111] p-0.5 border border-[#222] rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1 px-2 rounded text-xs font-mono flex items-center gap-1 transition-all nav-lift cursor-pointer ${
                viewMode === 'table' ? 'bg-[#222] text-white font-bold shadow-sm' : 'text-[#777] hover:text-white'
              }`}
              title="Table View"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="text-[10px]">Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('detail')}
              className={`p-1 px-2 rounded text-xs font-mono flex items-center gap-1 transition-all nav-lift cursor-pointer ${
                viewMode === 'detail' ? 'bg-[#222] text-white font-bold shadow-sm' : 'text-[#777] hover:text-white'
              }`}
              title="Card Detail View"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="text-[10px]">Detail</span>
            </button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <>
          <div className="hidden sm:block bg-[#111111] border border-[#222] rounded-2xl overflow-x-auto shadow-sm">
            <div className="min-w-[860px]">
              {/* Table Header */}
              <div className="grid grid-cols-12 px-4 py-3 border-b border-[#222] text-[#666] text-[10px] font-bold uppercase tracking-wider bg-[#0a0a0a]">
                <div className="col-span-2">DATE</div>
                <div className="col-span-3">CATEGORY / ASSET</div>
                <div className="col-span-2">ACCOUNT</div>
                <div className="col-span-1">TYPE</div>
                <div className="col-span-2 text-right">AMOUNT</div>
                <div className="col-span-2 text-right">ACTIONS</div>
              </div>

              {/* Rows */}
              {filteredTxns.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#666]">
                  No investment transactions recorded yet.
                </div>
              ) : (
                filteredTxns.map((tx) => (
                  <div
                    key={tx.id}
                    className="grid grid-cols-12 px-4 py-3 border-b border-[#1a1a1a] items-center text-xs text-white hover:bg-surface-3 transition-all hover:translate-x-0.5"
                  >
                    <div className="col-span-2 text-[#aaa] truncate">
                      {formatDateDisplay(tx.date)}
                    </div>
                    <div className="col-span-3 font-bold text-white truncate pr-2">
                      {tx.category}
                    </div>
                    <div className="col-span-2 text-[#aaa] truncate">
                      {tx.account}
                    </div>
                    <div className="col-span-1 font-bold text-cyan-400">
                      {tx.type}
                    </div>
                    <div className="col-span-2 text-right font-bold text-cyan-400">
                      {currencySymbol}{formatAmount(tx.amount)}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTxn(tx);
                        }}
                        className="px-2 py-1 bg-[#181818] hover:bg-surface-3 border border-[#333] hover:border-white text-[#aaa] hover:text-white text-[10px] uppercase font-bold rounded-lg transition-all cursor-pointer shrink-0"
                        title="Edit Transaction"
                      >
                        EDIT
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTxn(tx);
                        }}
                        className="px-2 py-1 bg-[#181818] hover:bg-red-950/60 border border-red-900/60 hover:border-red-500 text-red-400 hover:text-red-300 text-[10px] uppercase font-bold rounded-lg transition-all cursor-pointer shrink-0"
                        title="Delete Transaction"
                      >
                        DEL
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="sm:hidden space-y-2.5">
            {filteredTxns.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#666] bg-[#111] border border-[#222] rounded-2xl">
                No investment transactions recorded yet.
              </div>
            ) : (
              filteredTxns.map((tx) => (
                <article key={tx.id} className="bg-[#111] border border-[#222] rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{tx.category}</div>
                      <div className="text-[10px] text-[#aaa] mt-1">{formatDateDisplay(tx.date)} · {tx.account}</div>
                    </div>
                    <div className="shrink-0 text-right text-xs font-bold text-cyan-400">
                      {currencySymbol}{formatAmount(tx.amount)}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-[#222] pt-2">
                    <button
                      type="button"
                      onClick={() => handleEditTxn(tx)}
                      className="min-h-10 min-w-16 px-3 border border-[#333] text-[#ccc] text-xs font-bold rounded-lg"
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTxn(tx)}
                      className="min-h-10 min-w-16 px-3 border border-red-900/60 text-red-400 text-xs font-bold rounded-lg"
                    >
                      DELETE
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredTxns.length === 0 ? (
              <div className="col-span-2 p-8 text-center text-xs text-[#666] bg-[#111] border border-[#222] rounded-2xl">
                No investment transactions recorded yet.
              </div>
            ) : (
              filteredTxns.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3 bg-[#111111] border border-[#222] hover:border-[#333] hover:bg-surface-3 rounded-2xl flex items-center justify-between gap-3 font-mono transition-all tactile-lift"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate">{tx.category}</div>
                    <div className="text-[10px] text-[#777] flex items-center gap-2">
                      <span>{formatDateDisplay(tx.date)}</span>
                      <span>•</span>
                      <span>{tx.account}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-bold text-cyan-400">
                        {currencySymbol}{formatAmount(tx.amount)}
                      </div>
                      <span className="text-[9px] bg-cyan-950/80 text-cyan-400 font-bold px-1.5 py-0.5 rounded uppercase">
                        {tx.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTxn(tx);
                        }}
                        className="px-2 py-0.5 bg-[#181818] hover:bg-surface-3 border border-[#333] hover:border-white text-[#aaa] hover:text-white text-[9px] uppercase font-bold rounded-md transition-all cursor-pointer"
                        title="Edit Transaction"
                      >
                        EDIT
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTxn(tx);
                        }}
                        className="px-2 py-0.5 bg-[#181818] hover:bg-red-950/60 border border-red-900/60 hover:border-red-500 text-red-400 hover:text-red-300 text-[9px] uppercase font-bold rounded-md transition-all cursor-pointer"
                        title="Delete Transaction"
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

      {/* ==================== PORTFOLIO NAVIGATION TABS & MARKET REFRESH BAR ==================== */}
      <div className="pt-2 border-t border-[#222] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-[#121217] border border-[#222] rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveViewTab('HOLDINGS')}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-xl transition-all cursor-pointer ${
              activeViewTab === 'HOLDINGS'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-[#888] hover:text-white'
            }`}
          >
            Holdings ({investments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab('REDEMPTIONS')}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeViewTab === 'REDEMPTIONS'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-[#888] hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Redemptions ({allRedemptions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab('LEDGER')}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-xl transition-all cursor-pointer ${
              activeViewTab === 'LEDGER'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-[#888] hover:text-white'
            }`}
          >
            Cashflow Ledger
          </button>
        </div>

        {/* Demat Accounts, Live Quotes Refresh & Add Asset Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDematManager(true)}
            className="px-3 py-1.5 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-700/60 rounded-xl text-xs font-mono text-purple-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Manage Demat Accounts & Import from Zerodha/Dhan"
          >
            <Building2 className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Demat Accounts</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-purple-900/60 text-purple-200 rounded font-bold">Sync</span>
          </button>

          <button
            type="button"
            disabled={isRefreshingQuotes}
            onClick={handleRefreshMarketQuotes}
            className="px-3 py-1.5 bg-[#181820] hover:bg-surface-3 border border-[#333] hover:border-red-500 rounded-xl text-xs font-mono text-[#aaa] hover:text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Refresh current NAV & live stock quotes"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-red-400 ${isRefreshingQuotes ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Quotes</span>
            <span className="text-[10px] text-[#666]">({lastQuoteRefreshTime})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Asset</span>
          </button>
        </div>
      </div>

      {/* ==================== TAB CONTENT: HOLDINGS VIEW ==================== */}
      {activeViewTab === 'HOLDINGS' && (
        <div className="space-y-4">
          {quoteNotice && (
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs font-mono text-amber-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{quoteNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setQuoteNotice(null)}
                className="p-1 text-amber-400 hover:text-white rounded transition-colors cursor-pointer"
                title="Dismiss notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {investments.length === 0 ? (
              <div className="col-span-2 p-8 text-center text-xs text-[#666] bg-[#111] border border-[#222] rounded-3xl">
                No individual investment holdings logged. Tap "Add Asset" or "Demat Accounts" to log mutual funds, stocks, fixed deposits, or gold.
              </div>
            ) : filteredInvestments.length === 0 ? (
              <div className="col-span-2 p-8 text-center text-xs text-[#666] bg-[#111] border border-[#222] rounded-3xl">
                No holdings match the selected Demat account or filter criteria.
              </div>
            ) : (
              filteredInvestments.map((inv) => {
                const isMF = inv.type === 'Mutual Funds';
                const isStock = inv.type === 'Stocks';
                const isFD = inv.type === 'Fixed Deposit';
                const isRedeemed = inv.status === 'redeemed' || inv.currentValue === 0;

                return (
                  <div
                    key={inv.id}
                    className={`p-5 bg-[#121217] border rounded-3xl space-y-4 transition-all relative ${
                      isRedeemed ? 'border-[#222] opacity-75' : 'border-line hover:border-line-strong'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 bg-[#181822] border border-[#333] text-[9px] font-mono text-red-400 font-bold uppercase rounded-lg">
                            {inv.type}
                          </span>
                          {inv.dematAccount && (
                            <span className="px-2 py-0.5 bg-purple-950/70 border border-purple-700/60 text-[9px] font-mono text-purple-300 font-bold rounded-lg flex items-center gap-1">
                              <Building2 className="w-2.5 h-2.5" />
                              {inv.dematAccount}
                            </span>
                          )}
                          {inv.status && (
                            <span
                              className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded-lg border ${
                                inv.status === 'redeemed'
                                  ? 'bg-gray-800 text-gray-400 border-gray-700'
                                  : inv.status === 'partially_redeemed'
                                  ? 'bg-amber-950 text-amber-400 border-amber-800'
                                  : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                              }`}
                            >
                              {inv.status === 'partially_redeemed' ? 'Partial Liquidation' : inv.status}
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-bold font-mono text-white mt-2">{inv.name}</h3>
                        {inv.notes && <p className="text-xs text-[#777] font-mono mt-0.5">{inv.notes}</p>}
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold font-mono text-white">
                          {currencySymbol}{formatAmount(inv.currentValue)}
                        </div>
                        <div
                          className={`text-xs font-mono font-bold ${
                            inv.returnsPercent >= 0 ? 'text-emerald-400' : 'text-red-500'
                          }`}
                        >
                          {inv.returnsPercent >= 0 ? '+' : ''}
                          {inv.returnsPercent}% Returns
                        </div>
                      </div>
                    </div>

                    {/* Asset-Specific Financial Telemetry */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 bg-[#16161e] border border-line rounded-2xl text-[11px] font-mono">
                      <div>
                        <span className="text-[#666] block text-[9px] uppercase">Cost Basis</span>
                        <span className="text-white font-bold">
                          {currencySymbol}{formatAmount(inv.amountInvested)}
                        </span>
                      </div>
                      {isMF && (
                        <>
                          <div>
                            <span className="text-[#666] block text-[9px] uppercase">Units Held</span>
                            <span className="text-white font-bold">{inv.units || '—'}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[#666] block text-[9px] uppercase">Current NAV</span>
                              {inv.currentNav ? (
                                isQuoteLive(inv) ? (
                                  <span className="px-1 py-0.2 text-[8px] font-mono font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">LIVE</span>
                                ) : (
                                  <span className="px-1 py-0.2 text-[8px] font-mono font-bold rounded bg-neutral-800 text-neutral-400 border border-neutral-700">SAVED</span>
                                )
                              ) : null}
                            </div>
                            <span className="text-cyan-400 font-bold">
                              {inv.currentNav ? `${currencySymbol}${inv.currentNav}` : '—'}
                            </span>
                          </div>
                        </>
                      )}
                      {isStock && (
                        <>
                          <div>
                            <span className="text-[#666] block text-[9px] uppercase">Shares Held</span>
                            <span className="text-white font-bold">{inv.shares || '—'}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[#666] block text-[9px] uppercase">Market Price</span>
                              {inv.currentPrice ? (
                                isQuoteLive(inv) ? (
                                  <span className="px-1 py-0.2 text-[8px] font-mono font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">LIVE</span>
                                ) : (
                                  <span className="px-1 py-0.2 text-[8px] font-mono font-bold rounded bg-neutral-800 text-neutral-400 border border-neutral-700">SAVED</span>
                                )
                              ) : null}
                            </div>
                            <span className="text-cyan-400 font-bold">
                              {inv.currentPrice ? `${currencySymbol}${inv.currentPrice}` : '—'}
                            </span>
                          </div>
                        </>
                      )}
                      {isFD && (
                        <>
                          <div>
                            <span className="text-[#666] block text-[9px] uppercase">Interest Rate</span>
                            <span className="text-amber-400 font-bold">{inv.interestRate}% p.a.</span>
                          </div>
                          <div>
                            <span className="text-[#666] block text-[9px] uppercase">Maturity Date</span>
                            <span className="text-white font-bold">{inv.maturityDate || '—'}</span>
                          </div>
                        </>
                      )}
                      {!isMF && !isStock && !isFD && (
                        <div>
                          <span className="text-[#666] block text-[9px] uppercase">Valuation Date</span>
                          <span className="text-white">{inv.date}</span>
                        </div>
                      )}
                    </div>

                    {/* Card Action Ribbon */}
                    <div className="flex items-center justify-between text-xs font-mono pt-2 border-t border-[#222]">
                      <div className="flex items-center gap-2">
                        {!isRedeemed && (
                          <button
                            type="button"
                            onClick={() => setRedeemingInv(inv)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-[11px] uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                          >
                            <ArrowDownRight className="w-3.5 h-3.5" />
                            <span>{isFD ? 'Withdraw FD' : 'Redeem'}</span>
                          </button>
                        )}
                        {inv.redemptions && inv.redemptions.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveViewTab('REDEMPTIONS')}
                            className="px-2 py-1 bg-[#181822] text-[#888] hover:text-white text-[10px] rounded-lg transition-colors cursor-pointer"
                          >
                            Redeemed ({inv.redemptions.length})
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(inv)}
                          className="p-1.5 text-[#888] hover:text-white hover:bg-surface-3 rounded-lg transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {onDeleteInvestment && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteInv(inv.id, inv.name, inv.type, inv.amountInvested, e)}
                            className="p-1.5 text-[#888] hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB CONTENT: REDEMPTION HISTORY ==================== */}
      {activeViewTab === 'REDEMPTIONS' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono font-bold text-[#888] uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4 text-red-500" />
              <span>Investment Liquidation & Redemption Ledger</span>
            </div>
            <div className="text-xs font-mono text-emerald-400 font-bold">
              Total Realized Gain: {currencySymbol}{formatAmount(totalRealizedGain)}
            </div>
          </div>

          <div className="bg-surface-1 border border-[#222] rounded-2xl overflow-x-auto shadow-sm">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-12 px-4 py-3 border-b border-[#222] text-[#666] text-[10px] font-bold uppercase tracking-wider bg-surface-1">
                <div className="col-span-2">DATE</div>
                <div className="col-span-3">ASSET / NOTE</div>
                <div className="col-span-2 text-right">GROSS PROCEEDS</div>
                <div className="col-span-1 text-right">FEES / TAX</div>
                <div className="col-span-2 text-right">NET CREDITED</div>
                <div className="col-span-2 text-right">REALIZED P&L</div>
              </div>

              {allRedemptions.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#666]">
                  No investments redeemed yet. Use the "Redeem" action on any active holding to perform a full or partial liquidation.
                </div>
              ) : (
                allRedemptions.map((red) => (
                  <div
                    key={red.id}
                    className="grid grid-cols-12 px-4 py-3 border-b border-line items-center text-xs text-white hover:bg-surface-3 transition-all"
                  >
                    <div className="col-span-2 text-[#aaa] font-mono">
                      {formatDateDisplay(red.date)}
                    </div>
                    <div className="col-span-3 min-w-0 pr-2">
                      <div className="font-bold text-white truncate">{red.notes || 'Redemption'}</div>
                      <div className="text-[10px] text-[#777] truncate">
                        {red.isFullRedemption ? '100% Full Liquidation' : 'Partial Liquidation'} · to {red.creditedAccountName || 'Account'}
                      </div>
                    </div>
                    <div className="col-span-2 text-right font-mono text-white">
                      {currencySymbol}{formatAmount(red.grossProceeds)}
                    </div>
                    <div className="col-span-1 text-right font-mono text-red-400 text-[11px]">
                      -{currencySymbol}{formatAmount((red.charges + red.taxes))}
                    </div>
                    <div className="col-span-2 text-right font-mono font-bold text-emerald-400">
                      +{currencySymbol}{formatAmount(red.netCredited)}
                    </div>
                    <div
                      className={`col-span-2 text-right font-mono font-bold ${
                        red.realizedGainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {red.realizedGainLoss >= 0 ? '+' : ''}
                      {currencySymbol}{formatAmount(red.realizedGainLoss)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB CONTENT: CASHFLOW TRANSACTIONS LEDGER ==================== */}
      {activeViewTab === 'LEDGER' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono font-bold text-[#888] uppercase tracking-wider flex items-center gap-2">
              <span>Investment Ledger Transactions</span>
            </div>
            <div className="flex items-center bg-[#111111] p-0.5 border border-[#222] rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1 px-2 rounded text-xs font-mono flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'table' ? 'bg-[#222] text-white font-bold' : 'text-[#777] hover:text-white'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span className="text-[10px]">Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('detail')}
                className={`p-1 px-2 rounded text-xs font-mono flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'detail' ? 'bg-[#222] text-white font-bold' : 'text-[#777] hover:text-white'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span className="text-[10px]">Detail</span>
              </button>
            </div>
          </div>

          {viewMode === 'table' ? (
            <div className="bg-[#111111] border border-[#222] rounded-2xl overflow-x-auto shadow-sm">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-12 px-4 py-3 border-b border-[#222] text-[#666] text-[10px] font-bold uppercase tracking-wider bg-[#0a0a0a]">
                  <div className="col-span-2">DATE</div>
                  <div className="col-span-3">CATEGORY / ASSET</div>
                  <div className="col-span-2">ACCOUNT</div>
                  <div className="col-span-1">TYPE</div>
                  <div className="col-span-2 text-right">AMOUNT</div>
                  <div className="col-span-2 text-right">ACTIONS</div>
                </div>

                {filteredTxns.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#666]">
                    No investment transactions recorded yet.
                  </div>
                ) : (
                  filteredTxns.map((tx) => (
                    <div
                      key={tx.id}
                      className="grid grid-cols-12 px-4 py-3 border-b border-[#1a1a1a] items-center text-xs text-white hover:bg-surface-3 transition-all"
                    >
                      <div className="col-span-2 text-[#aaa] truncate">
                        {formatDateDisplay(tx.date)}
                      </div>
                      <div className="col-span-3 font-bold text-white truncate pr-2">
                        {tx.category}
                      </div>
                      <div className="col-span-2 text-[#aaa] truncate">
                        {tx.account}
                      </div>
                      <div className="col-span-1 font-bold text-cyan-400">
                        {tx.type}
                      </div>
                      <div className="col-span-2 text-right font-bold text-cyan-400">
                        {currencySymbol}{formatAmount(tx.amount)}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditTxn(tx);
                          }}
                          className="px-2 py-1 bg-[#181818] hover:bg-surface-3 border border-[#333] hover:border-white text-[#aaa] hover:text-white text-[10px] uppercase font-bold rounded-lg transition-all cursor-pointer"
                        >
                          EDIT
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTxn(tx);
                          }}
                          className="px-2 py-1 bg-[#181818] hover:bg-red-950/60 border border-red-900/60 hover:border-red-500 text-red-400 hover:text-red-300 text-[10px] uppercase font-bold rounded-lg transition-all cursor-pointer"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredTxns.length === 0 ? (
                <div className="col-span-2 p-8 text-center text-xs text-[#666] bg-[#111] border border-[#222] rounded-2xl">
                  No investment transactions recorded yet.
                </div>
              ) : (
                filteredTxns.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3 bg-[#111111] border border-[#222] hover:border-[#333] hover:bg-surface-3 rounded-2xl flex items-center justify-between gap-3 font-mono transition-all"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">{tx.category}</div>
                      <div className="text-[10px] text-[#777] flex items-center gap-2">
                        <span>{formatDateDisplay(tx.date)}</span>
                        <span>•</span>
                        <span>{tx.account}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-bold text-cyan-400">
                          {currencySymbol}{formatAmount(tx.amount)}
                        </div>
                        <span className="text-[9px] bg-cyan-950/80 text-cyan-400 font-bold px-1.5 py-0.5 rounded uppercase">
                          {tx.type}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Redemption Interactive Modal */}
      {redeemingInv && (
        <InvestmentRedemptionModal
          investment={redeemingInv}
          accounts={accounts}
          currencySymbol={currencySymbol}
          onClose={() => setRedeemingInv(null)}
          onConfirmRedemption={(invId, redemption, updatedInv, accountId, netProceeds) => {
            onConfirmRedemption?.(invId, redemption, updatedInv, accountId, netProceeds);
            setRedeemingInv(null);
          }}
        />
      )}

      {/* Modal for adding/editing investment with comprehensive asset forms */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#121217] border border-line p-5 sm:p-6 rounded-3xl max-w-lg w-full shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-4 text-white font-mono">
            <div className="flex justify-between items-center pb-3 border-b border-[#222]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-950/70 border border-red-700/60 flex items-center justify-center text-red-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase">
                    {editingInv ? 'Edit Investment Record' : 'Log Investment Holding'}
                  </h3>
                  <p className="text-[10px] text-[#888]">
                    Mutual Funds, Equities, Fixed Deposits, Gold & Assets
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="text-[#666] hover:text-white p-1 rounded-lg bg-[#181820]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvestment} className="space-y-3.5">
              {/* Asset Type & Purchase Date Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                    Asset Category
                  </label>
                  <select
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value as InvestmentType);
                      setFormError(null);
                    }}
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  >
                    <option value="Mutual Funds">Mutual Funds (SIP / Lump sum)</option>
                    <option value="Stocks">Direct Stocks & Equity ETFs</option>
                    <option value="Fixed Deposit">Fixed Deposit / Term Deposit</option>
                    <option value="Gold">Sovereign Gold Bond / Gold</option>
                    <option value="Crypto">Crypto Assets</option>
                    <option value="Real Estate">Real Estate / REITs</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                    Purchase / Deposit Date
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600 appearance-none font-mono"
                  />
                </div>
              </div>

              {/* Asset / Fund Name (for non-stock types) */}
              {type !== 'Stocks' && (
                <div>
                  <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                    {type === 'Mutual Funds'
                      ? 'Scheme Name'
                      : type === 'Fixed Deposit'
                      ? 'Bank / Institution Name'
                      : 'Investment Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      type === 'Mutual Funds'
                        ? 'e.g. UTI Nifty 50 Index Fund Direct Growth'
                        : type === 'Fixed Deposit'
                        ? 'e.g. HDFC Bank Fixed Deposit'
                        : 'e.g. Sovereign Gold Bond 2026'
                    }
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              )}

              {/* MUTUAL FUNDS SPECIFIC FIELDS */}
              {type === 'Mutual Funds' && (
                <div className="space-y-2.5">
                  {/* AMFI Scheme Code with Find Code search */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[9px] text-[#aaa] uppercase">
                        AMFI Scheme Code
                      </label>
                      <button
                        type="button"
                        disabled={isSearchingMf}
                        onClick={handleSearchMfCode}
                        className="text-[9px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Search AMFI scheme code by name"
                      >
                        <Search className="w-2.5 h-2.5" />
                        <span>{isSearchingMf ? 'Searching...' : 'Find code'}</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={schemeCode}
                      onChange={(e) => {
                        setSchemeCode(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      placeholder="e.g. 122639 (Parag Parikh Flexi Cap)"
                      className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                    />

                    {showMfSearchResults && mfSearchResults.length > 0 && (
                      <div className="mt-1.5 max-h-48 overflow-y-auto bg-surface-1 border border-[#333] rounded-xl p-1 shadow-2xl divide-y divide-line">
                        <div className="flex items-center justify-between px-2 py-1 text-[9px] text-[#777]">
                          <span>Select AMFI Scheme:</span>
                          <button
                            type="button"
                            onClick={() => setShowMfSearchResults(false)}
                            className="text-[#888] hover:text-white p-0.5"
                          >
                            ✕
                          </button>
                        </div>
                        {mfSearchResults.map((item) => (
                          <button
                            key={item.schemeCode}
                            type="button"
                            onClick={() => handleSelectMfScheme(item)}
                            className="w-full text-left px-2 py-1.5 hover:bg-surface-3 rounded-lg transition-colors flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="text-[11px] text-white truncate flex-1">{item.schemeName}</span>
                            <span className="text-[10px] font-mono text-cyan-400 shrink-0 font-bold">{item.schemeCode}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[9px] text-[#aaa] uppercase mb-1">Plan Type</label>
                      <select
                        value={investmentPlan}
                        onChange={(e) => setInvestmentPlan(e.target.value as 'lump_sum' | 'sip')}
                        className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white"
                      >
                        <option value="lump_sum">Lump sum</option>
                        <option value="sip">Monthly SIP</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#aaa] uppercase mb-1">Purchase NAV ({currencySymbol})</label>
                      <input
                        type="number"
                        step="any"
                        value={purchaseNav}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          setPurchaseNav(e.target.value);
                          if (formError) setFormError(null);
                        }}
                        placeholder="150.0"
                        className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#aaa] uppercase mb-1">Units (Auto-calc)</label>
                      <input
                        type="number"
                        step="any"
                        value={units}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          setUnits(e.target.value);
                          if (formError) setFormError(null);
                        }}
                        placeholder="e.g. 500"
                        className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] text-[#aaa] uppercase mb-1">Exit Load (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={exitLoadPercent}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      onChange={(e) => setExitLoadPercent(e.target.value)}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white"
                    />
                  </div>
                </div>
              )}

              {/* STOCKS SPECIFIC FIELDS - WITH SEARCHABLE STOCK SELECTOR */}
              {type === 'Stocks' && (
                <div className="space-y-2.5">
                  <StockSelector
                    selectedSymbol={stockSymbol}
                    currencySymbol={currencySymbol}
                    onSelect={(stock: StockItem) => {
                      setStockSymbol(stock.symbol);
                      setName(stock.name);
                      setStockExchange(stock.exchange === 'NSE' || stock.exchange === 'BSE' ? stock.exchange : 'US');
                      setPurchasePrice(stock.basePrice.toString());
                      if (shares && parseFloat(shares) > 0) {
                        const s = parseFloat(shares);
                        setAmountInvested((s * stock.basePrice).toFixed(2));
                        setCurrentValue((s * stock.basePrice).toFixed(2));
                      } else if (amountInvested && parseFloat(amountInvested) > 0) {
                        const amt = parseFloat(amountInvested);
                        setShares(Math.floor(amt / stock.basePrice).toString());
                        setCurrentValue(amt.toFixed(2));
                      } else {
                        setShares('10');
                        setAmountInvested((10 * stock.basePrice).toFixed(2));
                        setCurrentValue((10 * stock.basePrice).toFixed(2));
                      }
                    }}
                    onCustomSymbolChange={(sym) => {
                      setStockSymbol(sym);
                      setName(sym);
                    }}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[9px] text-[#aaa] uppercase mb-1">Exchange</label>
                      <select
                        value={stockExchange}
                        onChange={(e) => setStockExchange(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white"
                      >
                        <option value="NSE">NSE (India)</option>
                        <option value="BSE">BSE (India)</option>
                        <option value="US">US (NASDAQ / NYSE)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#aaa] uppercase mb-1">Shares Count</label>
                      <input
                        type="number"
                        step="any"
                        value={shares}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const val = e.target.value;
                          setShares(val);
                          const num = parseFloat(val);
                          const p = parseFloat(purchasePrice);
                          if (num > 0 && p > 0) {
                            setAmountInvested((num * p).toFixed(2));
                            setCurrentValue((num * p).toFixed(2));
                          }
                        }}
                        placeholder="e.g. 25"
                        className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#aaa] uppercase mb-1">Buy Price/Share ({currencySymbol})</label>
                      <input
                        type="number"
                        step="any"
                        value={purchasePrice}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPurchasePrice(val);
                          const p = parseFloat(val);
                          const s = parseFloat(shares);
                          if (p > 0 && s > 0) {
                            setAmountInvested((s * p).toFixed(2));
                            setCurrentValue((s * p).toFixed(2));
                          }
                        }}
                        placeholder="e.g. 318.4"
                        className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* FIXED DEPOSIT SPECIFIC FIELDS */}
              {type === 'Fixed Deposit' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[9px] text-[#aaa] uppercase mb-1">Interest Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={fdInterestRate}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      onChange={(e) => setFdInterestRate(e.target.value)}
                      placeholder="7.25"
                      className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-[#aaa] uppercase mb-1">Tenure (Months)</label>
                    <input
                      type="number"
                      value={fdTenureMonths}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      onChange={(e) => setFdTenureMonths(e.target.value)}
                      placeholder="24"
                      className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-[#aaa] uppercase mb-1">Compounding</label>
                    <select
                      value={fdCompounding}
                      onChange={(e) => setFdCompounding(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 bg-[#181820] border border-[#333] rounded-xl text-xs text-white"
                    >
                      <option value="quarterly">Quarterly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                      <option value="simple">Simple</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Financial Capital Amounts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                    Total Amount Invested ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={amountInvested}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => setAmountInvested(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                    Current Valuation ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={currentValue}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    placeholder="e.g. 58200"
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>

              {/* Demat Broker / Account (for Stocks and Mutual Funds) */}
              {(type === 'Stocks' || type === 'Mutual Funds') && (
                <div>
                  <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Demat Broker / Demat Account</span>
                    <span className="text-[9px] text-purple-400">Zerodha, Dhan, Groww etc.</span>
                  </label>
                  <select
                    value={dematAccount}
                    onChange={(e) => setDematAccount(e.target.value)}
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="">— none —</option>
                    <option value="Zerodha">Zerodha (Kite / Console)</option>
                    <option value="Dhan">Dhan (DhanHQ)</option>
                    <option value="Groww">Groww</option>
                    <option value="Upstox">Upstox Pro</option>
                    <option value="Angel One">Angel One</option>
                    <option value="ICICI Direct">ICICI Direct</option>
                    <option value="HDFC Sky">HDFC Sky</option>
                    <option value="Kotak Neo">Kotak Neo</option>
                    <option value="Other">Other / Physical</option>
                  </select>
                </div>
              )}

              {/* Linked Bank Account */}
              <div>
                <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                  Source / Linked Bank Account
                </label>
                <select
                  value={linkedAccountId}
                  onChange={(e) => setLinkedAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600 cursor-pointer"
                >
                  <option value="">-- Manual Selection --</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.bankName})
                    </option>
                  ))}
                </select>
              </div>

              {!editingInv && (
                <label className="flex items-center gap-2 text-xs font-mono text-[#aaa] cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={recordInLedger}
                    onChange={(e) => setRecordInLedger(e.target.checked)}
                    className="accent-red-600 rounded bg-black border border-[#333] cursor-pointer"
                  />
                  <span className="text-[11px] text-white">Record in ledger & adjust account balance</span>
                </label>
              )}

              <div>
                <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                  Notes / Folio / Demat Details
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Zerodha Demat account or SBI Branch Folio"
                  className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600 resize-none"
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-red-950/60 border border-red-700/80 rounded-xl text-xs font-mono text-red-200">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-lg"
                >
                  {editingInv ? 'Save Changes' : 'Log Investment Position'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Demat Manager & Multi-Broker Sync Modal */}
      {showDematManager && (
        <DematManagerModal
          investments={investments}
          currencySymbol={currencySymbol}
          onClose={() => setShowDematManager(false)}
          onImportHoldings={(newHoldings) => {
            newHoldings.forEach((h) => onAddInvestment(h));
            setShowDematManager(false);
          }}
        />
      )}

      {/* Delete Ledger Transaction Modal Dialog */}
      <AnimatePresence>
        {txnToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono select-none">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTxnToDelete(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Dialog Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              className="relative z-10 w-full max-w-md bg-[#121216] border border-[#222] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-surface-1 border border-line rounded-2xl shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase">
                      Delete Transaction?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTxnToDelete(null)}
                  className="p-1.5 text-[#555] hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Details card */}
              <div className="p-4 bg-[#181820] border border-[#26262f] rounded-2xl">
                <div className="space-y-1.5 font-mono">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Title / Payee:</span>
                    <span className="font-bold text-white max-w-[200px] truncate">
                      {txnToDelete.category}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Account:</span>
                    <span className="text-white font-bold">{txnToDelete.account}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Amount:</span>
                    <span className="font-bold text-cyan-400">
                      {currencySymbol}{formatAmount(txnToDelete.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Date:</span>
                    <span className="text-[#aaa]">{formatDateDisplay(txnToDelete.date)}</span>
                  </div>
                </div>
              </div>

              {/* Checkbox */}
              <label className="flex items-center gap-3 p-3 bg-surface-1 border border-line hover:border-[#333] rounded-2xl cursor-pointer transition-all select-none">
                <input
                  type="checkbox"
                  checked={doNotAskAgainChecked}
                  onChange={(e) => setDoNotAskAgainChecked(e.target.checked)}
                  className="w-4.5 h-4.5 accent-red-600 rounded bg-black border border-[#333] cursor-pointer"
                />
                <span className="text-xs font-bold text-white">Do not ask again</span>
              </label>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTxnToDelete(null)}
                  className="px-4 py-2 bg-surface-1 hover:bg-surface-3 border border-line text-xs font-mono text-[#888] hover:text-white rounded-xl uppercase font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteTxn}
                  className="px-5 py-2 text-xs font-mono uppercase rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Asset Holding Modal Dialog */}
      <AnimatePresence>
        {assetToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono select-none">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAssetToDelete(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Dialog Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              className="relative z-10 w-full max-w-md bg-[#121216] border border-[#222] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-surface-1 border border-line rounded-2xl shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase">
                      Delete Asset?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAssetToDelete(null)}
                  className="p-1.5 text-[#555] hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Details card */}
              <div className="p-4 bg-[#181820] border border-[#26262f] rounded-2xl">
                <div className="space-y-1.5 font-mono">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Asset Name:</span>
                    <span className="font-bold text-white max-w-[200px] truncate">
                      {assetToDelete.name}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Asset Type:</span>
                    <span className="text-white font-bold">{assetToDelete.type}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Invested Capital:</span>
                    <span className="font-bold text-red-400">
                      {currencySymbol}{formatAmount(assetToDelete.amount)}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-[#888] font-mono">
                Note: Deleting this asset will not alter your account balance or transaction history.
              </p>

              {/* Checkbox */}
              <label className="flex items-center gap-3 p-3 bg-surface-1 border border-line hover:border-[#333] rounded-2xl cursor-pointer transition-all select-none">
                <input
                  type="checkbox"
                  checked={doNotAskAgainChecked}
                  onChange={(e) => setDoNotAskAgainChecked(e.target.checked)}
                  className="w-4.5 h-4.5 accent-red-600 rounded bg-black border border-[#333] cursor-pointer"
                />
                <span className="text-xs font-bold text-white">Do not ask again</span>
              </label>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAssetToDelete(null)}
                  className="px-4 py-2 bg-surface-1 hover:bg-surface-3 border border-line text-xs font-mono text-[#888] hover:text-white rounded-xl uppercase font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAsset}
                  className="px-5 py-2 text-xs font-mono uppercase rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
