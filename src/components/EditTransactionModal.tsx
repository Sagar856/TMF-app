import React, { useState, useMemo, useEffect } from 'react';
import {
  Transaction,
  Category,
  FinancialAccount,
  TransactionType,
  PaymentSource,
  LoanRecord,
  InvestmentRecord,
  InvestmentType,
  LoanType,
} from '../types/finance';
import { X, Plus, Sparkles, MapPin, Loader2 } from 'lucide-react';
import { suggestCategoryForTitle } from '../services/notification/CategoryClassifier';
import { getCurrentDeviceLocation } from '../services/locationService';
import { newId } from '../utils/ids';
import { todayLocalISO, currentMonthLocal, addDays, nowLocalTimeHHMM } from '../utils/dates';
import { resolveAccountId } from '../utils/accountResolver';
import { useDialog } from '../hooks/useDialog';

export type CategoryType = 'Expense' | 'Income' | 'Investment' | 'Loan & Lend' | 'Transfer';

export interface TransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  time: string;
  note?: string;
}

function parseNoteAndTags(rawNote?: string): { cleanNote: string; extractedTags: string[] } {
  if (!rawNote) return { cleanNote: '', extractedTags: [] };
  const match = rawNote.match(/\s*\[Tags:\s*(#[^\]]+)\]\s*$/i);
  if (!match) {
    return { cleanNote: rawNote, extractedTags: [] };
  }
  const tagsStr = match[1];
  const extractedTags = tagsStr
    .split(',')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean);
  const cleanNote = rawNote.slice(0, match.index).trim();
  return { cleanNote, extractedTags };
}

interface EditTransactionModalProps {
  transaction?: Partial<Transaction> | null;
  categories: Category[];
  accounts?: FinancialAccount[];
  loans?: LoanRecord[];
  initialCategoryType?: CategoryType;
  onSave: (tx: Transaction) => void;
  onAddInvestment?: (inv: InvestmentRecord, accountId?: string, recordInLedger?: boolean) => void;
  onAddLoan?: (loan: LoanRecord, accountId?: string, recordInLedger?: boolean) => void;
  onAddTransfer?: (transfer: TransferRequest) => void;
  onClose: () => void;
  currencySymbol: string;
  locationTracking?: boolean;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  transaction,
  categories,
  accounts = [],
  initialCategoryType,
  onSave,
  onAddInvestment,
  onAddLoan,
  onAddTransfer,
  onClose,
  currencySymbol,
  locationTracking = false,
}) => {
  const isEditingExisting = Boolean(transaction && transaction.id);

  // Category Type selection: Expense, Income, Investment, Loan & Lend
  const [categoryType, setCategoryType] = useState<CategoryType>(() => {
    if (initialCategoryType) return initialCategoryType;
    if (transaction?.type === 'credit') return 'Income';
    return 'Expense';
  });

  // Filter categories strictly by current Category Type (Expense -> expense, Income -> income, Investment -> investment)
  const filteredCategories = useMemo(() => {
    const targetType = categoryType.toLowerCase();
    return categories.filter((cat) => (cat.type || 'expense').toLowerCase() === targetType);
  }, [categories, categoryType]);

  // --- Transaction State (Expense / Income) ---
  const [txDate, setTxDate] = useState<string>(
    transaction?.date || todayLocalISO()
  );
  const [txAmount, setTxAmount] = useState<string>(
    transaction?.amount ? transaction.amount.toString() : ''
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    const initType = (
      initialCategoryType ||
      (transaction?.type === 'credit' ? 'Income' : 'Expense')
    ).toLowerCase();
    
    if (transaction?.category) {
      const match = categories.find(
        (c) =>
          c.name.toLowerCase() === transaction.category!.toLowerCase() &&
          (c.type || 'expense').toLowerCase() === initType
      );
      if (match) return match.name;
    }
    const relevant = categories.filter((c) => (c.type || 'expense').toLowerCase() === initType);
    return relevant.length > 0 ? relevant[0].name : '';
  });

  const [selectedSubcategory, setSelectedSubcategory] = useState<string>(() => {
    if (transaction?.subcategory) return transaction.subcategory;
    const initType = (
      initialCategoryType ||
      (transaction?.type === 'credit' ? 'Income' : 'Expense')
    ).toLowerCase();
    const matchCat = categories.find(
      (c) =>
        c.name.toLowerCase() === (transaction?.category || '').toLowerCase() &&
        (c.type || 'expense').toLowerCase() === initType
    );
    return matchCat?.subcategories?.[0] || 'General';
  });

  const [txType, setTxType] = useState<TransactionType>(
    transaction?.type || (categoryType === 'Income' ? 'credit' : 'debit')
  );
  const [account, setAccount] = useState<string>(() => {
    const raw = transaction?.paymentMethod;
    if (!raw) {
      const def = accounts.find((a) => a.isDefault);
      return def ? def.id : (accounts[0]?.id || 'Cash');
    }
    if (raw === 'Cash' || raw === 'Other UPI') return raw;
    if (accounts.some((a) => a.id === raw)) return raw;
    const resolved = resolveAccountId(accounts, raw);
    return resolved || raw;
  });

  const [payeeOrPayer, setPayeeOrPayer] = useState<string>(
    transaction?.payeeOrPayer || ''
  );

  const [description, setDescription] = useState<string>(
    transaction?.title || ''
  );

  const parsedNote = useMemo(() => parseNoteAndTags(transaction?.note), [transaction?.note]);
  const [notes, setNotes] = useState<string>(parsedNote.cleanNote);
  const [tags, setTags] = useState<string[]>(parsedNote.extractedTags);
  const [tagInput, setTagInput] = useState<string>('');

  // --- Geolocation & Place State ---
  const [place, setPlace] = useState<string>(transaction?.location?.name || '');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(
    transaction?.location ? { lat: transaction.location.lat, lng: transaction.location.lng } : null
  );
  const [isLocating, setIsLocating] = useState<boolean>(false);

  const [refNumber, setReferenceNum] = useState<string>(
    transaction?.refNumber || ''
  );

  // --- Investment State ---
  const [invName, setInvName] = useState<string>('');
  const [invType, setInvType] = useState<InvestmentType>('Mutual Funds');
  const [invAmount, setInvAmount] = useState<string>('');
  const [invMarketValue, setInvMarketValue] = useState<string>('');
  const [invDate, setInvDate] = useState<string>(todayLocalISO());
  const [invNotes, setInvNotes] = useState<string>('');
  const [invAccountId, setInvAccountId] = useState<string>(accounts[0]?.id || '');
  const [invRecordLedger, setInvRecordLedger] = useState<boolean>(true);

  // --- Loan / Lend State ---
  const [loanDate, setLoanDate] = useState<string>(todayLocalISO());
  const [loanDueDate, setLoanDueDate] = useState<string>(() => addDays(todayLocalISO(), 30));
  const [loanType, setLoanType] = useState<LoanType>('loan');
  const [loanPerson, setLoanPerson] = useState<string>('');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [loanAccountId, setLoanAccountId] = useState<string>(accounts[0]?.id || '');
  const [loanRecordLedger, setLoanRecordLedger] = useState<boolean>(true);
  const [loanNotes, setLoanNotes] = useState<string>('');
  const [loanRefNum, setLoanRefNum] = useState<string>('NA');

  const [autoMatchedCategory, setAutoMatchedCategory] = useState<string | null>(null);
  const [txTime, setTxTime] = useState<string>(transaction?.time || nowLocalTimeHHMM());
  const [formError, setFormError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const dialogRef = useDialog<HTMLDivElement>({ isOpen: true, onClose });

  // --- Transfer State ---
  const cashAccounts = accounts.filter((a) => a.type !== 'Credit Card');
  const [transferFrom, setTransferFrom] = useState<string>(() => accounts.find((a) => a.isDefault)?.id || cashAccounts[0]?.id || '');
  const [transferTo, setTransferTo] = useState<string>(() => {
    const first = accounts.find((a) => a.isDefault)?.id || cashAccounts[0]?.id || '';
    return accounts.find((a) => a.id !== first)?.id || '';
  });
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(todayLocalISO());
  const [transferNote, setTransferNote] = useState<string>('');

  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');
    const amount = Number(transferAmount.trim().replace(/,/g, ''));
    if (!transferAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError('Enter a transfer amount greater than zero.');
      return;
    }
    if (!transferFrom || !transferTo) {
      setFormError('Choose both the source and destination accounts.');
      return;
    }
    if (transferFrom === transferTo) {
      setFormError('Source and destination must be different accounts.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) {
      setFormError('Choose a valid date.');
      return;
    }
    setIsSubmitting(true);
    onAddTransfer?.({
      fromAccountId: transferFrom,
      toAccountId: transferTo,
      amount,
      date: transferDate,
      time: nowLocalTimeHHMM(),
      note: transferNote.trim() || undefined,
    });
    onClose();
  };

  // Retrieve current user location on modal open for new transaction only if locationTracking is enabled
  useEffect(() => {
    if (!isEditingExisting && !place && locationTracking) {
      let isMounted = true;
      setIsLocating(true);
      getCurrentDeviceLocation()
        .then((loc) => {
          if (!isMounted) return;
          setIsLocating(false);
          if (loc && loc.formattedLocation) {
            setPlace((prev) => (prev ? prev : loc.formattedLocation));
            setCoordinates({ lat: loc.lat, lng: loc.lng });
          }
        })
        .catch(() => {
          if (isMounted) setIsLocating(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isEditingExisting, place, locationTracking]);

  const handleFetchCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const loc = await getCurrentDeviceLocation();
      if (loc && loc.formattedLocation) {
        setPlace(loc.formattedLocation);
        setCoordinates({ lat: loc.lat, lng: loc.lng });
      }
    } finally {
      setIsLocating(false);
    }
  };

  // Handle category type change: refresh/reset category selection
  const handleCategoryTypeChange = (newType: CategoryType) => {
    setCategoryType(newType);
    if (newType === 'Income') {
      setTxType('credit');
    } else if (newType === 'Expense') {
      setTxType('debit');
    }

    const relevantCats = categories.filter(
      (c) => (c.type || 'expense').toLowerCase() === newType.toLowerCase()
    );
    if (relevantCats.length > 0) {
      setSelectedCategory(relevantCats[0].name);
      setSelectedSubcategory(relevantCats[0].subcategories?.[0] || 'General');
    } else {
      setSelectedCategory('');
      setSelectedSubcategory('General');
    }
    setAutoMatchedCategory(null);
  };

  // Category lookups are scoped to the active type so an Income and an Expense
  // category sharing a name never supply each other's subcategories.
  const findCategoryInType = (catName: string) =>
    filteredCategories.find((c) => c.name.toLowerCase() === catName.toLowerCase()) ||
    categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());

  const handleCategoryChange = (catName: string) => {
    setSelectedCategory(catName);
    setAutoMatchedCategory(null);
    const cat = findCategoryInType(catName);
    const subs = cat?.subcategories || [];
    if (subs.length > 0 && !subs.includes(selectedSubcategory)) {
      setSelectedSubcategory(subs[0]);
    } else if (subs.length === 0) {
      setSelectedSubcategory('General');
    }
  };

  const currentCategoryObj = useMemo(() => {
    return (
      filteredCategories.find((c) => c.name.toLowerCase() === selectedCategory.toLowerCase()) ||
      categories.find((c) => c.name.toLowerCase() === selectedCategory.toLowerCase())
    );
  }, [categories, filteredCategories, selectedCategory]);

  const subcategoryOptions = useMemo(() => {
    const list = currentCategoryObj?.subcategories?.length
      ? [...currentCategoryObj.subcategories]
      : ['General'];
    if (selectedSubcategory && !list.includes(selectedSubcategory)) {
      list.unshift(selectedSubcategory);
    }
    return list;
  }, [currentCategoryObj, selectedSubcategory]);

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    if (!isEditingExisting) {
      const match = suggestCategoryForTitle(val, txType);
      if (match) {
        const catExists = categories.some(
          (c) =>
            c.name.toLowerCase() === match.category.toLowerCase() &&
            (c.type || 'expense').toLowerCase() === match.categoryType.toLowerCase()
        );
        if (catExists) {
          if (match.categoryType !== categoryType) {
            setCategoryType(match.categoryType);
            if (match.categoryType === 'Income') setTxType('credit');
            else if (match.categoryType === 'Expense') setTxType('debit');
          }
          setSelectedCategory(match.category);
          setAutoMatchedCategory(match.category);
          const matchedCatObj = categories.find(
            (c) => c.name.toLowerCase() === match.category.toLowerCase()
          );
          if (matchedCatObj?.subcategories?.length) {
            setSelectedSubcategory(matchedCatObj.subcategories[0]);
          }
        }
      }
    }
  };

  const handlePlaceChange = (val: string) => {
    setPlace(val);
    if (!isEditingExisting && !description) {
      const match = suggestCategoryForTitle(val, txType);
      if (match) {
        const catExists = categories.some(
          (c) =>
            c.name.toLowerCase() === match.category.toLowerCase() &&
            (c.type || 'expense').toLowerCase() === match.categoryType.toLowerCase()
        );
        if (catExists) {
          if (match.categoryType !== categoryType) {
            setCategoryType(match.categoryType);
            if (match.categoryType === 'Income') setTxType('credit');
            else if (match.categoryType === 'Expense') setTxType('debit');
          }
          setSelectedCategory(match.category);
          setAutoMatchedCategory(match.category);
          const matchedCatObj = categories.find(
            (c) => c.name.toLowerCase() === match.category.toLowerCase()
          );
          if (matchedCatObj?.subcategories?.length) {
            setSelectedSubcategory(matchedCatObj.subcategories[0]);
          }
        }
      }
    }
  };

  // Tag Handlers
  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim().toLowerCase().replace(/^#/, '')]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Save Handlers
  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    const numAmount = Number(txAmount.trim().replace(/,/g, ''));
    if (!txAmount.trim() || !Number.isFinite(numAmount)) {
      setFormError('Enter a valid amount.');
      return;
    }
    if (numAmount <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate) || Number.isNaN(new Date(`${txDate}T00:00:00`).getTime())) {
      setFormError('Choose a valid date.');
      return;
    }
    if (txTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(txTime)) {
      setFormError('Time must be in HH:MM format.');
      return;
    }
    if (filteredCategories.length === 0) {
      setFormError(`Create a${categoryType === 'Income' ? 'n income' : 'n expense'} category first.`);
      return;
    }
    setIsSubmitting(true);

    const savedCategory =
      selectedCategory || (filteredCategories.length > 0 ? filteredCategories[0].name : 'General');

    const cleanNotesTrimmed = notes.trim();
    const tagsSuffix = tags.length > 0 ? `[Tags: #${tags.join(', #')}]` : '';
    const finalNote = cleanNotesTrimmed
      ? tagsSuffix
        ? `${cleanNotesTrimmed} ${tagsSuffix}`
        : cleanNotesTrimmed
      : tagsSuffix || undefined;

    const savedSource: PaymentSource =
      transaction?.source ?? (account === 'Other UPI' || account === 'UPI' ? 'UPI' : 'Manual');

    const finalPayee =
      payeeOrPayer.trim() || description.trim() || place.trim() || 'Merchant';

    const savedTx: Transaction = {
      id: transaction?.id || newId('tx'),
      title: description.trim() || payeeOrPayer.trim() || place.trim() || 'Transaction',
      amount: numAmount,
      type: txType,
      category: savedCategory,
      subcategory: selectedSubcategory || 'General',
      date: txDate,
      time: txTime || transaction?.time || nowLocalTimeHHMM(),
      source: savedSource,
      payeeOrPayer: finalPayee,
      paymentMethod: account,
      refNumber: refNumber.trim() || undefined,
      location: coordinates
        ? {
            lat: coordinates.lat,
            lng: coordinates.lng,
            name: place.trim() || 'Location',
          }
        : transaction?.location
        ? {
            lat: transaction.location.lat,
            lng: transaction.location.lng,
            name: place.trim() || 'Location',
          }
        : undefined,
      rawText: transaction?.rawText,
      note: finalNote,
    };

    onSave(savedTx);
    onClose();
  };

  const handleSaveInvestment = (e: React.FormEvent) => {
    e.preventDefault();
    const numInv = parseFloat(invAmount);
    const numVal = parseFloat(invMarketValue) || numInv;

    if (isNaN(numInv) || numInv <= 0) return;

    const returnPct = parseFloat((((numVal - numInv) / numInv) * 100).toFixed(2));
    const finalDate = invDate || todayLocalISO();
    const invMonth = finalDate.substring(0, 7) || currentMonthLocal();

    const newInv: InvestmentRecord = {
      id: newId('inv'),
      name: invName.trim() || 'New Investment',
      type: invType,
      amountInvested: numInv,
      currentValue: numVal,
      returnsPercent: returnPct,
      date: finalDate,
      linkedAccountId: invAccountId || undefined,
      monthlyContributions: [{ month: invMonth, amount: numInv }],
      notes: invNotes.trim(),
    };

    if (onAddInvestment) {
      onAddInvestment(newInv, invAccountId || undefined, invRecordLedger);
    }
    onClose();
  };

  const handleSaveLoan = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(loanAmount);
    if (isNaN(numAmount) || numAmount <= 0 || !loanPerson.trim()) return;

    const newLoan: LoanRecord = {
      id: newId('loan'),
      title: `${loanType === 'loan' ? 'Borrowed from' : 'Lent to'} ${loanPerson.trim()}`,
      personOrBank: loanPerson.trim(),
      type: loanType,
      totalAmount: numAmount,
      remainingAmount: numAmount,
      startDate: loanDate,
      dueDate: loanDueDate || addDays(loanDate, 30),
      linkedAccountId: loanAccountId || undefined,
      status: 'active',
      repayments: [],
      notes: `${loanNotes}${loanRefNum && loanRefNum !== 'NA' ? ` (Ref: ${loanRefNum})` : ''}`.trim(),
    };

    if (onAddLoan) {
      onAddLoan(newLoan, loanAccountId || undefined, loanRecordLedger);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-backdrop backdrop-blur-md z-modal flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEditingExisting ? 'Edit transaction' : 'Add record'}
        tabIndex={-1}
        className="bg-[#111111] border border-[#222] p-5 sm:p-6 rounded-3xl max-w-md w-full shadow-2xl relative my-auto outline-none"
      >
        {/* ==================== FORM FOR EXPENSE & INCOME ==================== */}
        {(categoryType === 'Expense' || categoryType === 'Income') && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#222]">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-[0.25em]">
                {isEditingExisting ? 'EDIT TRANSACTION' : 'ADD TRANSACTION'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-[#666] hover:text-white transition-colors p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-3.5 font-mono" noValidate>
              {/* Row 1: DATE, TIME & AMOUNT */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tx-date" className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    DATE
                  </label>
                  <input
                    id="tx-date"
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => { setTxDate(e.target.value); setFormError(''); }}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 appearance-none"
                  />
                </div>

                <div>
                  <label htmlFor="tx-time" className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    TIME
                  </label>
                  <input
                    id="tx-time"
                    type="time"
                    value={txTime}
                    onChange={(e) => { setTxTime(e.target.value); setFormError(''); }}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 appearance-none"
                  />
                </div>

                <div className="col-span-2">
                  <label htmlFor="tx-amount" className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    AMOUNT ({currencySymbol})
                  </label>
                  <input
                    id="tx-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    required
                    data-autofocus={isEditingExisting ? undefined : true}
                    value={txAmount}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => { setTxAmount(e.target.value); setFormError(''); }}
                    placeholder="0.00"
                    aria-invalid={formError ? true : undefined}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-sm font-mono font-bold text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>

              {/* Row 2: CATEGORY TYPE */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  CATEGORY TYPE
                </label>
                <select
                  value={categoryType}
                  onChange={(e) => handleCategoryTypeChange(e.target.value as CategoryType)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 font-bold"
                >
                  <option value="Expense">Expense</option>
                  <option value="Income">Income</option>
                  <option value="Investment">Investment</option>
                  <option value="Loan & Lend">Loan & Lend</option>
                  {onAddTransfer && !isEditingExisting && <option value="Transfer">Transfer between accounts</option>}
                </select>
              </div>

              {/* Row 3: CATEGORY & SUBCATEGORY */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider">
                      CATEGORY
                    </label>
                    {autoMatchedCategory && selectedCategory === autoMatchedCategory && (
                      <span className="inline-flex items-center gap-1 text-[8px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded-full border border-emerald-800/60">
                        <Sparkles className="w-2.5 h-2.5" />
                        Auto
                      </span>
                    )}
                  </div>
                  {filteredCategories.length === 0 ? (
                    <select
                      disabled
                      value=""
                      className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-[#666] focus:outline-none cursor-not-allowed opacity-75"
                    >
                      <option value="" disabled>
                        No categories available
                      </option>
                    </select>
                  ) : (
                    <select
                      value={selectedCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                    >
                      {filteredCategories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    SUBCATEGORY
                  </label>
                  <select
                    value={selectedSubcategory}
                    onChange={(e) => setSelectedSubcategory(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  >
                    {subcategoryOptions.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4: TYPE & ACCOUNT */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    TYPE
                  </label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as TransactionType)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  >
                    <option value="debit">Debit (-)</option>
                    <option value="credit">Credit (+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    ACCOUNT / PAYMENT METHOD
                  </label>
                  <select
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  >
                    {accounts.length > 0 ? (
                      <>
                        <optgroup label="Bank Accounts">
                          {accounts
                            .filter((a) => a.type === 'Bank')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.bankName} (**{a.accountNumberLast4}) - {a.name}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Credit Cards (CRED)">
                          {accounts
                            .filter((a) => a.type === 'Credit Card')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.cardNetwork ? `${a.bankName} ${a.cardNetwork}` : a.bankName} (**{a.accountNumberLast4})
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Wallets & UPI">
                          {accounts
                            .filter((a) => a.type === 'Wallet/UPI')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="General">
                          <option value="Cash">Cash</option>
                          <option value="Other UPI">Other UPI</option>
                        </optgroup>
                      </>
                    ) : (
                      <>
                        <option value="Cash">Cash</option>
                        <option value="Other UPI">Other UPI</option>
                      </>
                    )}
                  </select>
                  {accounts.length === 0 && (
                    <p className="mt-1 text-[10px] text-[#888] font-mono">
                      Add an account under Accounts to track balances
                    </p>
                  )}
                </div>
              </div>

              {/* Row 5: PAYEE / MERCHANT & REFERENCE / UTR */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    PAYEE / MERCHANT
                  </label>
                  <input
                    type="text"
                    value={payeeOrPayer}
                    onChange={(e) => setPayeeOrPayer(e.target.value)}
                    placeholder="e.g. Starbucks, Amazon, Landlord"
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    REFERENCE / UTR
                  </label>
                  <input
                    type="text"
                    value={refNumber}
                    onChange={(e) => setReferenceNum(e.target.value)}
                    placeholder="e.g. UTR / Ref #"
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>

              {/* Row 6: DESCRIPTION */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  DESCRIPTION
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  placeholder="e.g. Zomato dinner, Uber to airport, Amazon..."
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              {/* Row 7: PLACE */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider">
                    PLACE
                  </label>
                  {isLocating && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono text-red-400">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      Detecting...
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={place}
                    onChange={(e) => handlePlaceChange(e.target.value)}
                    placeholder={isLocating ? 'Detecting location...' : 'Where?'}
                    className="w-full pl-3 pr-8 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 truncate"
                  />
                  <button
                    type="button"
                    onClick={handleFetchCurrentLocation}
                    disabled={isLocating}
                    title="Detect current location"
                    className="absolute right-2 p-1 text-[#666] hover:text-red-400 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {isLocating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Row 8: NOTES */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  NOTES
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes..."
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              {/* Row 7: TAGS */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  TAGS
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="New tag..."
                    className="flex-1 px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3 bg-[#181818] border border-[#222] text-white rounded-xl hover:bg-surface-3 transition-colors flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tags.map((tg, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-[#181818] border border-line text-[10px] font-mono text-[#aaa] rounded-lg flex items-center gap-1"
                      >
                        #{tg}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tg)}
                          className="hover:text-red-400"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {formError && (
                <p role="alert" className="text-[11px] text-red-400 bg-red-950/40 border border-red-800/60 rounded-xl px-3 py-2">
                  {formError}
                </p>
              )}

              {/* SAVE TRANSACTION Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-mono font-bold text-xs uppercase tracking-[0.15em] rounded-xl transition-colors cursor-pointer shadow-lg shadow-red-900/20"
                >
                  {isSubmitting ? 'SAVING…' : isEditingExisting ? 'SAVE CHANGES' : 'SAVE TRANSACTION'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ==================== FORM FOR INVESTMENT ==================== */}
        {categoryType === 'Investment' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#222]">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-[0.25em]">
                LOG INVESTMENT RECORD
              </h3>
              <button
                onClick={onClose}
                className="text-[#666] hover:text-white transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvestment} className="space-y-3.5 font-mono">
              {/* Row 1: CATEGORY TYPE */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  CATEGORY TYPE
                </label>
                <select
                  value={categoryType}
                  onChange={(e) => handleCategoryTypeChange(e.target.value as CategoryType)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 font-bold"
                >
                  <option value="Expense">Expense</option>
                  <option value="Income">Income</option>
                  <option value="Investment">Investment</option>
                  <option value="Loan & Lend">Loan & Lend</option>
                  {onAddTransfer && !isEditingExisting && <option value="Transfer">Transfer between accounts</option>}
                </select>
              </div>

              {/* Row 2: INVESTMENT / ASSET NAME */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  INVESTMENT / ASSET NAME
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Parag Parikh Flexi Cap Fund"
                  value={invName}
                  onChange={(e) => setInvName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              {/* Row 3: ASSET CATEGORY & PURCHASE DATE */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    ASSET CATEGORY
                  </label>
                  <select
                    value={invType}
                    onChange={(e) => setInvType(e.target.value as InvestmentType)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  >
                    <option value="Mutual Funds">Mutual Funds</option>
                    <option value="Stocks">Stocks</option>
                    <option value="Crypto">Crypto</option>
                    <option value="Real Estate">Real Estate</option>
                    <option value="Gold">Gold</option>
                    <option value="FD/Bonds">FD/Bonds</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    PURCHASE DATE
                  </label>
                  <input
                    type="date"
                    required
                    value={invDate}
                    onChange={(e) => setInvDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 appearance-none"
                  />
                </div>
              </div>

              {/* Row 4: AMOUNT INVESTED & CURRENT MARKET VALUE */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    AMOUNT INVESTED ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="10000"
                    value={invAmount}
                    onChange={(e) => setInvAmount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    CURRENT MARKET VALUE
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Leave empty if same"
                    value={invMarketValue}
                    onChange={(e) => setInvMarketValue(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>

              {/* Row 5: ACCOUNT */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  ACCOUNT
                </label>
                <select
                  value={invAccountId}
                  onChange={(e) => setInvAccountId(e.target.value)}
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

              <label className="flex items-center gap-2 text-xs font-mono text-[#aaa] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={invRecordLedger}
                  onChange={(e) => setInvRecordLedger(e.target.checked)}
                  className="accent-red-600 rounded bg-black border border-[#333] cursor-pointer"
                />
                <span className="text-[11px] text-white">Record in ledger & adjust account balance</span>
              </label>

              {/* Row 6: NOTES */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  NOTES
                </label>
                <input
                  type="text"
                  placeholder="e.g. Monthly SIP on 10th"
                  value={invNotes}
                  onChange={(e) => setInvNotes(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              {/* SAVE INVESTMENT Button */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-3 bg-[#1a1a1a] border border-[#333] hover:bg-surface-3 text-white font-mono text-xs uppercase rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-mono font-bold text-xs uppercase tracking-[0.1em] rounded-xl transition-colors cursor-pointer shadow-lg shadow-red-900/20"
                >
                  SAVE INVESTMENT
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ==================== FORM FOR LOAN & LEND ==================== */}
        {/* ==================== FORM FOR ACCOUNT TRANSFER ==================== */}
        {categoryType === 'Transfer' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#222]">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-[0.25em]">TRANSFER BETWEEN ACCOUNTS</h3>
              <button type="button" onClick={onClose} aria-label="Close" className="text-[#666] hover:text-white transition-colors p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="space-y-3.5 font-mono" noValidate>
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">CATEGORY TYPE</label>
                <select
                  value={categoryType}
                  onChange={(e) => handleCategoryTypeChange(e.target.value as CategoryType)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 font-bold"
                >
                  <option value="Expense">Expense</option>
                  <option value="Income">Income</option>
                  <option value="Investment">Investment</option>
                  <option value="Loan & Lend">Loan & Lend</option>
                  <option value="Transfer">Transfer between accounts</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="transfer-from" className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">FROM</label>
                  <select
                    id="transfer-from"
                    value={transferFrom}
                    onChange={(e) => { setTransferFrom(e.target.value); setFormError(''); }}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} · {currencySymbol}{a.balance.toLocaleString()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="transfer-to" className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">TO</label>
                  <select
                    id="transfer-to"
                    value={transferTo}
                    onChange={(e) => { setTransferTo(e.target.value); setFormError(''); }}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id} disabled={a.id === transferFrom}>
                        {a.name}{a.type === 'Credit Card' ? ' (card bill payment)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="transfer-amount" className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">AMOUNT ({currencySymbol})</label>
                  <input
                    id="transfer-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    data-autofocus
                    value={transferAmount}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => { setTransferAmount(e.target.value); setFormError(''); }}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-sm font-mono font-bold text-white focus:outline-none focus:border-red-600"
                  />
                </div>
                <div>
                  <label htmlFor="transfer-date" className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">DATE</label>
                  <input
                    id="transfer-date"
                    type="date"
                    value={transferDate}
                    onChange={(e) => { setTransferDate(e.target.value); setFormError(''); }}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 appearance-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="transfer-note" className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">NOTE (OPTIONAL)</label>
                <input
                  id="transfer-note"
                  type="text"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  placeholder="e.g. Credit card bill, moving to savings"
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <p className="text-[10px] text-[#777] leading-relaxed">
                Transfers move money between your own accounts. They adjust both balances but are <span className="text-white">not</span> counted as income or spending.
                Transferring to a credit card records a bill payment that reduces the card's outstanding balance.
              </p>

              {formError && (
                <p role="alert" className="text-[11px] text-red-400 bg-red-950/40 border border-red-800/60 rounded-xl px-3 py-2">{formError}</p>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || accounts.length < 2}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-mono font-bold text-xs uppercase tracking-[0.15em] rounded-xl transition-colors cursor-pointer shadow-lg shadow-red-900/20"
                >
                  {accounts.length < 2 ? 'ADD A SECOND ACCOUNT FIRST' : isSubmitting ? 'SAVING…' : 'RECORD TRANSFER'}
                </button>
              </div>
            </form>
          </div>
        )}

        {categoryType === 'Loan & Lend' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#222]">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-[0.25em]">
                ADD LOAN/LEND
              </h3>
              <button
                onClick={onClose}
                className="text-[#666] hover:text-white transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLoan} className="space-y-3.5 font-mono">
              {/* Row 1: CATEGORY TYPE */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  CATEGORY TYPE
                </label>
                <select
                  value={categoryType}
                  onChange={(e) => handleCategoryTypeChange(e.target.value as CategoryType)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 font-bold"
                >
                  <option value="Expense">Expense</option>
                  <option value="Income">Income</option>
                  <option value="Investment">Investment</option>
                  <option value="Loan & Lend">Loan & Lend</option>
                  {onAddTransfer && !isEditingExisting && <option value="Transfer">Transfer between accounts</option>}
                </select>
              </div>

              {/* Row 2: START DATE & DUE DATE */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    START DATE
                  </label>
                  <input
                    type="date"
                    required
                    value={loanDate}
                    onChange={(e) => {
                      setLoanDate(e.target.value);
                      setLoanDueDate(addDays(e.target.value, 30));
                    }}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    DUE DATE
                  </label>
                  <input
                    type="date"
                    required
                    value={loanDueDate}
                    onChange={(e) => setLoanDueDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 appearance-none"
                  />
                </div>
              </div>

              {/* Row 3: TYPE & PERSON */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    TYPE
                  </label>
                  <select
                    value={loanType}
                    onChange={(e) => setLoanType(e.target.value as LoanType)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  >
                    <option value="loan">Loan (I borrowed)</option>
                    <option value="lend">Lend (I gave)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    PERSON
                  </label>
                  <input
                    type="text"
                    required
                    value={loanPerson}
                    onChange={(e) => setLoanPerson(e.target.value)}
                    placeholder="Type name..."
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>

              {/* Row 4: AMOUNT & ACCOUNT */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    AMOUNT ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    ACCOUNT
                  </label>
                  <select
                    value={loanAccountId}
                    onChange={(e) => setLoanAccountId(e.target.value)}
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
              </div>

              <label className="flex items-center gap-2 text-xs font-mono text-[#aaa] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={loanRecordLedger}
                  onChange={(e) => setLoanRecordLedger(e.target.checked)}
                  className="accent-red-600 rounded bg-black border border-[#333] cursor-pointer"
                />
                <span className="text-[11px] text-white">Record in ledger & adjust account balance</span>
              </label>

              {/* Row 5: DESCRIPTION */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  DESCRIPTION
                </label>
                <input
                  type="text"
                  value={loanNotes}
                  onChange={(e) => setLoanNotes(e.target.value)}
                  placeholder="Notes..."
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              {/* Row 6: REFERENCE # */}
              <div>
                <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                  REFERENCE #
                </label>
                <input
                  type="text"
                  value={loanRefNum}
                  onChange={(e) => setLoanRefNum(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              {/* SAVE LOAN/LEND Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-mono font-bold text-xs uppercase tracking-[0.15em] rounded-xl transition-colors cursor-pointer shadow-lg shadow-red-900/20"
                >
                  SAVE LOAN/LEND
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
