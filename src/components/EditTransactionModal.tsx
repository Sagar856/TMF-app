import React, { useState } from 'react';
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
import { X, Plus, Sparkles } from 'lucide-react';
import { suggestCategoryForTitle } from '../services/notification/CategoryClassifier';

export type CategoryType = 'Expense' | 'Income' | 'Investment' | 'Loan & Lend';

interface EditTransactionModalProps {
  transaction?: Partial<Transaction> | null;
  categories: Category[];
  accounts?: FinancialAccount[];
  loans?: LoanRecord[];
  initialCategoryType?: CategoryType;
  onSave: (tx: Transaction) => void;
  onAddInvestment?: (inv: InvestmentRecord) => void;
  onAddLoan?: (loan: LoanRecord) => void;
  onClose: () => void;
  currencySymbol: string;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  transaction,
  categories,
  accounts = [],
  initialCategoryType,
  onSave,
  onAddInvestment,
  onAddLoan,
  onClose,
  currencySymbol,
}) => {
  const isEditingExisting = Boolean(transaction && transaction.id);

  // Category Type selection: Expense, Income, Investment, Loan & Lend
  const [categoryType, setCategoryType] = useState<CategoryType>(() => {
    if (initialCategoryType) return initialCategoryType;
    if (transaction?.type === 'credit') return 'Income';
    return 'Expense';
  });

  // --- Transaction State (Expense / Income) ---
  const [txDate, setTxDate] = useState<string>(
    transaction?.date || new Date().toISOString().slice(0, 10)
  );
  const [txAmount, setTxAmount] = useState<string>(
    transaction?.amount ? transaction.amount.toString() : ''
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(
    transaction?.category || ''
  );
  const [txType, setTxType] = useState<TransactionType>(
    transaction?.type || (categoryType === 'Income' ? 'credit' : 'debit')
  );
  const [account, setAccount] = useState<string>(transaction?.paymentMethod || 'UPI');
  const [description, setDescription] = useState<string>(
    transaction?.title || transaction?.note || ''
  );
  const [place, setPlace] = useState<string>(transaction?.location?.name || '');
  const [referenceNum, setReferenceNum] = useState<string>('NA');
  const [tags, setTags] = useState<string[]>(['coffee', 'daily']);
  const [tagInput, setTagInput] = useState<string>('');

  // --- Investment State ---
  const [invName, setInvName] = useState<string>('');
  const [invType, setInvType] = useState<InvestmentType>('Mutual Funds');
  const [invAmount, setInvAmount] = useState<string>('');
  const [invMarketValue, setInvMarketValue] = useState<string>('');
  const [invNotes, setInvNotes] = useState<string>('');

  // --- Loan / Lend State ---
  const [loanDate, setLoanDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loanType, setLoanType] = useState<LoanType>('loan');
  const [loanPerson, setLoanPerson] = useState<string>('');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [loanAccount, setLoanAccount] = useState<string>('UPI');
  const [loanNotes, setLoanNotes] = useState<string>('');
  const [loanRefNum, setLoanRefNum] = useState<string>('NA');

  const [autoMatchedCategory, setAutoMatchedCategory] = useState<string | null>(null);

  // Handle category type change
  const handleCategoryTypeChange = (newType: CategoryType) => {
    setCategoryType(newType);
    if (newType === 'Income') {
      setTxType('credit');
    } else if (newType === 'Expense') {
      setTxType('debit');
    }
  };

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    if (!isEditingExisting) {
      const match = suggestCategoryForTitle(val, txType);
      if (match) {
        setSelectedCategory(match.category);
        if (match.categoryType !== categoryType) {
          setCategoryType(match.categoryType);
        }
        setAutoMatchedCategory(match.category);
      }
    }
  };

  const handlePlaceChange = (val: string) => {
    setPlace(val);
    if (!isEditingExisting && !description) {
      const match = suggestCategoryForTitle(val, txType);
      if (match) {
        setSelectedCategory(match.category);
        if (match.categoryType !== categoryType) {
          setCategoryType(match.categoryType);
        }
        setAutoMatchedCategory(match.category);
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
    const numAmount = parseFloat(txAmount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    const savedCategory =
      selectedCategory || (categories.length > 0 ? categories[0].name : 'General');

    const savedTx: Transaction = {
      id:
        transaction?.id ||
        'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      title: description.trim() || place.trim() || 'Transaction',
      amount: numAmount,
      type: txType,
      category: savedCategory,
      subcategory: 'General',
      date: txDate,
      time: transaction?.time || new Date().toTimeString().slice(0, 5),
      source: (account === 'UPI' ? 'UPI' : 'Manual') as PaymentSource,
      payeeOrPayer: place.trim() || description.trim() || 'Merchant',
      paymentMethod: account,
      location: {
        lat: transaction?.location?.lat || 19.076,
        lng: transaction?.location?.lng || 72.8777,
        name: place.trim() || 'Location',
      },
      rawText: transaction?.rawText,
      note: tags.length > 0 ? `${description} [Tags: #${tags.join(', #')}]` : description,
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

    const newInv: InvestmentRecord = {
      id: 'inv_' + Date.now(),
      name: invName.trim() || 'New Investment',
      type: invType,
      amountInvested: numInv,
      currentValue: numVal,
      returnsPercent: returnPct,
      date: new Date().toISOString().slice(0, 10),
      monthlyContributions: [{ month: new Date().toISOString().slice(0, 7), amount: numInv }],
      notes: invNotes.trim(),
    };

    if (onAddInvestment) {
      onAddInvestment(newInv);
    }
    onClose();
  };

  const handleSaveLoan = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(loanAmount);
    if (isNaN(numAmount) || numAmount <= 0 || !loanPerson.trim()) return;

    const newLoan: LoanRecord = {
      id: 'loan_' + Date.now(),
      title: `${loanType === 'loan' ? 'Borrowed from' : 'Lent to'} ${loanPerson.trim()}`,
      personOrBank: loanPerson.trim(),
      type: loanType,
      totalAmount: numAmount,
      remainingAmount: numAmount,
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      status: 'active',
      repayments: [],
      notes: `${loanNotes} (Account: ${loanAccount}${
        loanRefNum && loanRefNum !== 'NA' ? `, Ref: ${loanRefNum}` : ''
      })`,
    };

    if (onAddLoan) {
      onAddLoan(newLoan);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#111111] border border-[#222] p-5 sm:p-6 rounded-3xl max-w-md w-full shadow-2xl relative my-auto">
        {/* ==================== FORM FOR EXPENSE & INCOME ==================== */}
        {(categoryType === 'Expense' || categoryType === 'Income') && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#222]">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-[0.25em]">
                {isEditingExisting ? 'EDIT TRANSACTION' : 'ADD TRANSACTION'}
              </h3>
              <button
                onClick={onClose}
                className="text-[#666] hover:text-white transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-3.5 font-mono">
              {/* Row 1: DATE & AMOUNT */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    DATE
                  </label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600 appearance-none"
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
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
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
                </select>
              </div>

              {/* Row 3: CATEGORY */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider">
                    CATEGORY
                  </label>
                  {autoMatchedCategory && selectedCategory === autoMatchedCategory && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-800/60">
                      <Sparkles className="w-2.5 h-2.5" />
                      Auto-matched: {autoMatchedCategory}
                    </span>
                  )}
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setAutoMatchedCategory(null);
                  }}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
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
                              <option key={a.id} value={`${a.bankName} (**${a.accountNumberLast4})`}>
                                {a.bankName} (**{a.accountNumberLast4}) - {a.name}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Credit Cards (CRED)">
                          {accounts
                            .filter((a) => a.type === 'Credit Card')
                            .map((a) => (
                              <option key={a.id} value={`${a.bankName} CC (**${a.accountNumberLast4})`}>
                                {a.cardNetwork ? `${a.bankName} ${a.cardNetwork}` : a.bankName} (**{a.accountNumberLast4})
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Wallets & UPI">
                          {accounts
                            .filter((a) => a.type === 'Wallet/UPI')
                            .map((a) => (
                              <option key={a.id} value={a.name}>
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
                        <option value="Kotak Bank (**4666)">Kotak Bank (**4666)</option>
                        <option value="HDFC Bank (**1204)">HDFC Bank (**1204)</option>
                        <option value="ICICI Bank (**8921)">ICICI Bank (**8921)</option>
                        <option value="ICICI Coral RuPay (**0001)">ICICI Coral RuPay (**0001)</option>
                        <option value="HDFC Regalia Visa (**0683)">HDFC Regalia Visa (**0683)</option>
                        <option value="Axis Atlas Mastercard (**9823)">Axis Atlas Mastercard (**9823)</option>
                        <option value="PhonePe UPI">PhonePe UPI</option>
                        <option value="Google Pay">Google Pay</option>
                        <option value="Paytm Wallet">Paytm Wallet</option>
                        <option value="Cash">Cash</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Row 5: DESCRIPTION */}
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

              {/* Row 6: PLACE & REFERENCE # */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    PLACE
                  </label>
                  <input
                    type="text"
                    value={place}
                    onChange={(e) => handlePlaceChange(e.target.value)}
                    placeholder="Where?"
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    REFERENCE #
                  </label>
                  <input
                    type="text"
                    value={referenceNum}
                    onChange={(e) => setReferenceNum(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>
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
                    className="px-3 bg-[#181818] border border-[#222] text-white rounded-xl hover:bg-[#252525] transition-colors flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tags.map((tg, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-[#181818] border border-[#282828] text-[10px] font-mono text-[#aaa] rounded-lg flex items-center gap-1"
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

              {/* SAVE TRANSACTION Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-mono font-bold text-xs uppercase tracking-[0.15em] rounded-xl transition-colors cursor-pointer shadow-lg shadow-red-900/20"
                >
                  SAVE TRANSACTION
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

              {/* Row 3: ASSET CATEGORY */}
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

              {/* Row 5: NOTES */}
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
                  className="px-4 py-3 bg-[#1a1a1a] border border-[#333] hover:bg-[#252525] text-white font-mono text-xs uppercase rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-mono font-bold text-xs uppercase tracking-[0.1em] rounded-xl transition-colors cursor-pointer shadow-lg shadow-red-900/20"
                >
                  SAVE INVESTMENT
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ==================== FORM FOR LOAN & LEND ==================== */}
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
                </select>
              </div>

              {/* Row 2: DATE & TYPE */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                    DATE
                  </label>
                  <input
                    type="date"
                    required
                    value={loanDate}
                    onChange={(e) => setLoanDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>

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
              </div>

              {/* Row 3: PERSON */}
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
                    value={loanAccount}
                    onChange={(e) => setLoanAccount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  >
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank Account">Bank Account</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Wallet">Wallet</option>
                  </select>
                </div>
              </div>

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
                  className="w-full py-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-mono font-bold text-xs uppercase tracking-[0.15em] rounded-xl transition-colors cursor-pointer shadow-lg shadow-red-900/20"
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
