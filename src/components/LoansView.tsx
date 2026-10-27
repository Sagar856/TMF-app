import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LoanRecord, Repayment, UserSettings, FinancialAccount, LoanStructure, LoanInstallment } from '../types/finance';
import { X, Search, Plus, SlidersHorizontal, ChevronDown, ChevronUp, Layers, TrendingDown, TrendingUp, Wallet, FileText, MoreVertical, Eye, EyeOff, AlertTriangle, Calendar, Percent, Building2, CheckCircle2 } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { InfoButton } from './InfoButton';
import { LoanScheduleModal } from './LoanScheduleModal';
import { generateAmortizationSchedule, roundCurrency } from '../services/financialCalculations';
import { newId } from '../utils/ids';
import { todayLocalISO, addMonthsClamped } from '../utils/dates';
import { getEffectiveLoanStatus } from '../utils/loanStatus';

interface LoansViewProps {
  loans: LoanRecord[];
  accounts?: FinancialAccount[];
  onAddLoan: (loan: LoanRecord, accountId?: string, recordInLedger?: boolean) => void;
  onRecordRepayment: (loanId: string, repayment: Repayment, accountId?: string, recordInLedger?: boolean) => void;
  onSettleLoan?: (loanId: string, accountId?: string, recordInLedger?: boolean) => void;
  onDeleteLoan?: (loanId: string) => void;
  onUpdateLoan?: (loan: LoanRecord) => void;
  onConfirmInstallmentPayment?: (
    loanId: string,
    installmentNumber: number,
    paymentAccountId: string,
    amount: number,
    paidDate: string,
    notes?: string
  ) => void;
  onSkipInstallment?: (loanId: string, installmentNumber: number) => void;
  currencySymbol: string;
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
}

