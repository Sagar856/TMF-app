import { useMoneyFormatter } from '../hooks/useMoneyFormatter';
import { isOperatingExpense } from '../utils/transactionKind';
import React, { useMemo, useState } from 'react';
import { Transaction, Category } from '../types/finance';
import { PieChart } from 'lucide-react';
import { InfoButton } from './InfoButton';

interface CategoryDonutChartProps {
  transactions: Transaction[];
  categories: Category[];
  currencySymbol: string;
  /** YYYY-MM to scope the chart to; omit for all time. */
  month?: string;
}

export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  transactions,
  categories,
  currencySymbol,
  month,
}) => {
  const formatAmount = useMoneyFormatter();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Operating expenses only, scoped to the selected month when provided
  const debitTransactions = useMemo(
    () => transactions.filter((t) => isOperatingExpense(t) && (!month || (t.date && t.date.startsWith(month)))),
    [transactions, month]
  );
  const totalDebit = debitTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Dot-Matrix Palette for Donut Segments
  const SEGMENT_COLORS = [
    '#dc2626', // Crimson Red
    '#eab308', // Gold Yellow
    '#06b6d4', // Cyan
    '#a855f7', // Violet
    '#10b981', // Emerald
    '#f43f5e', // Rose
    '#3b82f6', // Bright Blue
    '#64748b', // Slate
  ];
  const OTHER_COLOR = '#475569';
  const MAX_SEGMENTS = 7;

  // Group expenses by Category (case-insensitive), then fold the tail into "Other"
  const categoryData = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>();
    debitTransactions.forEach((t) => {
      const key = (t.category || 'Uncategorized').trim().toLowerCase();
      const entry = map.get(key) || { name: t.category || 'Uncategorized', amount: 0, count: 0 };
      entry.amount += t.amount;
      entry.count += 1;
      map.set(key, entry);
    });
    const sorted = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    const head = sorted.slice(0, MAX_SEGMENTS);
    const tail = sorted.slice(MAX_SEGMENTS);
    const rows = head.map((row, idx) => ({ ...row, color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length], isOther: false }));
    if (tail.length > 0) {
      rows.push({
        name: `Other (${tail.length})`,
        amount: tail.reduce((s, r) => s + r.amount, 0),
        count: tail.reduce((s, r) => s + r.count, 0),
        color: OTHER_COLOR,
        isOther: true,
      });
    }
    return rows.map((row) => ({ ...row, percent: totalDebit > 0 ? (row.amount / totalDebit) * 100 : 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debitTransactions, totalDebit]);

  // Calculate SVG Donut Arcs
  const radius = 70;
  const strokeWidth = 24;
  const center = 100;
  const circumference = 2 * Math.PI * radius;

  let cumulativeAngle = 0;

  const arcs = categoryData.map((cat) => {
    const strokeDasharray = `${(cat.percent / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -cumulativeAngle;
    cumulativeAngle += (cat.percent / 100) * circumference;
    return { ...cat, strokeDasharray, strokeDashoffset };
  });

  const activeCategory = hoveredIndex !== null ? categoryData[hoveredIndex] : null;

  return (
    <div className="bg-carbon border border-nothing p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-nothing">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-red-500" />
          <h3 className="text-xs sm:text-sm font-mono font-bold uppercase tracking-widest text-white">
            Category Expense Donut
          </h3>
          <InfoButton
            id="category-donut-info"
            title="Category Expense Donut"
            content={month ? 'Proportional breakdown of this month\u2019s operating expenses by category. Investments, EMIs and transfers are excluded.' : 'Proportional breakdown of all operating expenses by category.'}
            align="left"
          />
        </div>
        <span className="text-[10px] text-[#666] font-mono uppercase tracking-wider">
          {month ? `${month} · ` : ''}{categoryData.filter((c) => !c.isOther).length}{categoryData.some((c) => c.isOther) ? '+' : ''} Categories
        </span>
      </div>

      {debitTransactions.length === 0 ? (
        <div className="py-10 text-center space-y-1">
          <div className="text-xs font-mono font-bold text-white">No expenses {month ? 'this month' : 'yet'}</div>
          <div className="text-[10px] font-mono text-[#666]">Spending by category will appear here once you log an expense.</div>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* SVG Donut */}
        <div className="relative flex items-center justify-center p-2">
          <svg viewBox="0 0 200 200" className="w-48 h-48 sm:w-56 sm:h-56 select-none transform -rotate-90">
            {/* Background Base Ring */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={strokeWidth}
            />

            {/* Segment Arcs */}
            {arcs.map((arc, idx) => {
              const isHovered = hoveredIndex === idx;
              return (
                <circle
                  key={idx}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={arc.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={arc.strokeDasharray}
                  strokeDashoffset={arc.strokeDashoffset}
                  className="transition-all duration-300 cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => setHoveredIndex(hoveredIndex === idx ? null : idx)}
                />
              );
            })}
          </svg>

          {/* Central Summary Callout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
            <div className="text-[9px] uppercase font-mono text-[#777] tracking-wider">
              {activeCategory ? activeCategory.name : 'Total Expense'}
            </div>
            <div className="text-sm sm:text-base font-mono font-bold text-white mt-0.5">
              {currencySymbol}
              {formatAmount((activeCategory ? activeCategory.amount : totalDebit))}
            </div>
            <div className="text-[10px] font-mono text-red-500 font-bold mt-0.5">
              {activeCategory ? `${activeCategory.percent.toFixed(1)}% share` : `${debitTransactions.length} Txns`}
            </div>
          </div>
        </div>

        {/* Category Legend List (all segments, scrollable) */}
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {categoryData.map((cat, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isHovered
                    ? 'bg-obsidian border-red-600/80 shadow-[0_0_12px_rgba(220,38,38,0.2)]'
                    : 'bg-obsidian/60 border-nothing hover:border-[#333]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-3 h-3 rounded-md shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <div>
                    <div className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                      {cat.name}
                    </div>
                    <div className="text-[10px] font-mono text-[#666]">
                      {cat.count} txns · {cat.percent.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-white">
                    {currencySymbol}{formatAmount(cat.amount)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
};
