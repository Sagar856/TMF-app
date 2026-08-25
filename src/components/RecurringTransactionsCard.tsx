import React, { useState, useMemo } from 'react';
import { Transaction, Category } from '../types/finance';
import { 
  Repeat, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Zap, 
  Wifi, 
  Shield, 
  Tv, 
  Building, 
  CreditCard, 
  Plus, 
  Check, 
  ArrowUpRight, 
  ArrowDownLeft, 
  X, 
  ChevronDown, 
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  TrendingUp,
  DollarSign,
  CalendarDays,
  List,
  Filter,
  Info
} from 'lucide-react';

export interface CustomRecurringBill {
  id: string;
  title: string;
  amount: number;
  category: string;
  payeeOrPayer: string;
  frequency: 'Monthly' | 'Weekly' | 'Yearly';
  expectedDayOfMonth: number;
  type: 'debit' | 'credit';
  autoDebit?: boolean;
}

export interface DetectedRecurringItem {
  id: string;
  title: string;
  amount: number;
  category: string;
  payeeOrPayer: string;
  frequency: 'Monthly' | 'Weekly' | 'Yearly';
  expectedDayOfMonth: number;
  lastPaidDate: string;
  nextDueDate: string;
  daysRemaining: number;
  status: 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'SCHEDULED' | 'PAID';
  type: 'debit' | 'credit';
  autoDebit?: boolean;
  isCustom?: boolean;
}

interface RecurringTransactionsCardProps {
  transactions: Transaction[];
  categories: Category[];
  currencySymbol: string;
  onQuickLogTransaction?: (tx: Transaction) => void;
  onNavigateToTransactions?: () => void;
}

