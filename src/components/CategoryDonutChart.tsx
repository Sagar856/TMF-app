import React, { useState } from 'react';
import { Transaction, Category } from '../types/finance';
import { PieChart } from 'lucide-react';

interface CategoryDonutChartProps {
  transactions: Transaction[];
  categories: Category[];
  currencySymbol: string;
}

export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  transactions,
  categories,
  currencySymbol,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Filter debit transactions only
  const debitTransactions = transactions.filter((t) => t.type === 'debit');
  const totalDebit = debitTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Group expenses by Category
  const categorySpendMap: { [catName: string]: { amount: number; count: number } } = {};

  debitTransactions.forEach((t) => {
    if (!categorySpendMap[t.category]) {
      categorySpendMap[t.category] = { amount: 0, count: 0 };
    }
    categorySpendMap[t.category].amount += t.amount;
    categorySpendMap[t.category].count += 1;
  });

  // Nothing Dot-Matrix Palette for Donut Segments
  const SEGMENT_COLORS = [
    '#dc2626', // Crimson Red
    '#eab308', // Gold Yellow
    '#06b6d4', // Cyan
    '#a855f7', // Violet
    '#10b981', // Emerald
    '#f43f5e', // Rose
    '#ffffff', // Pure White
    '#64748b', // Slate
  ];

  // Convert to sorted array
  const categoryData = Object.keys(categorySpendMap)
    .map((name, idx) => {
      const amount = categorySpendMap[name].amount;
      const count = categorySpendMap[name].count;
      const percent = totalDebit > 0 ? (amount / totalDebit) * 100 : 0;
      const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
      return { name, amount, count, percent, color };
    })
    .sort((a, b) => b.amount - a.amount);

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
        </div>
        <span className="text-[10px] text-[#666] font-mono uppercase tracking-wider">
          {categoryData.length} Categories
        </span>
      </div>

      {/* Donut & Stats Container */}
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
              {(activeCategory ? activeCategory.amount : totalDebit).toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] font-mono text-red-500 font-bold mt-0.5">
              {activeCategory ? `${activeCategory.percent.toFixed(1)}% share` : `${debitTransactions.length} Txns`}
            </div>
          </div>
        </div>

        {/* Category Legend List */}
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {categoryData.slice(0, 5).map((cat, idx) => {
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
                    {currencySymbol}{cat.amount.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
