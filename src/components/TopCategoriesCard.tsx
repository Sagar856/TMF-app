import React from 'react';
import { Transaction, Category } from '../types/finance';
import { Flame, PieChart, ShieldCheck } from 'lucide-react';

interface TopCategoriesCardProps {
  transactions: Transaction[];
  categories: Category[];
  currencySymbol: string;
}

export const TopCategoriesCard: React.FC<TopCategoriesCardProps> = ({
  transactions,
  categories,
  currencySymbol,
}) => {
  const debitTxs = transactions.filter((t) => t.type === 'debit');
  const totalDebitSum = debitTxs.reduce((sum, t) => sum + t.amount, 0);

  // Category spend mapping
  const categoryStats = categories
    .map((cat) => {
      const catTxs = debitTxs.filter((t) => t.category === cat.name);
      const spent = catTxs.reduce((sum, t) => sum + t.amount, 0);
      const count = catTxs.length;
      const percentOfTotal = totalDebitSum > 0 ? (spent / totalDebitSum) * 100 : 0;
      const limit = cat.budgetLimit || 0;
      const budgetPercent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;

      return {
        category: cat,
        spent,
        count,
        percentOfTotal,
        limit,
        budgetPercent,
      };
    })
    .filter((stat) => stat.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  const topCategories = categoryStats.slice(0, 5);
  const maxCategorySpent = topCategories.length > 0 ? topCategories[0].spent : 1;

  return (
    <div className="bg-carbon border border-nothing p-4 rounded-2xl space-y-4">
      {/* Visual Header */}
      <div className="flex items-center justify-between pb-2 border-b border-nothing">
        <div className="flex items-center gap-2 min-w-0">
          <Flame className="w-4 h-4 text-red-500 animate-pulse shrink-0" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white truncate">
            Top Spend Categories
          </h3>
        </div>
        <span className="text-[10px] font-mono font-bold text-[#888] bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
          {categoryStats.length} Active
        </span>
      </div>

      {/* Visual Graphic 1: Category Segmented Proportion Bar */}
      {totalDebitSum > 0 && topCategories.length > 0 && (
        <div className="space-y-1.5 bg-obsidian p-2.5 rounded-xl border border-nothing">
          <div className="flex items-center justify-between text-[9px] font-mono text-[#888]">
            <span>CATEGORY SHARE</span>
            <span className="text-emerald-400 font-bold">{totalDebitSum > 0 ? '100% OUTFLOW' : '0%'}</span>
          </div>
          <div className="w-full h-3 bg-[#111] rounded-full overflow-hidden flex p-0.5 gap-0.5 border border-[#222]">
            {topCategories.map((item, idx) => {
              if (item.percentOfTotal < 1) return null;
              return (
                <div
                  key={idx}
                  title={`${item.category.name}: ${item.percentOfTotal.toFixed(1)}%`}
                  style={{
                    width: `${item.percentOfTotal}%`,
                    backgroundColor: item.category.color || '#ef4444',
                  }}
                  className="h-full rounded-sm transition-all hover:opacity-80"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Visual Graphic 2: Visual Category Progress Cards */}
      <div className="space-y-2.5">
        {topCategories.map((item, idx) => {
          const relativeBarWidth = Math.max(10, (item.spent / maxCategorySpent) * 100);
          const catColor = item.category.color || '#ef4444';

          return (
            <div
              key={item.category.id}
              className="p-3 bg-obsidian border border-nothing hover:border-[#333] rounded-xl space-y-2 transition-all hover:bg-[#121212]"
            >
              {/* Row 1: Category Name & Spent Amount */}
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 bg-black border border-[#262626] rounded-lg flex items-center justify-center font-mono text-[9px] font-bold text-white shrink-0">
                    #{idx + 1}
                  </div>
                  <div
                    className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: catColor }}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white font-mono truncate">
                      {item.category.name}
                    </div>
                    <div className="text-[9px] text-[#777] font-mono flex items-center gap-1.5">
                      <span>{item.percentOfTotal.toFixed(1)}% share</span>
                      <span>•</span>
                      <span>{item.count} txns</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono">
                  <div className="text-xs sm:text-sm font-bold text-white">
                    {currencySymbol}{item.spent.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[9px] text-[#666]">
                    {item.limit > 0 ? `Limit: ${currencySymbol}${item.limit.toLocaleString('en-IN')}` : 'No limit set'}
                  </div>
                </div>
              </div>

              {/* Row 2: Visual Progress Bar */}
              <div className="w-full bg-[#181818] h-2 rounded-full overflow-hidden p-0.5 border border-[#222]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${relativeBarWidth}%`,
                    backgroundColor: catColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