export const LoansView: React.FC<LoansViewProps> = ({
  loans,
  accounts = [],
  onAddLoan,
  onRecordRepayment,
  onSettleLoan,
  onDeleteLoan,
  onUpdateLoan,
  onConfirmInstallmentPayment,
  onSkipInstallment,
  currencySymbol,
  settings,
  onUpdateSettings,
}) => {
  // Deletion modal states
  const [loanToDelete, setLoanToDelete] = useState<LoanRecord | null>(null);
  const [doNotAskAgainChecked, setDoNotAskAgainChecked] = useState<boolean>(false);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState<boolean>(false);
  const [selectedPerson, setSelectedPerson] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  // State for expanded payment histories in table
  const [expandedLoanIds, setExpandedLoanIds] = useState<string[]>(['loan_swapnil']);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [repayModalLoan, setRepayModalLoan] = useState<LoanRecord | null>(null);
  const [settleModalLoan, setSettleModalLoan] = useState<LoanRecord | null>(null);
  const [editModalLoan, setEditModalLoan] = useState<LoanRecord | null>(null);
  const [selectedScheduleLoan, setSelectedScheduleLoan] = useState<LoanRecord | null>(null);

  // Advanced Add Loan Form State
  const [loanStructure, setLoanStructure] = useState<LoanStructure>('standard_emi');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newPerson, setNewPerson] = useState<string>('');
  const [newTotalAmount, setNewTotalAmount] = useState<string>('');
  const [newDownPayment, setNewDownPayment] = useState<string>('0');
  const [newAnnualRate, setNewAnnualRate] = useState<string>('9.5');
  const [newTenureMonths, setNewTenureMonths] = useState<string>('12');
  const [newProcessingFees, setNewProcessingFees] = useState<string>('0');
  const [newDiscounts, setNewDiscounts] = useState<string>('0');
  const [newManualEmi, setNewManualEmi] = useState<string>('');
  const [newLinkedAccountId, setNewLinkedAccountId] = useState<string>(accounts[0]?.id || '');
  const [newRecordInLedger, setNewRecordInLedger] = useState<boolean>(true);
  const [newDueDate, setNewDueDate] = useState<string>(todayLocalISO());
  const [newFirstInstallmentDate, setNewFirstInstallmentDate] = useState<string>(() => {
    return addMonthsClamped(todayLocalISO(), 1);
  });
  const [newNotes, setNewNotes] = useState<string>('');
  const [newType, setNewType] = useState<'loan' | 'lend'>('loan');

  // Repayment form
  const [repayAmount, setRepayAmount] = useState<string>('');
  const [repayNote, setRepayNote] = useState<string>('');
  const [repayDate, setRepayDate] = useState<string>(todayLocalISO());
  const [repayAccountId, setRepayAccountId] = useState<string>('');
  const [repayRecordLedger, setRepayRecordLedger] = useState<boolean>(true);

  // Settle form
  const [settleAccountId, setSettleAccountId] = useState<string>('');
  const [settleRecordLedger, setSettleRecordLedger] = useState<boolean>(true);

  // Edit loan form
  const [editPerson, setEditPerson] = useState<string>('');
  const [editTotalAmount, setEditTotalAmount] = useState<string>('');
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editType, setEditType] = useState<'loan' | 'lend'>('lend');

  // Collapsible Filters State
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [isKpiStacked, setIsKpiStacked] = useState<boolean>(true);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [showOwedToMe, setShowOwedToMe] = useState<boolean>(true);
  const [showIowe, setShowIowe] = useState<boolean>(true);
  const [showOpenRecords, setShowOpenRecords] = useState<boolean>(true);
  const [showNetPosition, setShowNetPosition] = useState<boolean>(true);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - touchStartY;
    if (diffY > 25) {
      // Swiped down -> Expand vertically
      setIsKpiStacked(false);
    } else if (diffY < -25) {
      // Swiped up -> Stack vertically with overlap
      setIsKpiStacked(true);
    }
    setTouchStartY(null);
  };

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

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedPerson !== 'All') count++;
    if (selectedType !== 'All') count++;
    if (selectedStatus !== 'All') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedPerson, selectedType, selectedStatus, searchQuery]);

  // Unique list of person names for dropdown
  const uniquePersons = useMemo(() => {
    const set = new Set<string>();
    loans.forEach((l) => {
      if (l.personOrBank) set.add(l.personOrBank.trim());
    });
    return Array.from(set).sort();
  }, [loans]);

  // Filtered Loans
  const filteredLoans = useMemo(() => {
    return loans.filter((item) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPerson = item.personOrBank.toLowerCase().includes(q);
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesNotes = item.notes?.toLowerCase().includes(q) || false;
        if (!matchesPerson && !matchesTitle && !matchesNotes) return false;
      }

      // Person filter
      if (selectedPerson !== 'All' && item.personOrBank !== selectedPerson) {
        return false;
      }

      // Type filter
      if (selectedType !== 'All') {
        if (selectedType === 'Lend' && item.type !== 'lend') return false;
        if (selectedType === 'Loan' && item.type !== 'loan') return false;
      }

      // Status filter
      if (selectedStatus !== 'All') {
        const today = todayLocalISO();
        const effStatus = getEffectiveLoanStatus(item, today);
        if (selectedStatus === 'Open' && effStatus === 'repaid') return false;
        if (selectedStatus === 'Closed' && effStatus !== 'repaid') return false;
        if (selectedStatus === 'Overdue' && effStatus !== 'overdue') return false;
      }

      return true;
    });
  }, [loans, searchQuery, selectedPerson, selectedType, selectedStatus]);

  // KPI Calculations
  const totalIowe = useMemo(() => {
    return loans
      .filter((l) => l.type === 'loan' && l.remainingAmount > 0)
      .reduce((sum, l) => sum + l.remainingAmount, 0);
  }, [loans]);

  const totalOwedToMe = useMemo(() => {
    return loans
      .filter((l) => l.type === 'lend' && l.remainingAmount > 0)
      .reduce((sum, l) => sum + l.remainingAmount, 0);
  }, [loans]);

  const netPosition = totalOwedToMe - totalIowe;

  const openCount = useMemo(() => {
    const today = todayLocalISO();
    return loans.filter((l) => getEffectiveLoanStatus(l, today) !== 'repaid').length;
  }, [loans]);

  // Outstanding by Person calculation for the Visual chart
  const personOutstandingData = useMemo(() => {
    const map = new Map<string, number>();

    // Gather all unique persons
    loans.forEach((l) => {
      const p = l.personOrBank.trim();
      if (!map.has(p)) map.set(p, 0);
      if (l.type === 'lend') {
        map.set(p, (map.get(p) || 0) + l.remainingAmount);
      } else {
        map.set(p, (map.get(p) || 0) - l.remainingAmount);
      }
    });

    const list = Array.from(map.entries()).map(([person, outstanding]) => ({
      person,
      outstanding,
    }));

    // Find max outstanding for scaling
    const maxVal = Math.max(...list.map((d) => Math.abs(d.outstanding)), 20000);

    return { list, maxVal };
  }, [loans]);

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

  const toggleExpand = (id: string) => {
    setExpandedLoanIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleOpenRepayModal = (loan: LoanRecord) => {
    setRepayModalLoan(loan);
    setRepayAmount('');
    setRepayNote('');
    setRepayDate(todayLocalISO());
    setRepayAccountId(loan.linkedAccountId || accounts[0]?.id || '');
    setRepayRecordLedger(true);
  };

  const handleSaveRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayModalLoan) return;

    const amt = parseFloat(repayAmount);
    if (isNaN(amt) || amt <= 0) return;

    const repayment: Repayment = {
      id: newId('rep'),
      amount: amt,
      date: repayDate || todayLocalISO(),
      note: repayNote.trim() || 'Partial repayment',
    };

    onRecordRepayment(repayModalLoan.id, repayment, repayAccountId || undefined, repayRecordLedger);
    setRepayModalLoan(null);
  };

  const handleOpenSettleModal = (loan: LoanRecord) => {
    setSettleModalLoan(loan);
    setSettleAccountId(loan.linkedAccountId || accounts[0]?.id || '');
    setSettleRecordLedger(true);
  };

  const handleConfirmSettle = () => {
    if (!settleModalLoan) return;
    onSettleLoan?.(settleModalLoan.id, settleAccountId || undefined, settleRecordLedger);
    setSettleModalLoan(null);
  };

  const handleDeleteLoan = (loan: LoanRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (settings.skipLoanDeleteConfirmation) {
      onDeleteLoan?.(loan.id);
    } else {
      setLoanToDelete(loan);
      setDoNotAskAgainChecked(false);
    }
  };

  const handleConfirmDeleteLoan = () => {
    if (!loanToDelete) return;
    if (doNotAskAgainChecked) {
      onUpdateSettings({
        ...settings,
        skipLoanDeleteConfirmation: true,
      });
    }
    onDeleteLoan?.(loanToDelete.id);
    setLoanToDelete(null);
  };

  const handleOpenEditModal = (loan: LoanRecord) => {
    setEditModalLoan(loan);
    setEditPerson(loan.personOrBank);
    setEditTotalAmount(loan.totalAmount.toString());
    setEditDueDate(loan.dueDate || '');
    setEditNotes(loan.notes || '');
    setEditType(loan.type);
  };

  const handleSaveEditLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalLoan) return;

    const amt = parseFloat(editTotalAmount);
    if (isNaN(amt) || amt <= 0) return;

    const paid = editModalLoan.totalAmount - editModalLoan.remainingAmount;
    const newRemaining = Math.max(0, amt - paid);

    const updated: LoanRecord = {
      ...editModalLoan,
      personOrBank: editPerson.trim(),
      totalAmount: amt,
      remainingAmount: newRemaining,
      dueDate: editDueDate,
      notes: editNotes.trim(),
      type: editType,
      status: newRemaining === 0 ? 'repaid' : 'active',
    };

    if (onUpdateLoan) {
      onUpdateLoan(updated);
    }
    setEditModalLoan(null);
  };

  const isPeer = loanStructure === 'peer_lend' || loanStructure === 'peer_loan';
  const parsedTotal = parseFloat(newTotalAmount) || 0;
  const parsedDownPayment = parseFloat(newDownPayment) || 0;
  const parsedRate = loanStructure === 'no_cost_emi' ? 0 : (parseFloat(newAnnualRate) || 0);
  const parsedTenure = parseInt(newTenureMonths, 10) || 12;
  const parsedOverrideEmi = newManualEmi ? parseFloat(newManualEmi) : undefined;
  const parsedFees = parseFloat(newProcessingFees) || 0;
  const parsedDiscounts = parseFloat(newDiscounts) || 0;

  const financedPrincipal = Math.max(
    0,
    parsedTotal - (loanStructure === 'down_payment_emi' ? parsedDownPayment : 0)
  );

  const emiPreview = useMemo(() => {
    if (isPeer || financedPrincipal <= 0) return null;
    return generateAmortizationSchedule({
      principal: financedPrincipal,
      annualInterestRate: parsedRate,
      tenureMonths: parsedTenure,
      loanStructure,
      emiOverride: parsedOverrideEmi,
      firstInstallmentDate: newFirstInstallmentDate,
      processingFees: parsedFees,
    });
  }, [
    isPeer,
    financedPrincipal,
    parsedRate,
    parsedTenure,
    loanStructure,
    parsedOverrideEmi,
    newFirstInstallmentDate,
    parsedFees,
  ]);

  const handleSaveNewLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedTotal <= 0 || !newPerson.trim()) return;

    const effectiveType = loanStructure === 'peer_lend' ? 'lend' : 'loan';
    const effectiveTitle =
      newTitle.trim() ||
      (effectiveType === 'lend'
        ? `Lent to ${newPerson.trim()}`
        : `${loanStructure === 'no_cost_emi' ? 'No-Cost EMI: ' : ''}${newPerson.trim()}`);

    let loanSchedule: LoanInstallment[] = [];
    let monthlyEmi = 0;
    let expectedEmi = 0;
    let isOverridden = false;
    let emiDiff = 0;

    if (!isPeer && emiPreview) {
      loanSchedule = emiPreview.schedule;
      monthlyEmi = emiPreview.monthlyEmi;
      expectedEmi = emiPreview.calculatedEmi;
      isOverridden = emiPreview.isOverridden;
      emiDiff = emiPreview.emiDifference;
    }

    const newLoan: LoanRecord = {
      id: newId('loan'),
      title: effectiveTitle,
      personOrBank: newPerson.trim(),
      type: effectiveType,
      loanStructure,
      totalAmount: isPeer ? parsedTotal : financedPrincipal,
      remainingAmount: isPeer ? parsedTotal : financedPrincipal,
      totalPurchasePrice: parsedTotal,
      downPayment: loanStructure === 'down_payment_emi' ? parsedDownPayment : 0,
      financedPrincipal: isPeer ? parsedTotal : financedPrincipal,
      interestRate: parsedRate,
      tenureMonths: parsedTenure,
      repaymentFrequency: 'Monthly',
      monthlyEmi,
      expectedEmi,
      isEmiOverridden: isOverridden,
      emiOverrideDifference: emiDiff,
      processingFees: parsedFees,
      discounts: parsedDiscounts,
      startDate: newDueDate,
      dueDate: isPeer ? newDueDate : newFirstInstallmentDate,
      firstInstallmentDate: newFirstInstallmentDate,
      linkedAccountId: newLinkedAccountId || undefined,
      interestCalculationMethod:
        loanStructure === 'no_cost_emi'
          ? 'no_cost'
          : loanStructure === 'interest_only'
          ? 'interest_only'
          : 'reducing_balance',
      schedule: loanSchedule,
      status: 'active',
      repayments: [],
      notes: newNotes.trim(),
    };

    onAddLoan(newLoan, newLinkedAccountId || undefined, newRecordInLedger);
    setIsAddModalOpen(false);

    // Reset form
    setNewTitle('');
    setNewPerson('');
    setNewTotalAmount('');
    setNewDownPayment('0');
    setNewAnnualRate('9.5');
    setNewTenureMonths('12');
    setNewManualEmi('');
    setNewProcessingFees('0');
    setNewDiscounts('0');
    setNewDueDate(todayLocalISO());
    setNewNotes('');
    setLoanStructure('standard_emi');
    setNewRecordInLedger(true);
  };

  // Active loans for top section
  const today = todayLocalISO();
  const activeFilteredLoans = filteredLoans.filter(
    (l) => getEffectiveLoanStatus(l, today) !== 'repaid'
  );

  // Dynamic X-axis ticks for graph
  const maxVal = personOutstandingData.maxVal;
  const tickStep = Math.ceil(maxVal / 4 / 5000) * 5000 || 5000;
  const ticks = [0, tickStep, tickStep * 2, tickStep * 3, tickStep * 4];

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
              placeholder="Search person, notes..."
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
          <div className="flex items-center gap-2 shrink-0">
            <h2 className="text-xs sm:text-sm font-mono font-bold text-white uppercase tracking-wider">
              LOANS & LENDS
            </h2>
            <InfoButton
              id="loans-page-info"
              title="Loans & Lends"
              content="Track funds lent to friends or borrowed from creditors, record partial repayments, and monitor outstanding balances."
              align="left"
            />
          </div>
        )}

        {/* Right Action Icons (Search Icon, Filter Icon, Three-Dot Menu) */}
        <div className="flex items-center gap-2 shrink-0">
          {!isSearchExpanded && (
            <button
              type="button"
              onClick={() => setIsSearchExpanded(true)}
              title="Search Loans & Lends"
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
                    setNewPerson('');
                    setNewTotalAmount('');
                    setNewDueDate(todayLocalISO());
                    setNewNotes('');
                    setNewType('lend');
                    setIsAddModalOpen(true);
                    setShowThreeDotMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-[#eee] hover:bg-[#222] hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-red-500" />
                  <span>Add Loan/Lend</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== COLLAPSIBLE FILTERS PANEL ==================== */}
      {isFilterOpen && (
        <div className="bg-[#111111] border border-[#222] rounded-xl p-4 space-y-4 relative z-30">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  PERSON / BANK
                </label>
                <select
                  value={selectedPerson}
                  onChange={(e) => setSelectedPerson(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="All">All Persons</option>
                  {uniquePersons.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  RECORD TYPE
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="All">All Types</option>
                  <option value="Lend">Lend</option>
                  <option value="Loan">Loan</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  STATUS
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="All">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
            </div>

            {/* Reset Filter Button */}
            {activeFilterCount > 0 && (
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPerson('All');
                    setSelectedType('All');
                    setSelectedStatus('All');
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

      {/* ==================== EMPTY STATE IF NO LOANS ==================== */}
      {loans.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No Loans or Lends"
          description="Keep track of money you've lent to friends or borrowed from banks and institutions."
          actionLabel="Add Loan / Lend"
          onAction={() => setIsAddModalOpen(true)}
        />
      )}

      {/* ==================== KPI CARDS ==================== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-[#888]">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-red-500" />
            <span className="uppercase font-bold tracking-wider text-white">LOAN METRICS</span>
            <InfoButton
              id="loan-metrics-info"
              title="Loan Metrics"
              content="Key liability indicators: total amount owed to you, debts you owe to creditors, active loan count, and overall net debt position."
              align="left"
            />
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

        {/* Vertical Stack / Expanded Container with Touch Swipe Support */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`transition-all duration-300 ease-in-out ${
            isKpiStacked
              ? 'space-y-[-50px] sm:space-y-[-54px] pt-1 pb-2 max-w-2xl mx-auto'
              : 'space-y-2.5 sm:space-y-3'
          }`}
        >
          {/* 1. OWED TO ME */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-emerald-500 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-40 scale-100 shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-bold text-white tracking-wider">Owed to Me</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowOwedToMe(!showOwedToMe);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showOwedToMe ? "Hide amount" : "Show amount"}
              >
                {showOwedToMe ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-emerald-400 tracking-tight">
                {showOwedToMe ? `${currencySymbol}${totalOwedToMe.toLocaleString('en-IN')}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#aaa]">
                Assets / Receivables
              </div>
            </div>
          </div>

          {/* 2. I OWE */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-red-500 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-30 scale-[0.98] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className="font-bold text-white tracking-wider">I Owe</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowIowe(!showIowe);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showIowe ? "Hide amount" : "Show amount"}
              >
                {showIowe ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-red-500 tracking-tight">
                {showIowe ? `${currencySymbol}${totalIowe.toLocaleString('en-IN')}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#aaa]">
                Liabilities / Payables
              </div>
            </div>
          </div>

          {/* 3. OPEN RECORDS */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-purple-400 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-20 scale-[0.96] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="font-bold text-white tracking-wider">Open Records</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowOpenRecords(!showOpenRecords);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showOpenRecords ? "Hide amount" : "Show amount"}
              >
                {showOpenRecords ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight">
                {showOpenRecords ? openCount : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#aaa]">
                Active loans/lends
              </div>
            </div>
          </div>

          {/* 4. NET POSITION */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-cyan-400 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-10 scale-[0.94] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="font-bold text-white tracking-wider">Net Position</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNetPosition(!showNetPosition);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showNetPosition ? "Hide amount" : "Show amount"}
              >
                {showNetPosition ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className={`text-base sm:text-lg lg:text-xl font-bold tracking-tight ${
                netPosition >= 0 ? 'text-emerald-400' : 'text-red-500'
              }`}>
                {showNetPosition ? `${currencySymbol}${netPosition.toLocaleString('en-IN')}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#aaa]">
                {netPosition >= 0 ? 'Net Surplus' : 'Net Deficit'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== VISUALS: OUTSTANDING BY PERSON ==================== */}
      <div className="bg-[#111111] border border-[#222] p-4 sm:p-5 rounded-2xl space-y-4">
        <div className="text-[10px] font-mono font-bold text-[#777] uppercase tracking-widest flex items-center gap-2">
          <span>OUTSTANDING BY PERSON</span>
          <InfoButton
            id="outstanding-by-person-info"
            title="Outstanding by Person"
            content="Visual distribution of remaining balances owed across counterparties."
            align="left"
          />
        </div>

        <div className="space-y-3 pt-2">
          {personOutstandingData.list.map(({ person, outstanding }) => {
            const widthPct = Math.min(
              100,
              Math.max(0, (outstanding / personOutstandingData.maxVal) * 100)
            );

            return (
              <div key={person} className="flex items-center gap-3 text-xs font-mono">
                {/* Person label */}
                <div className="w-28 sm:w-32 text-right text-[#aaa] text-[11px] leading-tight truncate shrink-0">
                  {person}
                </div>

                {/* Bar Track */}
                <div className="flex-1 bg-transparent h-4 relative flex items-center">
                  <div
                    className="h-2.5 bg-[#10b981] rounded-sm transition-all duration-300"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* X-Axis Ticks */}
        <div className="pt-2 border-t border-[#1c1c1c] flex justify-between text-[10px] font-mono text-[#555] pl-28 sm:pl-32">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>

      {/* ==================== ACTIVE LOANS & LENDS ==================== */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-xs font-mono font-bold text-[#888] uppercase tracking-[0.2em]">
            ACTIVE LOANS & LENDS
          </h3>
          <InfoButton
            id="active-loans-info"
            title="Active Loans & Lends"
            content="Detailed cards for each active loan/lend showing repayment progress, installments, and settlement actions."
            align="left"
          />
        </div>

        {activeFilteredLoans.length === 0 ? (
          <div className="bg-[#111111] border border-[#222] p-6 rounded-2xl text-center text-xs font-mono text-[#666]">
            No active loans or lends match your filter.
          </div>
        ) : (
          <div className="space-y-4">
            {activeFilteredLoans.map((item) => {
              const paidAmount = item.totalAmount - item.remainingAmount;
              const progressPercent =
                item.totalAmount > 0
                  ? Math.min(100, Math.round((paidAmount / item.totalAmount) * 100))
                  : 100;

              return (
                <div
                  key={item.id}
                  className="bg-[#111111] border border-[#222] p-4 sm:p-5 rounded-2xl space-y-3 relative"
                >
                  {/* Header row */}
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {item.loanStructure && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#1a1a24] text-red-400 border border-red-900/60">
                            {item.loanStructure === 'no_cost_emi'
                              ? 'No-Cost EMI (0% Int)'
                              : item.loanStructure === 'down_payment_emi'
                              ? 'Down Payment + EMI'
                              : item.loanStructure === 'interest_only'
                              ? 'Interest-Only'
                              : item.loanStructure === 'standard_emi'
                              ? 'Standard EMI'
                              : item.type === 'lend'
                              ? 'Peer Lend'
                              : 'Peer Loan'}
                          </span>
                        )}
                        {(() => {
                          const eff = getEffectiveLoanStatus(item, today);
                          if (eff === 'overdue') {
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-red-950/80 text-red-400 border border-red-600 animate-pulse">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                OVERDUE
                              </span>
                            );
                          }
                          if (eff === 'repaid') {
                            return (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-950/60 text-emerald-400 border border-emerald-600/60">
                                CLOSED
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white font-mono">
                        <span
                          className={
                            item.type === 'lend'
                              ? 'text-emerald-400 font-bold uppercase'
                              : 'text-red-500 font-bold uppercase'
                          }
                        >
                          {item.type === 'lend' ? 'LENT TO' : 'BORROWED FROM'}
                        </span>
                        <span className="font-bold text-sm text-white">{item.personOrBank}</span>
                        {item.title && item.title !== item.personOrBank && (
                          <span className="text-xs text-[#aaa]">({item.title})</span>
                        )}
                        <span className="text-[#777] text-xs ml-1">
                          {formatDateDisplay(item.dueDate || item.date)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base sm:text-lg font-bold font-mono text-white">
                        {currencySymbol}{item.remainingAmount.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] font-mono text-[#666]">
                        of {currencySymbol}{item.totalAmount.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-[#1c1c1c] h-1.5 rounded-full overflow-hidden my-2">
                    <div
                      className="h-full bg-red-600 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Repaid info */}
                  <div className="flex items-center justify-between text-xs font-mono text-[#888]">
                    <span>
                      {currencySymbol}{paidAmount.toLocaleString('en-IN')} repaid ({progressPercent}%)
                    </span>
                    {item.monthlyEmi && item.monthlyEmi > 0 && (
                      <span className="text-white font-bold">
                        EMI: {currencySymbol}{item.monthlyEmi.toLocaleString('en-IN')}/mo
                      </span>
                    )}
                  </div>

                  {/* Notes if present */}
                  {item.notes && (
                    <div className="text-xs font-mono text-[#888] italic">
                      "{item.notes}"
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {item.schedule && item.schedule.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedScheduleLoan(item)}
                        className="px-3 py-1 bg-red-950/70 border border-red-700/80 text-red-400 hover:bg-red-900/70 font-mono font-bold text-[11px] uppercase rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          SCHEDULE ({item.schedule.filter((s) => s.status === 'paid').length}/
                          {item.schedule.length})
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenRepayModal(item)}
                      className="px-3 py-1 bg-transparent border border-emerald-600/80 text-emerald-400 hover:bg-emerald-950/40 font-mono font-bold text-[11px] uppercase rounded transition-colors cursor-pointer"
                    >
                      ADD PAYMENT
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenSettleModal(item)}
                      className="px-3 py-1 bg-transparent border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] font-mono text-[11px] uppercase rounded transition-colors cursor-pointer"
                    >
                      SETTLE
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(item)}
                      className="px-3 py-1 bg-transparent border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] font-mono text-[11px] uppercase rounded transition-colors cursor-pointer"
                    >
                      EDIT
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteLoan(item)}
                      className="px-3 py-1 bg-transparent border border-red-900/80 text-red-500 hover:bg-red-950/40 font-mono text-[11px] uppercase rounded transition-colors cursor-pointer"
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ==================== ALL LOANS & LENDS ==================== */}
      <div>
        <h3 className="text-xs font-mono font-bold text-[#888] uppercase tracking-[0.2em] mb-4">
          ALL LOANS & LENDS
        </h3>

        <div className="bg-[#111111] border border-[#222] rounded-2xl overflow-x-auto">
          <div className="min-w-[860px]">
            {/* Table Header */}
            <div className="grid grid-cols-12 px-4 py-3 border-b border-[#222] text-[#666] text-[10px] font-bold uppercase tracking-wider bg-[#0a0a0a]">
              <div className="col-span-2">DATE</div>
              <div className="col-span-1">TYPE</div>
              <div className="col-span-2">PERSON</div>
              <div className="col-span-2 text-right">PRINCIPAL</div>
              <div className="col-span-2 text-right">OUTSTANDING</div>
              <div className="col-span-1 text-center">STATUS</div>
              <div className="col-span-2 text-right">ACTIONS</div>
            </div>

            {/* Table Body */}
            {filteredLoans.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#666]">
                No records found matching current criteria.
              </div>
            ) : (
              filteredLoans.map((item) => {
                const isExpanded = expandedLoanIds.includes(item.id);
                const paidAmount = item.totalAmount - item.remainingAmount;
                const effStatus = getEffectiveLoanStatus(item, today);
                const isClosed = effStatus === 'repaid';

                return (
                  <React.Fragment key={item.id}>
                    {/* Parent Row */}
                    <div className="grid grid-cols-12 px-4 py-3 border-b border-[#1a1a1a] items-center text-xs text-white hover:bg-[#161616] transition-colors">
                      {/* Date with expand toggle */}
                      <div
                        onClick={() => toggleExpand(item.id)}
                        className="col-span-2 flex items-center gap-1 cursor-pointer select-none hover:text-red-400 transition-colors"
                      >
                        <span className="text-[10px] text-[#666]">
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        <span>{formatDateDisplay(item.dueDate || item.date)}</span>
                      </div>

                      {/* Type */}
                      <div className="col-span-1 font-bold">
                        <span className={item.type === 'lend' ? 'text-emerald-400' : 'text-red-500'}>
                          {item.type === 'lend' ? 'Lent' : 'Borrowed'}
                        </span>
                      </div>

                      {/* Person */}
                      <div className="col-span-2 font-bold text-white truncate pr-2">
                        {item.personOrBank}
                      </div>

                      {/* Principal */}
                      <div className="col-span-2 text-right font-mono">
                        {currencySymbol}{item.totalAmount.toLocaleString('en-IN')}
                      </div>

                      {/* Outstanding */}
                      <div className="col-span-2 text-right font-bold font-mono">
                        {currencySymbol}{item.remainingAmount.toLocaleString('en-IN')}
                      </div>

                      {/* Status */}
                      <div className="col-span-1 text-center font-bold text-[11px]">
                        {effStatus === 'repaid' ? (
                          <span className="text-emerald-400">CLOSED</span>
                        ) : effStatus === 'overdue' ? (
                          <span className="text-red-500 flex items-center justify-center gap-0.5">
                            <AlertTriangle className="w-3 h-3 inline text-red-500 shrink-0" />
                            OVERDUE
                          </span>
                        ) : (
                          <span className="text-amber-400">OPEN</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex justify-end items-center gap-1.5 shrink-0">
                        {item.schedule && item.schedule.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedScheduleLoan(item);
                            }}
                            className="px-2 py-1 bg-red-950/60 border border-red-700/80 text-red-400 hover:bg-red-900/60 text-[10px] uppercase font-bold rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                            title="View Amortization Schedule"
                          >
                            <Calendar className="w-3 h-3" />
                            <span>SCHED</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditModal(item);
                          }}
                          className="px-2 py-1 border border-[#333] hover:border-white text-[#aaa] hover:text-white text-[10px] uppercase font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          EDIT
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteLoan(item, e)}
                          className="px-2 py-1 border border-red-900/80 hover:border-red-500 text-red-500 hover:text-red-300 hover:bg-red-950/40 text-[10px] uppercase font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          DEL
                        </button>
                      </div>
                    </div>

                    {/* Expanded Sub-Table: PAYMENT HISTORY */}
                    {isExpanded && (
                      <div className="bg-[#0a0a0a] border-b border-[#222] px-6 py-4 space-y-3">
                        <div className="text-[10px] font-bold tracking-widest text-[#777] uppercase">
                          PAYMENT HISTORY – {item.personOrBank.toUpperCase()}
                        </div>

                        {item.repayments && item.repayments.length > 0 ? (
                          <div className="space-y-1 text-xs font-mono">
                            <div className="grid grid-cols-12 text-[#666] text-[10px] uppercase font-bold border-b border-[#1c1c1c] pb-1">
                              <div className="col-span-3">DATE</div>
                              <div className="col-span-3">AMOUNT</div>
                              <div className="col-span-3">REFERENCE</div>
                              <div className="col-span-3">NOTE</div>
                            </div>

                            {item.repayments.map((rep) => (
                              <div
                                key={rep.id}
                                className="grid grid-cols-12 text-[#aaa] py-1 border-b border-[#151515] items-center"
                              >
                                <div className="col-span-3">{formatDateDisplay(rep.date)}</div>
                                <div className="col-span-3 font-bold text-emerald-400">
                                  {currencySymbol}{rep.amount.toLocaleString('en-IN')}
                                </div>
                                <div className="col-span-3 text-[#666]">—</div>
                                <div className="col-span-3 text-[#888]">{rep.note || '—'}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-[#666] italic font-mono py-1">
                            No payments recorded yet.
                          </div>
                        )}

                        {/* Summary footer */}
                        <div className="text-xs font-mono pt-2 border-t border-[#1a1a1a]">
                          <span className="text-[#888]">Total repaid: </span>
                          <span className="font-bold text-emerald-400">
                            {currencySymbol}{paidAmount.toLocaleString('en-IN')}
                          </span>
                          <span className="text-[#666]"> · Outstanding: </span>
                          <span className="font-bold text-red-500">
                            {currencySymbol}{item.remainingAmount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ==================== REPAYMENT MODAL ==================== */}
      {repayModalLoan && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#222] p-5 sm:p-6 rounded-3xl max-w-sm w-full shadow-2xl relative">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#222]">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                RECORD REPAYMENT
              </h3>
              <button
                onClick={() => setRepayModalLoan(null)}
                className="text-[#666] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs font-mono text-[#aaa] mb-4">
              Recording payment for{' '}
              <span className="text-white font-bold">{repayModalLoan.personOrBank}</span>
              <br />
              <span className="text-[#777] text-[11px]">
                Outstanding: {currencySymbol}{repayModalLoan.remainingAmount.toLocaleString('en-IN')}
              </span>
            </div>

            <form onSubmit={handleSaveRepayment} className="space-y-3.5">
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  ACCOUNT
                </label>
                <select
                  value={repayAccountId}
                  onChange={(e) => setRepayAccountId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 cursor-pointer"
                >
                  <option value="">-- Select Account --</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.bankName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  DATE
                </label>
                <input
                  type="date"
                  required
                  value={repayDate}
                  onChange={(e) => setRepayDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  AMOUNT ({currencySymbol})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  NOTES
                </label>
                <input
                  type="text"
                  value={repayNote}
                  onChange={(e) => setRepayNote(e.target.value)}
                  placeholder="e.g. Google Pay / Cash payment"
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-mono text-[#aaa] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={repayRecordLedger}
                  onChange={(e) => setRepayRecordLedger(e.target.checked)}
                  className="accent-red-600 rounded bg-black border border-[#333] cursor-pointer"
                />
                <span className="text-[11px] text-white">Record in ledger & adjust account balance</span>
              </label>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-mono font-bold text-xs uppercase tracking-[0.15em] rounded-xl transition-colors cursor-pointer"
                >
                  SAVE PAYMENT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== SETTLE LOAN MODAL ==================== */}
      {settleModalLoan && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#222] p-5 sm:p-6 rounded-3xl max-w-sm w-full shadow-2xl relative space-y-4 font-mono">
            <div className="flex justify-between items-center pb-3 border-b border-[#222]">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                SETTLE {settleModalLoan.type === 'lend' ? 'LEND' : 'LOAN'}
              </h3>
              <button
                onClick={() => setSettleModalLoan(null)}
                className="text-[#666] hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-[#aaa] space-y-1">
              <div>
                Full settlement with{' '}
                <span className="text-white font-bold">{settleModalLoan.personOrBank}</span>
              </div>
              <div className="text-sm font-bold text-white">
                Amount: {currencySymbol}{settleModalLoan.remainingAmount.toLocaleString('en-IN')}
              </div>
              <p className="text-[10px] text-[#777]">
                {settleModalLoan.type === 'lend'
                  ? 'Remaining balance will be marked repaid and credited to your account.'
                  : 'Remaining balance will be marked repaid and debited from your account.'}
              </p>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[9px] font-bold text-[#777] uppercase tracking-wider mb-1">
                  SETTLEMENT ACCOUNT
                </label>
                <select
                  value={settleAccountId}
                  onChange={(e) => setSettleAccountId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs text-white focus:outline-none focus:border-red-600 cursor-pointer"
                >
                  <option value="">-- Select Account --</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.bankName})
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#aaa] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={settleRecordLedger}
                  onChange={(e) => setSettleRecordLedger(e.target.checked)}
                  className="accent-red-600 rounded bg-black border border-[#333] cursor-pointer"
                />
                <span className="text-[11px] text-white">Record in ledger & adjust account balance</span>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSettleModalLoan(null)}
                  className="px-4 py-2.5 bg-[#18181f] hover:bg-[#222] border border-[#2d2d35] text-xs text-[#888] hover:text-white rounded-xl uppercase font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSettle}
                  className="px-5 py-2.5 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs uppercase tracking-[0.15em] rounded-xl transition-colors cursor-pointer"
                >
                  CONFIRM SETTLE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EDIT LOAN MODAL ==================== */}
      {editModalLoan && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#222] p-5 sm:p-6 rounded-3xl max-w-sm w-full shadow-2xl relative">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#222]">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                EDIT LOAN / LEND
              </h3>
              <button
                onClick={() => setEditModalLoan(null)}
                className="text-[#666] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditLoan} className="space-y-3.5">
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  TYPE
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as 'loan' | 'lend')}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="lend">Lend (I gave)</option>
                  <option value="loan">Loan (I borrowed)</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  PERSON
                </label>
                <input
                  type="text"
                  required
                  value={editPerson}
                  onChange={(e) => setEditPerson(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  TOTAL AMOUNT ({currencySymbol})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editTotalAmount}
                  onChange={(e) => setEditTotalAmount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  DATE
                </label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  NOTES
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes..."
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-mono font-bold text-xs uppercase tracking-[0.15em] rounded-xl transition-colors cursor-pointer"
                >
                  SAVE CHANGES
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== ADD NEW LOAN RECORD MODAL ==================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#121217] border border-[#2a2a34] p-5 sm:p-6 rounded-3xl max-w-lg w-full shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-4 text-white font-mono">
            <div className="flex justify-between items-center pb-3 border-b border-[#222]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-950/70 border border-red-700/60 flex items-center justify-center text-red-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    ADD LOAN / LEND / FINANCED EMI
                  </h3>
                  <p className="text-[10px] text-[#888]">
                    Industry standard financial calculation & repayment schedule
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-[#666] hover:text-white p-1 rounded-lg bg-[#181820]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewLoan} className="space-y-3.5">
              {/* Loan Structure Selector */}
              <div>
                <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                  LOAN TYPE & REPAYMENT STRUCTURE
                </label>
                <select
                  value={loanStructure}
                  onChange={(e) => setLoanStructure(e.target.value as LoanStructure)}
                  className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                >
                  <option value="standard_emi">Standard EMI Loan (Principal + Interest)</option>
                  <option value="no_cost_emi">No-Cost EMI (0% Customer Interest / Discounted)</option>
                  <option value="down_payment_emi">Down Payment + EMI Loan</option>
                  <option value="interest_only">Interest-Only Loan (Monthly interest, bullet principal)</option>
                  <option value="peer_lend">Personal Lend (Given to friend / contact)</option>
                  <option value="peer_loan">Personal Borrow (Taken from friend / contact)</option>
                </select>
              </div>

              {/* Title & Person / Bank */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                    LENDER / BORROWER NAME
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC Bank, Amazon Pay, Rahul"
                    value={newPerson}
                    onChange={(e) => setNewPerson(e.target.value)}
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                    LOAN / ASSET TITLE (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Car Loan Creta, iPhone 16"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>

              {/* Total Purchase / Loan Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                    TOTAL PURCHASE / LOAN AMOUNT ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 500000"
                    value={newTotalAmount}
                    onChange={(e) => setNewTotalAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  />
                </div>

                {loanStructure === 'down_payment_emi' ? (
                  <div>
                    <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                      DOWN PAYMENT ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 100000"
                      value={newDownPayment}
                      onChange={(e) => setNewDownPayment(e.target.value)}
                      className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                      LOAN START DATE
                    </label>
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                    />
                  </div>
                )}
              </div>

              {/* EMI Details for Structured Loans */}
              {!isPeer && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {loanStructure !== 'no_cost_emi' ? (
                      <div>
                        <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                          ANNUAL INTEREST (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="9.5"
                          value={newAnnualRate}
                          onChange={(e) => setNewAnnualRate(e.target.value)}
                          className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                          CUSTOMER INTEREST
                        </label>
                        <input
                          type="text"
                          disabled
                          value="0% (No-Cost)"
                          className="w-full px-3 py-2 bg-[#14141a] border border-[#262630] rounded-xl text-xs text-emerald-400 font-bold"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                        TENURE (MONTHS)
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="12"
                        value={newTenureMonths}
                        onChange={(e) => setNewTenureMonths(e.target.value)}
                        className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                        FIRST DUE DATE
                      </label>
                      <input
                        type="date"
                        value={newFirstInstallmentDate}
                        onChange={(e) => setNewFirstInstallmentDate(e.target.value)}
                        className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>

                  {/* Processing Fees & Upfront Discounts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                        PROCESSING FEES / CHARGES ({currencySymbol})
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={newProcessingFees}
                        onChange={(e) => setNewProcessingFees(e.target.value)}
                        className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                        MERCHANT DISCOUNT / SUBVENTION ({currencySymbol})
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={newDiscounts}
                        onChange={(e) => setNewDiscounts(e.target.value)}
                        className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>

                  {/* Manual EMI Override field */}
                  <div>
                    <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                      MANUAL EMI OVERRIDE (OPTIONAL)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder={emiPreview ? String(emiPreview.calculatedEmi) : 'Enter custom EMI amount'}
                      value={newManualEmi}
                      onChange={(e) => setNewManualEmi(e.target.value)}
                      className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                    />
                  </div>

                  {/* Real-time EMI Calculation Preview Banner */}
                  {emiPreview && (
                    <div className="p-3 bg-[#16161f] border border-[#282836] rounded-2xl space-y-2 text-xs">
                      <div className="flex items-center justify-between pb-1 border-b border-[#222]">
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
                          EMI Calculation Summary
                        </span>
                        <span className="text-[10px] text-emerald-400 font-bold">
                          Financed: {currencySymbol}{emiPreview.financedPrincipal.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>
                          <span className="text-[#666] block text-[9px] uppercase">Expected Monthly EMI</span>
                          <span className="font-bold text-white text-sm">
                            {currencySymbol}{emiPreview.calculatedEmi.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#666] block text-[9px] uppercase">Total Interest</span>
                          <span className="font-bold text-amber-400">
                            {currencySymbol}{emiPreview.totalInterestPayable.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#666] block text-[9px] uppercase">Total Repayment</span>
                          <span className="font-bold text-cyan-400">
                            {currencySymbol}{emiPreview.totalRepaymentAmount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      {/* Discrepancy Callout if Overridden */}
                      {emiPreview.isOverridden && (
                        <div className="p-2 bg-amber-950/60 border border-amber-800/80 rounded-xl text-[11px] text-amber-300 flex items-center justify-between">
                          <span>
                            Manual EMI Override: {currencySymbol}{emiPreview.monthlyEmi.toLocaleString('en-IN')}
                          </span>
                          <span className="font-bold">
                            Diff: {emiPreview.emiDifference > 0 ? '+' : ''}{currencySymbol}{emiPreview.emiDifference}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Linked Payment Account */}
              <div>
                <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                  ACCOUNT
                </label>
                <select
                  value={newLinkedAccountId}
                  onChange={(e) => setNewLinkedAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600 cursor-pointer"
                >
                  <option value="">-- Select Account --</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.bankName}) - Bal: {currencySymbol}{acc.balance.toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs font-mono text-[#aaa] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={newRecordInLedger}
                  onChange={(e) => setNewRecordInLedger(e.target.checked)}
                  className="accent-red-600 rounded bg-black border border-[#333] cursor-pointer"
                />
                <span className="text-[11px] text-white">Record in ledger & adjust account balance</span>
              </label>

              {/* Notes */}
              <div>
                <label className="block text-[9px] font-bold text-[#aaa] uppercase tracking-wider mb-1">
                  NOTES / REFERENCE
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Optional reference, account number, or warranty notes..."
                  className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase tracking-[0.15em] rounded-xl transition-all shadow-lg cursor-pointer"
                >
                  SAVE & GENERATE REPAYMENT SCHEDULE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loan Schedule Inspection Modal */}
      {selectedScheduleLoan && (
        <LoanScheduleModal
          loan={selectedScheduleLoan}
          accounts={accounts}
          currencySymbol={currencySymbol}
          onClose={() => setSelectedScheduleLoan(null)}
          onConfirmInstallmentPayment={(loanId, instNum, accountId, amt, date, memo) => {
            onConfirmInstallmentPayment?.(loanId, instNum, accountId, amt, date, memo);
            setSelectedScheduleLoan((prev) => {
              if (!prev || prev.id !== loanId) return null;
              const updatedSchedule = (prev.schedule || []).map((s) =>
                s.installmentNumber === instNum
                  ? { ...s, status: 'paid' as const, paidDate: date }
                  : s
              );
              const newRemaining = Math.max(0, prev.remainingAmount - amt);
              return {
                ...prev,
                remainingAmount: newRemaining,
                schedule: updatedSchedule,
                status: newRemaining === 0 ? 'repaid' : 'active',
              };
            });
          }}
          onSkipInstallment={(loanId, instNum) => {
            onSkipInstallment?.(loanId, instNum);
            setSelectedScheduleLoan((prev) => {
              if (!prev || prev.id !== loanId) return null;
              const updatedSchedule = (prev.schedule || []).map((s) =>
                s.installmentNumber === instNum
                  ? { ...s, status: 'skipped' as const, skippedAt: new Date().toISOString() }
                  : s
              );
              return { ...prev, schedule: updatedSchedule };
            });
          }}
        />
      )}

      {/* Delete Loan/Lend Modal Dialog */}
      <AnimatePresence>
        {loanToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono select-none">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLoanToDelete(null)}
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
                  <div className="p-2.5 bg-[#18181f] border border-[#2d2d35] rounded-2xl shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase">
                      Delete Record?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLoanToDelete(null)}
                  className="p-1.5 text-[#555] hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Details card */}
              <div className="p-4 bg-[#181820] border border-[#26262f] rounded-2xl">
                <div className="space-y-1.5 font-mono">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Person / Bank:</span>
                    <span className="font-bold text-white max-w-[200px] truncate">
                      {loanToDelete.personOrBank}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Record Type:</span>
                    <span className={`text-xs font-bold ${loanToDelete.type === 'lend' ? 'text-emerald-400' : 'text-red-500'}`}>
                      {loanToDelete.type === 'lend' ? 'Lend (Given)' : 'Loan (Borrowed)'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Remaining:</span>
                    <span className="font-bold text-white">
                      {currencySymbol}{loanToDelete.remainingAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Principal:</span>
                    <span className="font-bold text-cyan-400">
                      {currencySymbol}{loanToDelete.totalAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-[#888] font-mono">
                Note: Deleting this loan will not alter your account balance or transaction history.
              </p>

              {/* Checkbox */}
              <label className="flex items-center gap-3 p-3 bg-[#0c0c0f] border border-[#222]/80 hover:border-[#333] rounded-2xl cursor-pointer transition-all select-none">
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
                  onClick={() => setLoanToDelete(null)}
                  className="px-4 py-2 bg-[#18181f] hover:bg-[#222] border border-[#2d2d35] text-xs font-mono text-[#888] hover:text-white rounded-xl uppercase font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteLoan}
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
