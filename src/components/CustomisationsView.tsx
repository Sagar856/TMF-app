import React, { useState } from 'react';
import { Category, FinancialAccount, AccountType } from '../types/finance';
import { Sliders, Plus, Trash2, Edit3, Check, X, ShieldAlert, Building2, CreditCard, Edit2 } from 'lucide-react';

interface CustomisationsViewProps {
  categories: Category[];
  accounts?: FinancialAccount[];
  onAddCategory: (cat: Category) => void;
  onUpdateCategory: (cat: Category) => void;
  onDeleteCategory: (id: string) => void;
  onAddAccount?: (acc: FinancialAccount) => void;
  onUpdateAccount?: (acc: FinancialAccount) => void;
  onDeleteAccount?: (id: string) => void;
  currencySymbol: string;
}

export const CustomisationsView: React.FC<CustomisationsViewProps> = ({
  categories,
  accounts = [],
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  currencySymbol,
}) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'budgets' | 'accounts'>('categories');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // New category state
  const [catName, setCatName] = useState<string>('');
  const [catType, setCatType] = useState<'income' | 'expense' | 'investment'>('expense');
  const [subcategoriesInput, setSubcategoriesInput] = useState<string>('');
  const [budgetLimitInput, setBudgetLimitInput] = useState<string>('');

  // Editing budget limit inline
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingBudgetVal, setEditingBudgetVal] = useState<string>('');

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    const subs = subcategoriesInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const budget = parseFloat(budgetLimitInput);

    const newCat: Category = {
      id: 'cat_' + Date.now(),
      name: catName.trim(),
      type: catType,
      iconName: 'Tag',
      subcategories: subs.length > 0 ? subs : ['General'],
      budgetLimit: !isNaN(budget) && budget > 0 ? budget : undefined,
    };

    onAddCategory(newCat);
    setShowAddModal(false);
    setCatName('');
    setSubcategoriesInput('');
    setBudgetLimitInput('');
  };

  const handleSaveBudgetLimit = (category: Category) => {
    const val = parseFloat(editingBudgetVal);
    if (isNaN(val) || val <= 0) {
      onUpdateCategory({ ...category, budgetLimit: undefined });
    } else {
      onUpdateCategory({ ...category, budgetLimit: val });
    }
    setEditingBudgetId(null);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold font-mono text-white tracking-tight">
            Categories & Budget Customisations
          </h2>
          <p className="text-xs text-[#777] font-mono mt-0.5">
            Configure custom categories (food, fuel, tech), subcategories, and monthly spending limits
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase rounded-xl hover:bg-neutral-200 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Custom Category</span>
        </button>
      </div>

      {/* Tabs: Categories vs Monthly Budgets vs Bank & Card Accounts */}
      <div className="flex flex-wrap gap-2 border-b border-nothing pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase rounded-xl transition-colors cursor-pointer ${
            activeTab === 'categories'
              ? 'bg-white text-black'
              : 'text-[#888] hover:text-white hover:bg-obsidian'
          }`}
        >
          Categories & Subcategories
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('budgets')}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase rounded-xl transition-colors cursor-pointer ${
            activeTab === 'budgets'
              ? 'bg-white text-black'
              : 'text-[#888] hover:text-white hover:bg-obsidian'
          }`}
        >
          Monthly Budget Limits
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase rounded-xl transition-colors cursor-pointer ${
            activeTab === 'accounts'
              ? 'bg-white text-black'
              : 'text-[#888] hover:text-white hover:bg-obsidian'
          }`}
        >
          Manage Bank & Card Accounts ({accounts.length})
        </button>
      </div>

      {/* View 1: Categories & Subcategories List */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {['expense', 'income', 'investment'].map((typeKey) => {
            const filteredCats = categories.filter((c) => c.type === typeKey);

            return (
              <div key={typeKey} className="bg-carbon border border-nothing p-5 rounded-3xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-nothing">
                  <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                    {typeKey} Categories
                  </h3>
                  <span className="text-[10px] text-[#666] font-mono">{filteredCats.length} total</span>
                </div>

                <div className="space-y-3">
                  {filteredCats.map((cat) => (
                    <div key={cat.id} className="p-3.5 bg-obsidian border border-nothing rounded-2xl">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-xs font-mono text-white">{cat.name}</div>
                        <button
                          onClick={() => onDeleteCategory(cat.id)}
                          className="text-[#666] hover:text-red-500 transition-colors"
                          title="Delete category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Subcategories Tags */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {cat.subcategories.map((sub, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-[#181818] border border-[#2a2a2a] text-[10px] font-mono text-[#aaa] rounded"
                          >
                            {sub}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View 2: Budget Setup & Limits */}
      {activeTab === 'budgets' && (
        <div className="bg-carbon border border-nothing p-6 rounded-3xl space-y-4">
          <div className="mb-4">
            <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
              Monthly Expense Budgets
            </h3>
            <p className="text-xs text-[#777] font-mono">
              Set spending thresholds to receive warning notifications when spending exceeds limits
            </p>
          </div>

          <div className="space-y-3">
            {categories
              .filter((c) => c.type === 'expense')
              .map((cat) => {
                const isEditing = editingBudgetId === cat.id;

                return (
                  <div
                    key={cat.id}
                    className="p-4 bg-obsidian border border-nothing rounded-2xl flex items-center justify-between flex-wrap gap-4"
                  >
                    <div>
                      <div className="font-bold text-xs font-mono text-white">{cat.name}</div>
                      <div className="text-[10px] text-[#666] font-mono mt-0.5">
                        {cat.subcategories.join(', ')}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editingBudgetVal}
                            onChange={(e) => setEditingBudgetVal(e.target.value)}
                            placeholder="e.g. 15000"
                            className="px-2.5 py-1 bg-carbon border border-red-500 rounded text-xs font-mono text-white w-28 focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveBudgetLimit(cat)}
                            className="p-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-right">
                          <div className="text-sm font-mono font-bold text-white">
                            {cat.budgetLimit
                              ? `${currencySymbol}${cat.budgetLimit.toLocaleString('en-IN')}`
                              : 'No Limit Set'}
                          </div>
                          <button
                            onClick={() => {
                              setEditingBudgetId(cat.id);
                              setEditingBudgetVal(cat.budgetLimit ? cat.budgetLimit.toString() : '');
                            }}
                            className="text-[10px] font-mono text-red-400 hover:underline mt-0.5"
                          >
                            {cat.budgetLimit ? 'Edit Limit' : '+ Set Monthly Budget'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* View 3: Manage Bank & Card Accounts */}
      {activeTab === 'accounts' && (
        <div className="bg-carbon border border-nothing p-6 rounded-3xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-nothing">
            <div>
              <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-red-500" />
                <span>LINKED ACCOUNTS & CREDIT CARDS ({accounts.length})</span>
              </h3>
              <p className="text-[10px] font-mono text-[#777] mt-0.5">
                Customize account details, bank names, last 4 digits, and monthly credit card bill estimates
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="p-4 bg-obsidian border border-nothing rounded-2xl flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-red-500 font-bold font-mono text-xs">
                    {acc.bankName.slice(0, 3).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                      {acc.name}
                      <span className="text-[9px] bg-[#222] text-[#aaa] font-mono px-1.5 py-0.5 rounded">
                        {acc.type}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#777] mt-0.5">
                      Bank: {acc.bankName} • Last 4: **{acc.accountNumberLast4}
                    </div>
                    {acc.type === 'Credit Card' && (
                      <div className="text-[10px] font-mono text-amber-400 mt-0.5">
                        Est Monthly Bill: {currencySymbol}{(acc.approxMonthlyBill || acc.balance).toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-emerald-400">
                    {currencySymbol}{acc.balance.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[9px] text-[#666] uppercase">Balance</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-carbon border border-nothing p-6 rounded-3xl max-w-md w-full shadow-2xl relative">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-nothing">
              <h3 className="text-sm font-bold font-mono text-white uppercase">Add Custom Category</h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#666] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Category Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCatType('expense')}
                    className={`py-2 text-[11px] font-mono font-bold uppercase rounded-xl ${
                      catType === 'expense' ? 'bg-red-600 text-white' : 'bg-obsidian text-[#777]'
                    }`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatType('income')}
                    className={`py-2 text-[11px] font-mono font-bold uppercase rounded-xl ${
                      catType === 'income' ? 'bg-green-600 text-white' : 'bg-obsidian text-[#777]'
                    }`}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatType('investment')}
                    className={`py-2 text-[11px] font-mono font-bold uppercase rounded-xl ${
                      catType === 'investment' ? 'bg-white text-black' : 'bg-obsidian text-[#777]'
                    }`}
                  >
                    Investment
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Subscriptions or Gaming"
                  className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Subcategories (Comma Separated)
                </label>
                <input
                  type="text"
                  value={subcategoriesInput}
                  onChange={(e) => setSubcategoriesInput(e.target.value)}
                  placeholder="e.g. Food, Fuel, Rent, Netflix"
                  className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              {catType === 'expense' && (
                <div>
                  <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                    Monthly Budget Limit ({currencySymbol}) - Optional
                  </label>
                  <input
                    type="number"
                    value={budgetLimitInput}
                    onChange={(e) => setBudgetLimitInput(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              )}

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
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