export const RecurringTransactionsCard: React.FC<RecurringTransactionsCardProps> = ({
  transactions,
  categories,
  currencySymbol,
  onQuickLogTransaction,
  onNavigateToTransactions,
}) => {
  // Collapsed by default as requested in prompt requirement #1
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [filter, setFilter] = useState<'ALL' | 'DUE_SOON' | 'EXPENSE' | 'INCOME'>('ALL');
  const [viewMode, setViewMode] = useState<'CALENDAR' | 'LIST'>('CALENDAR');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [markedPaidIds, setMarkedPaidIds] = useState<Set<string>>(new Set());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);

  // Custom User Recurring Bills state from localStorage
  const [customBills, setCustomBills] = useState<CustomRecurringBill[]>(() => {
    try {
      const saved = localStorage.getItem('tmf_custom_recurring_bills');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Form State for Adding Custom Bill
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('Bills & Utilities');
  const [newPayee, setNewPayee] = useState('');
  const [newDay, setNewDay] = useState('5');
  const [newType, setNewType] = useState<'debit' | 'credit'>('debit');
  const [newAutoDebit, setNewAutoDebit] = useState(true);

  // Helper to calculate Reference Today Date (latest tx date or real today)
  const referenceDateObj = useMemo(() => {
    let latestDateStr = new Date().toISOString().substring(0, 10);
    if (transactions.length > 0) {
      const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
      if (sorted[0].date > latestDateStr) {
        latestDateStr = sorted[0].date;
      }
    }
    return new Date(latestDateStr);
  }, [transactions]);

  const currentMonthStr = useMemo(() => referenceDateObj.toISOString().substring(0, 7), [referenceDateObj]); // e.g. '2026-08'

  // Selected Month State for Calendar / Projection - Defaults to active month
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);

  // Month navigation handlers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevStr = prevDate.toISOString().substring(0, 7);
    setSelectedMonth(prevStr);
    setSelectedCalendarDay(null);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const nextStr = nextDate.toISOString().substring(0, 7);
    setSelectedMonth(nextStr);
    setSelectedCalendarDay(null);
  };

  // Format YYYY-MM to readable label e.g., "August 2026"
  const formatMonthLabel = (ym: string) => {
    if (!ym || ym.length < 7) return ym;
    const [year, month] = ym.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthIdx = parseInt(month, 10) - 1;
    return `${monthNames[monthIdx] || month} ${year}`;
  };

  // Pattern Recognition Engine: Extract Recurring Transactions from History + Custom Bills
  const recurringItems: DetectedRecurringItem[] = useMemo(() => {
    const items: DetectedRecurringItem[] = [];
    const [selYear, selMonthNum] = selectedMonth.split('-').map(Number);
    const targetMonthIdx = selMonthNum - 1;

    // 1. Group past transactions by normalized title or payee
    const groups: Record<string, Transaction[]> = {};
    transactions.forEach((tx) => {
      const normalizedKey = (tx.payeeOrPayer || tx.title || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
      if (!normalizedKey) return;
      if (!groups[normalizedKey]) groups[normalizedKey] = [];
      groups[normalizedKey].push(tx);
    });

    // Known keywords that strongly indicate recurring bills
    const billCategories = ['bills & utilities', 'subscriptions', 'mutual funds', 'salary', 'rent', 'insurance', 'loans'];

    // Process detected candidates from transaction history
    Object.entries(groups).forEach(([key, txList]) => {
      if (txList.length === 0) return;

      const sample = txList[0];
      const isBillCategory = billCategories.includes((sample.category || '').toLowerCase());
      const repeatsMultipleTimes = txList.length >= 2;

      if (isBillCategory || repeatsMultipleTimes) {
        const sortedTx = [...txList].sort((a, b) => b.date.localeCompare(a.date));
        const latestTx = sortedTx[0];
        const dayOfLastPaid = parseInt(latestTx.date.split('-')[2] || '1', 10);

        // Check if paid in the selected target month
        const paidInSelectedMonth = sortedTx.some((t) => t.date.startsWith(selectedMonth));

        const maxDaysInTargetMonth = new Date(selYear, targetMonthIdx + 1, 0).getDate();
        const validDay = Math.min(dayOfLastPaid, maxDaysInTargetMonth);
        const nextDueDateObj = new Date(selYear, targetMonthIdx, validDay);
        const nextDueDateStr = nextDueDateObj.toISOString().substring(0, 10);

        const diffTime = nextDueDateObj.getTime() - referenceDateObj.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let status: DetectedRecurringItem['status'] = 'SCHEDULED';
        if (paidInSelectedMonth || markedPaidIds.has(`detected_${key}`)) {
          status = 'PAID';
        } else if (daysRemaining < 0) {
          status = 'OVERDUE';
        } else if (daysRemaining === 0) {
          status = 'DUE_TODAY';
        } else if (daysRemaining <= 7) {
          status = 'DUE_SOON';
        }

        items.push({
          id: `detected_${key}`,
          title: latestTx.title,
          amount: latestTx.amount,
          category: latestTx.category,
          payeeOrPayer: latestTx.payeeOrPayer || latestTx.title,
          frequency: 'Monthly',
          expectedDayOfMonth: validDay,
          lastPaidDate: latestTx.date,
          nextDueDate: nextDueDateStr,
          daysRemaining,
          status,
          type: latestTx.type,
          autoDebit: latestTx.paymentMethod?.toLowerCase().includes('autodebit') || latestTx.paymentMethod?.toLowerCase().includes('nach'),
          isCustom: false,
        });
      }
    });

    // 2. Process Custom User-Created Bills
    customBills.forEach((bill) => {
      const isAlreadyInDetected = items.some(
        (i) => i.title.toLowerCase() === bill.title.toLowerCase()
      );
      if (isAlreadyInDetected) return;

      const paidInSelectedMonth = transactions.some(
        (t) =>
          t.date.startsWith(selectedMonth) &&
          (t.title.toLowerCase().includes(bill.title.toLowerCase()) ||
            (t.payeeOrPayer && t.payeeOrPayer.toLowerCase().includes(bill.title.toLowerCase())))
      );

      const maxDaysInTargetMonth = new Date(selYear, targetMonthIdx + 1, 0).getDate();
      const validDay = Math.min(bill.expectedDayOfMonth, maxDaysInTargetMonth);
      const nextDueDateObj = new Date(selYear, targetMonthIdx, validDay);
      const nextDueDateStr = nextDueDateObj.toISOString().substring(0, 10);

      const diffTime = nextDueDateObj.getTime() - referenceDateObj.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let status: DetectedRecurringItem['status'] = 'SCHEDULED';
      if (paidInSelectedMonth || markedPaidIds.has(bill.id)) {
        status = 'PAID';
      } else if (daysRemaining < 0) {
        status = 'OVERDUE';
      } else if (daysRemaining === 0) {
        status = 'DUE_TODAY';
      } else if (daysRemaining <= 7) {
        status = 'DUE_SOON';
      }

      items.push({
        id: bill.id,
        title: bill.title,
        amount: bill.amount,
        category: bill.category,
        payeeOrPayer: bill.payeeOrPayer,
        frequency: bill.frequency,
        expectedDayOfMonth: bill.expectedDayOfMonth,
        lastPaidDate: 'N/A',
        nextDueDate: nextDueDateStr,
        daysRemaining,
        status,
        type: bill.type,
        autoDebit: bill.autoDebit,
        isCustom: true,
      });
    });

    // Fallback: If no bills detected, populate preset demo recurring items
    if (items.length === 0) {
      const defaultPresets: DetectedRecurringItem[] = [
        {
          id: 'preset_airtel',
          title: 'Airtel Fiber & Mobile',
          amount: 2360,
          category: 'Bills & Utilities',
          payeeOrPayer: 'Airtel Digital Broadband',
          frequency: 'Monthly',
          expectedDayOfMonth: 15,
          lastPaidDate: '2026-07-15',
          nextDueDate: `${selectedMonth}-15`,
          daysRemaining: 3,
          status: 'DUE_SOON',
          type: 'debit',
          autoDebit: false,
        },
        {
          id: 'preset_zerodha',
          title: 'Zerodha Mutual Fund SIP',
          amount: 15000,
          category: 'Mutual Funds',
          payeeOrPayer: 'Zerodha Broking Ltd',
          frequency: 'Monthly',
          expectedDayOfMonth: 20,
          lastPaidDate: '2026-07-20',
          nextDueDate: `${selectedMonth}-20`,
          daysRemaining: 8,
          status: 'SCHEDULED',
          type: 'debit',
          autoDebit: true,
        },
        {
          id: 'preset_rent',
          title: 'Apartment House Rent',
          amount: 35000,
          category: 'Bills & Utilities',
          payeeOrPayer: 'Landlord Direct UPI',
          frequency: 'Monthly',
          expectedDayOfMonth: 1,
          lastPaidDate: '2026-07-01',
          nextDueDate: `${selectedMonth}-01`,
          daysRemaining: -2,
          status: 'OVERDUE',
          type: 'debit',
          autoDebit: false,
        },
        {
          id: 'preset_salary',
          title: 'Monthly Tech Salary',
          amount: 145000,
          category: 'Salary',
          payeeOrPayer: 'Nothing Technologies',
          frequency: 'Monthly',
          expectedDayOfMonth: 25,
          lastPaidDate: '2026-07-25',
          nextDueDate: `${selectedMonth}-25`,
          daysRemaining: 13,
          status: 'SCHEDULED',
          type: 'credit',
          autoDebit: true,
        },
      ];

      return defaultPresets.map((preset) => {
        const dueDateObj = new Date(preset.nextDueDate);
        const diffTime = dueDateObj.getTime() - referenceDateObj.getTime();
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        let st: DetectedRecurringItem['status'] = preset.status;
        if (markedPaidIds.has(preset.id)) st = 'PAID';
        else if (days < 0) st = 'OVERDUE';
        else if (days === 0) st = 'DUE_TODAY';
        else if (days <= 7) st = 'DUE_SOON';
        return { ...preset, daysRemaining: days, status: st };
      });
    }

    // Sort items: OVERDUE / DUE_TODAY / DUE_SOON first, then SCHEDULED, then PAID
    const statusPriority = { OVERDUE: 1, DUE_TODAY: 2, DUE_SOON: 3, SCHEDULED: 4, PAID: 5 };
    return items.sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);
  }, [transactions, customBills, referenceDateObj, selectedMonth, markedPaidIds]);

  // Projected Outflows & Financial Metrics for Selected Month
  const monthlyMetrics = useMemo(() => {
    const expenseItems = recurringItems.filter((i) => i.type === 'debit');
    const incomeItems = recurringItems.filter((i) => i.type === 'credit');

    const totalProjectedOutflows = expenseItems.reduce((sum, i) => sum + i.amount, 0);
    const paidOutflows = expenseItems.filter((i) => i.status === 'PAID').reduce((sum, i) => sum + i.amount, 0);
    const remainingOutflows = totalProjectedOutflows - paidOutflows;

    const totalProjectedInflows = incomeItems.reduce((sum, i) => sum + i.amount, 0);

    return {
      totalProjectedOutflows,
      paidOutflows,
      remainingOutflows,
      totalProjectedInflows,
      totalBillsCount: expenseItems.length,
    };
  }, [recurringItems]);

  // Summary Alerts
  const dueSoonCount = recurringItems.filter(
    (i) => i.status === 'OVERDUE' || i.status === 'DUE_TODAY' || i.status === 'DUE_SOON'
  ).length;

  // Monthly Calendar Math
  const calendarGrid = useMemo(() => {
    if (!selectedMonth || selectedMonth.length < 7) return { padding: 0, days: [], year: 2026, month: 8 };
    const [year, monthNum] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const firstDayOfWeek = new Date(year, monthNum - 1, 1).getDay(); // 0 = Sunday

    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return {
      padding: firstDayOfWeek,
      days: daysArray,
      year,
      month: monthNum,
    };
  }, [selectedMonth]);

  // Map day to items due on that date
  const dayBillsMap = useMemo(() => {
    const map: Record<number, DetectedRecurringItem[]> = {};
    recurringItems.forEach((item) => {
      const day = item.expectedDayOfMonth;
      if (!map[day]) map[day] = [];
      map[day].push(item);
    });
    return map;
  }, [recurringItems]);

  // Filtered List based on Filter Tabs + Selected Calendar Day
  const filteredItems = useMemo(() => {
    let result = recurringItems;

    if (selectedCalendarDay !== null) {
      result = result.filter((i) => i.expectedDayOfMonth === selectedCalendarDay);
    }

    if (filter === 'DUE_SOON') {
      return result.filter(
        (i) => i.status === 'OVERDUE' || i.status === 'DUE_TODAY' || i.status === 'DUE_SOON'
      );
    }
    if (filter === 'EXPENSE') return result.filter((i) => i.type === 'debit');
    if (filter === 'INCOME') return result.filter((i) => i.type === 'credit');
    return result;
  }, [recurringItems, filter, selectedCalendarDay]);

  // Handle Quick Log Payment
  const handleQuickLog = (item: DetectedRecurringItem) => {
    const todayStr = referenceDateObj.toISOString().substring(0, 10);
    const timeStr = new Date().toTimeString().substring(0, 5);

    const newTx: Transaction = {
      id: `recurring_log_${Date.now()}`,
      title: `${item.title} (${item.type === 'debit' ? 'Bill Payment' : 'Received'})`,
      amount: item.amount,
      type: item.type,
      category: item.category,
      subcategory: item.category || 'Recurring',
      date: todayStr,
      time: timeStr,
      payeeOrPayer: item.payeeOrPayer || item.title,
      paymentMethod: item.autoDebit ? 'AutoDebit' : 'UPI',
      source: 'UPI',
      rawText: `Recurring payment recorded for ${item.title} on ${todayStr}`,
    };

    setMarkedPaidIds((prev) => new Set([...prev, item.id]));

    if (onQuickLogTransaction) {
      onQuickLogTransaction(newTx);
    }
  };

  // Add Custom Bill Handler
  const handleAddCustomBillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newAmount) return;

    const newBill: CustomRecurringBill = {
      id: `custom_bill_${Date.now()}`,
      title: newTitle.trim(),
      amount: parseFloat(newAmount) || 0,
      category: newCategory,
      payeeOrPayer: newPayee.trim() || newTitle.trim(),
      frequency: 'Monthly',
      expectedDayOfMonth: Math.min(31, Math.max(1, parseInt(newDay, 10) || 1)),
      type: newType,
      autoDebit: newAutoDebit,
    };

    const updated = [newBill, ...customBills];
    setCustomBills(updated);
    localStorage.setItem('tmf_custom_recurring_bills', JSON.stringify(updated));

    // Reset Form
    setNewTitle('');
    setNewAmount('');
    setNewPayee('');
    setShowAddModal(false);
  };

  // Render Category Icon Helper
  const getCategoryIcon = (category: string, title: string) => {
    const cat = (category + ' ' + title).toLowerCase();
    if (cat.includes('wifi') || cat.includes('broadband') || cat.includes('internet') || cat.includes('airtel') || cat.includes('mobile')) {
      return <Wifi className="w-3.5 h-3.5 text-cyan-400" />;
    }
    if (cat.includes('mutual') || cat.includes('sip') || cat.includes('investment') || cat.includes('zerodha')) {
      return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
    }
    if (cat.includes('rent') || cat.includes('house') || cat.includes('building')) {
      return <Building className="w-3.5 h-3.5 text-amber-400" />;
    }
    if (cat.includes('stream') || cat.includes('netflix') || cat.includes('spotify') || cat.includes('tv')) {
      return <Tv className="w-3.5 h-3.5 text-purple-400" />;
    }
    if (cat.includes('insurance') || cat.includes('shield')) {
      return <Shield className="w-3.5 h-3.5 text-blue-400" />;
    }
    if (cat.includes('electric') || cat.includes('power') || cat.includes('utility') || cat.includes('gas')) {
      return <Zap className="w-3.5 h-3.5 text-yellow-400" />;
    }
    if (cat.includes('salary')) {
      return <DollarSign className="w-3.5 h-3.5 text-emerald-400" />;
    }
    return <CreditCard className="w-3.5 h-3.5 text-red-400" />;
  };

  return (
    <div className="bg-carbon border border-nothing rounded-2xl shadow-xl font-mono overflow-hidden transition-all duration-300">
      {/* Header Bar - Collapsible Trigger */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-3.5 sm:p-4 flex items-center justify-between flex-wrap gap-2.5 cursor-pointer hover:bg-[#1a1a1a] transition-colors select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-red-950/60 border border-red-600/50 flex items-center justify-center text-red-500 shrink-0 shadow-inner">
            <Repeat className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Recurring Bills & Subscriptions
              </h4>
              {dueSoonCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-950 border border-red-600/80 text-red-400 text-[9px] font-bold uppercase flex items-center gap-1 animate-pulse">
                  <AlertCircle className="w-3 h-3" />
                  {dueSoonCount} Due Soon
                </span>
              )}
            </div>
            
            {/* Quick Collapsed Summary */}
            <div className="text-[10px] text-[#888] mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{monthlyMetrics.totalBillsCount} Monthly Bills</span>
              <span>•</span>
              <span>Projected Outflow: <strong className="text-red-400">{currencySymbol}{monthlyMetrics.totalProjectedOutflows.toLocaleString('en-IN')}</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddModal(true);
            }}
            className="px-2.5 py-1.5 bg-obsidian hover:bg-[#222] border border-nothing hover:border-red-500 rounded-xl text-[10px] font-bold text-white transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3 text-red-500" />
            <span className="hidden sm:inline">Add Recurring</span>
          </button>

          <div 
            className="p-1.5 bg-obsidian border border-nothing rounded-xl text-white transition-all"
            title={isExpanded ? "Collapse Section" : "Expand Section"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4 text-red-400" /> : <ChevronDown className="w-4 h-4 text-red-400" />}
          </div>
        </div>
      </div>

      {/* Expanded Body Content */}
      {isExpanded && (
        <div className="p-3.5 sm:p-4 pt-0 space-y-4 border-t border-nothing/60 bg-carbon">
          {/* Top Month Selector & Projected Outflows Banner */}
          <div className="p-3.5 bg-obsidian border border-nothing rounded-xl space-y-3 mt-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Month Selector Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 bg-carbon border border-nothing hover:border-red-500 rounded-lg text-[#aaa] hover:text-white cursor-pointer transition-colors"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 px-3 py-1 bg-carbon border border-nothing rounded-lg">
                  <Calendar className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wide">
                    {formatMonthLabel(selectedMonth)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 bg-carbon border border-nothing hover:border-red-500 rounded-lg text-[#aaa] hover:text-white cursor-pointer transition-colors"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {selectedMonth !== currentMonthStr && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth(currentMonthStr);
                      setSelectedCalendarDay(null);
                    }}
                    className="text-[10px] text-red-400 hover:underline ml-1 cursor-pointer font-bold"
                  >
                    Reset Today
                  </button>
                )}
              </div>

              {/* View Mode Switcher (Calendar vs List) */}
              <div className="flex items-center gap-1 bg-carbon p-1 rounded-lg border border-nothing self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('CALENDAR')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'CALENDAR'
                      ? 'bg-red-600 text-white shadow'
                      : 'text-[#888] hover:text-white'
                  }`}
                >
                  <CalendarDays className="w-3 h-3" />
                  <span>Calendar View</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('LIST')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'LIST'
                      ? 'bg-red-600 text-white shadow'
                      : 'text-[#888] hover:text-white'
                  }`}
                >
                  <List className="w-3 h-3" />
                  <span>List View</span>
                </button>
              </div>
            </div>

            {/* Projected Outflows Metric Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1e1e1e]">
              <div className="p-2.5 bg-carbon border border-red-900/40 rounded-xl space-y-0.5">
                <div className="text-[9px] uppercase font-bold text-[#888]">Total Projected Outflow</div>
                <div className="text-sm sm:text-base font-bold text-red-400">
                  {currencySymbol}{monthlyMetrics.totalProjectedOutflows.toLocaleString('en-IN')}
                </div>
              </div>

              <div className="p-2.5 bg-carbon border border-emerald-900/40 rounded-xl space-y-0.5">
                <div className="text-[9px] uppercase font-bold text-[#888]">Paid Outflows</div>
                <div className="text-sm sm:text-base font-bold text-emerald-400">
                  {currencySymbol}{monthlyMetrics.paidOutflows.toLocaleString('en-IN')}
                </div>
              </div>

              <div className="p-2.5 bg-carbon border border-amber-900/40 rounded-xl space-y-0.5">
                <div className="text-[9px] uppercase font-bold text-[#888]">Remaining Pending</div>
                <div className="text-sm sm:text-base font-bold text-amber-400">
                  {currencySymbol}{monthlyMetrics.remainingOutflows.toLocaleString('en-IN')}
                </div>
              </div>

              <div className="p-2.5 bg-carbon border border-nothing rounded-xl space-y-0.5">
                <div className="text-[9px] uppercase font-bold text-[#888]">Projected Inflows</div>
                <div className="text-sm sm:text-base font-bold text-blue-400">
                  {currencySymbol}{monthlyMetrics.totalProjectedInflows.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>

          {/* ==================== MONTHLY CALENDAR VIEW ==================== */}
          {viewMode === 'CALENDAR' && (
            <div className="bg-obsidian border border-nothing p-3 sm:p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-white uppercase tracking-wider pb-1">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-red-400" />
                  <span>Monthly Bill Calendar — {formatMonthLabel(selectedMonth)}</span>
                </span>
                {selectedCalendarDay !== null && (
                  <button
                    type="button"
                    onClick={() => setSelectedCalendarDay(null)}
                    className="text-[10px] text-amber-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>Clear Filter (Day {selectedCalendarDay})</span>
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Day Headers (Sun - Sat) */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[#777] uppercase tracking-wider pb-1">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              {/* Calendar Days Grid */}
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {/* Empty Padding Cells */}
                {Array.from({ length: calendarGrid.padding }).map((_, idx) => (
                  <div key={`pad_${idx}`} className="h-12 sm:h-16 bg-carbon/20 rounded-lg border border-transparent opacity-20" />
                ))}

                {/* Days of Month */}
                {calendarGrid.days.map((dayNum) => {
                  const dayBills = dayBillsMap[dayNum] || [];
                  const isSelected = selectedCalendarDay === dayNum;
                  
                  const todayDay = referenceDateObj.getDate();
                  const isToday = selectedMonth === currentMonthStr && todayDay === dayNum;

                  const hasOverdueOrToday = dayBills.some((b) => b.status === 'OVERDUE' || b.status === 'DUE_TODAY');
                  const hasDueSoon = dayBills.some((b) => b.status === 'DUE_SOON');
                  const allPaid = dayBills.length > 0 && dayBills.every((b) => b.status === 'PAID');

                  const totalDayExpense = dayBills
                    .filter((b) => b.type === 'debit')
                    .reduce((s, b) => s + b.amount, 0);

                  return (
                    <button
                      key={`day_${dayNum}`}
                      type="button"
                      onClick={() => {
                        if (dayBills.length > 0) {
                          setSelectedCalendarDay(isSelected ? null : dayNum);
                        }
                      }}
                      className={`h-14 sm:h-18 p-1 sm:p-1.5 rounded-xl border flex flex-col justify-between text-left transition-all relative overflow-hidden ${
                        isSelected
                          ? 'border-red-500 bg-red-950/40 ring-1 ring-red-500 shadow-md'
                          : isToday
                          ? 'border-blue-500 bg-blue-950/30'
                          : dayBills.length > 0
                          ? 'bg-carbon border-nothing hover:border-[#444] cursor-pointer'
                          : 'bg-carbon/40 border-transparent text-[#555]'
                      }`}
                    >
                      {/* Top Row: Date Number & Indicator Dot */}
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-[10px] sm:text-xs font-bold font-mono ${
                          isToday ? 'text-blue-400 underline font-extrabold' : isSelected ? 'text-white' : 'text-[#aaa]'
                        }`}>
                          {dayNum}
                        </span>

                        {/* Status Dot */}
                        {dayBills.length > 0 && (
                          <div className="flex items-center gap-0.5">
                            {hasOverdueOrToday ? (
                              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            ) : hasDueSoon ? (
                              <span className="w-2 h-2 rounded-full bg-amber-400" />
                            ) : allPaid ? (
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-blue-400" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Middle/Bottom: Mini Bill Pills */}
                      {dayBills.length > 0 ? (
                        <div className="space-y-0.5 w-full mt-0.5 overflow-hidden">
                          <div className="hidden sm:block text-[9px] font-bold truncate text-white">
                            {dayBills[0].title}
                          </div>
                          <div className={`text-[9px] sm:text-[10px] font-bold ${
                            hasOverdueOrToday ? 'text-red-400' : allPaid ? 'text-emerald-400' : 'text-amber-300'
                          }`}>
                            {currencySymbol}{totalDayExpense.toLocaleString('en-IN')}
                          </div>
                          {dayBills.length > 1 && (
                            <div className="text-[8px] text-[#888] hidden sm:block">
                              +{dayBills.length - 1} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[8px] text-[#444] mt-auto hidden sm:block">—</div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend Bar */}
              <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] text-[#888] pt-2 border-t border-[#1e1e1e]">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" /> Overdue / Due Today
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400" /> Due Soon
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Paid
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400" /> Scheduled
                  </span>
                </div>

                <div className="text-[10px] text-[#777]">
                  Click a highlighted date to filter list below
                </div>
              </div>
            </div>
          )}

          {/* Filter Bar & List Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-obsidian border border-nothing rounded-xl">
            <div className="flex items-center gap-2 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[#aaa] text-[11px]">
                {selectedCalendarDay !== null 
                  ? `Bills Due on Day ${selectedCalendarDay}:` 
                  : 'Recurring Items List:'}
              </span>
              <span className="font-bold text-white">
                ({filteredItems.length} items)
              </span>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 shrink-0 scrollbar-none">
              {(['ALL', 'DUE_SOON', 'EXPENSE', 'INCOME'] as const).map((tabKey) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setFilter(tabKey)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors shrink-0 cursor-pointer ${
                    filter === tabKey
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-carbon text-[#888] hover:text-white hover:bg-[#222]'
                  }`}
                >
                  {tabKey === 'ALL'
                    ? 'All'
                    : tabKey === 'DUE_SOON'
                    ? `Due (${dueSoonCount})`
                    : tabKey === 'EXPENSE'
                    ? 'Expenses'
                    : 'Income'}
                </button>
              ))}
            </div>
          </div>

          {/* Recurring Bills List */}
          <div className="space-y-2">
            {filteredItems.length === 0 ? (
              <div className="p-6 text-center bg-obsidian rounded-xl border border-dashed border-nothing text-[#777] text-xs">
                No recurring bills found for this filter or date selection.
              </div>
            ) : (
              filteredItems.map((item) => {
                const isPaid = item.status === 'PAID';
                const isOverdue = item.status === 'OVERDUE';
                const isDueToday = item.status === 'DUE_TODAY';
                const isDueSoon = item.status === 'DUE_SOON';

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isOverdue || isDueToday
                        ? 'bg-red-950/20 border-red-600/60 hover:border-red-500'
                        : isDueSoon
                        ? 'bg-amber-950/15 border-amber-600/50 hover:border-amber-500'
                        : isPaid
                        ? 'bg-obsidian/60 border-nothing opacity-75'
                        : 'bg-obsidian border-nothing hover:border-[#333]'
                    }`}
                  >
                    {/* Left Details */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                          isOverdue || isDueToday
                            ? 'bg-red-950/80 border-red-600/60'
                            : isDueSoon
                            ? 'bg-amber-950/80 border-amber-600/60'
                            : isPaid
                            ? 'bg-emerald-950/60 border-emerald-600/50'
                            : 'bg-carbon border-nothing'
                        }`}
                      >
                        {getCategoryIcon(item.category, item.title)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white truncate">{item.title}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-carbon text-[#aaa] border border-nothing font-mono uppercase shrink-0">
                            {item.frequency}
                          </span>
                          {item.autoDebit && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-mono uppercase shrink-0">
                              AutoDebit
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[10px] text-[#888] mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-[#666]" />
                            <span>Due: <strong className="text-[#ccc]">{item.nextDueDate}</strong></span>
                          </span>

                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#666]" />
                            <span>Day {item.expectedDayOfMonth} of month</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Amount & Status Action */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1a1a1a]">
                      <div className="text-left sm:text-right">
                        <div
                          className={`text-sm font-bold tracking-tight ${
                            item.type === 'credit'
                              ? 'text-emerald-400'
                              : isOverdue || isDueToday
                              ? 'text-red-400'
                              : 'text-white'
                          }`}
                        >
                          {item.type === 'credit' ? '+' : '-'}{currencySymbol}
                          {item.amount.toLocaleString('en-IN')}
                        </div>

                        {/* Status Label Tag */}
                        <div className="mt-0.5">
                          {isPaid ? (
                            <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1 sm:justify-end">
                              <CheckCircle2 className="w-3 h-3" /> Paid
                            </span>
                          ) : isOverdue ? (
                            <span className="text-[9px] font-bold text-red-500 flex items-center gap-1 sm:justify-end animate-pulse">
                              <AlertCircle className="w-3 h-3" /> Overdue ({Math.abs(item.daysRemaining)}d)
                            </span>
                          ) : isDueToday ? (
                            <span className="text-[9px] font-bold text-amber-400 flex items-center gap-1 sm:justify-end">
                              <AlertCircle className="w-3 h-3" /> Due Today
                            </span>
                          ) : isDueSoon ? (
                            <span className="text-[9px] font-bold text-amber-400 flex items-center gap-1 sm:justify-end">
                              <Clock className="w-3 h-3" /> Due in {item.daysRemaining} days
                            </span>
                          ) : (
                            <span className="text-[9px] text-[#777] sm:justify-end block">
                              In {item.daysRemaining} days
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick Log Payment Button */}
                      {!isPaid && (
                        <button
                          type="button"
                          onClick={() => handleQuickLog(item)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                            isOverdue || isDueToday
                              ? 'bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-950/50'
                              : isDueSoon
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-[#222] hover:bg-[#333] border border-[#444] text-white'
                          }`}
                          title={`Click to record ${item.title} transaction`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{item.type === 'debit' ? 'Log Payment' : 'Log Credit'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Redirect / View All Footer link */}
          {onNavigateToTransactions && (
            <div className="pt-2 flex items-center justify-between text-[11px] text-[#777]">
              <span>Active tracking based on transaction history & schedule</span>
              <button
                type="button"
                onClick={onNavigateToTransactions}
                className="text-red-400 hover:text-red-300 font-bold hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>View All Transactions</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal: Add Custom Recurring Bill */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-carbon border border-nothing w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl relative font-mono text-white">
            <div className="flex items-center justify-between pb-3 border-b border-nothing">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Add Custom Recurring Bill</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-[#888] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomBillSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-[#aaa] mb-1">Bill / Subscription Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gym Membership, WiFi Bill"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-obsidian border border-nothing rounded-xl px-3 py-2 text-white placeholder-[#555] focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#aaa] mb-1">Amount ({currencySymbol}) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="1500"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full bg-obsidian border border-nothing rounded-xl px-3 py-2 text-white placeholder-[#555] focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#aaa] mb-1">Due Day of Month *</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={newDay}
                    onChange={(e) => setNewDay(e.target.value)}
                    className="w-full bg-obsidian border border-nothing rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#aaa] mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-obsidian border border-nothing rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="Bills & Utilities">Bills & Utilities</option>
                    <option value="Subscriptions">Subscriptions</option>
                    <option value="Food & Dining">Food & Dining</option>
                    <option value="Transport & Fuel">Transport & Fuel</option>
                    <option value="Mutual Funds">Mutual Funds</option>
                    <option value="Salary">Salary</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#aaa] mb-1">Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as 'debit' | 'credit')}
                    className="w-full bg-obsidian border border-nothing rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="debit">Expense (Debit)</option>
                    <option value="credit">Income (Credit)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-[#aaa] mb-1">Payee / Merchant Name</label>
                <input
                  type="text"
                  placeholder="e.g. Gold's Gym"
                  value={newPayee}
                  onChange={(e) => setNewPayee(e.target.value)}
                  className="w-full bg-obsidian border border-nothing rounded-xl px-3 py-2 text-white placeholder-[#555] focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoDebitCheck"
                  checked={newAutoDebit}
                  onChange={(e) => setNewAutoDebit(e.target.checked)}
                  className="rounded border-nothing bg-obsidian text-red-600 focus:ring-0"
                />
                <label htmlFor="autoDebitCheck" className="text-[11px] text-[#ccc] cursor-pointer">
                  Auto-Debit / NACH enabled for this bill
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-nothing">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 bg-obsidian border border-nothing text-[#aaa] hover:text-white rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Recurring Bill</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
