import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Transaction } from '../types/finance';
import {
  TrendingDown,
  TrendingUp,
  Calendar,
  Zap,
  ArrowUpRight,
  Receipt,
  Flame,
  Info
} from 'lucide-react';

interface SevenDaySpendingTrendChartProps {
  transactions: Transaction[];
  currencySymbol: string;
}

interface DayTrendPoint {
  date: string;
  dateLabel: string;
  fullDateLabel: string;
  dayOfWeek: string;
  amount: number;
  count: number;
  transactions: Transaction[];
  topCategory: string;
}

export const SevenDaySpendingTrendChart: React.FC<SevenDaySpendingTrendChartProps> = ({
  transactions,
  currencySymbol,
}) => {
  const [selectedDay, setSelectedDay] = useState<DayTrendPoint | null>(null);

  // Compute 7-day window ending at the latest available transaction date (or today if none or recent)
  const { chartData, totalSevenDaySpend, dailyAverage, peakDay, zeroSpendDays } = useMemo(() => {
    const debitTxs = transactions.filter((t) => t.type === 'debit');

    // Find the reference end date
    let referenceEndDate: Date;
    if (debitTxs.length > 0) {
      const dates = debitTxs
        .map((t) => new Date(t.date).getTime())
        .filter((timestamp) => !isNaN(timestamp));
      
      const maxTime = dates.length > 0 ? Math.max(...dates) : Date.now();
      referenceEndDate = new Date(maxTime);
    } else {
      referenceEndDate = new Date();
    }

    // Generate 7 consecutive days up to referenceEndDate
    const points: DayTrendPoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(referenceEndDate);
      d.setDate(referenceEndDate.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      
      const dayTxs = debitTxs.filter((t) => t.date === dateStr);
      const amount = dayTxs.reduce((sum, t) => sum + t.amount, 0);

      // Find top category for this day
      const catCount: Record<string, number> = {};
      dayTxs.forEach((t) => {
        catCount[t.category] = (catCount[t.category] || 0) + t.amount;
      });
      const topCategory = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

      const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dateLabel = `${dayOfWeek} ${d.getDate()}`;
      const fullDateLabel = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      points.push({
        date: dateStr,
        dateLabel,
        fullDateLabel,
        dayOfWeek,
        amount,
        count: dayTxs.length,
        transactions: dayTxs,
        topCategory,
      });
    }

    const total = points.reduce((sum, p) => sum + p.amount, 0);
    const avg = total / 7;
    const peak = [...points].sort((a, b) => b.amount - a.amount)[0] || null;
    const zeroDays = points.filter((p) => p.amount === 0).length;

    return {
      chartData: points,
      totalSevenDaySpend: total,
      dailyAverage: avg,
      peakDay: peak,
      zeroSpendDays: zeroDays,
    };
  }, [transactions]);

  const activeDay = selectedDay || chartData[chartData.length - 1];

  return (
    <div className="bg-carbon border border-nothing p-4 sm:p-5 rounded-2xl sm:rounded-3xl space-y-4 font-mono text-white shadow-md">
      {/* Top Header with title and summary statistics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#222]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-red-950/60 border border-red-800/50 rounded-lg text-red-500 shrink-0">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-white">
                7-Day Spending Trend
              </h3>
              <span className="px-1.5 py-0.5 bg-red-950/80 text-red-400 text-[9px] font-bold rounded border border-red-800/50">
                DAILY OUTFLOW
              </span>
            </div>
            <p className="text-[10px] text-[#777] mt-0.5">
              Trailing 7-day expense velocity & day-by-day burn rate
            </p>
          </div>
        </div>

        {/* 7-Day Metric Badges */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="bg-obsidian border border-nothing px-2.5 py-1.5 rounded-xl text-right shrink-0">
            <div className="text-[9px] text-[#666] uppercase">7-Day Total</div>
            <div className="text-xs font-bold text-red-400">
              {currencySymbol}{totalSevenDaySpend.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="bg-obsidian border border-nothing px-2.5 py-1.5 rounded-xl text-right shrink-0">
            <div className="text-[9px] text-[#666] uppercase">Daily Avg</div>
            <div className="text-xs font-bold text-white">
              {currencySymbol}{Math.round(dailyAverage).toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </div>

      {/* Main Recharts Area / Line Chart */}
      <div className="relative w-full bg-obsidian border border-nothing rounded-2xl p-2.5 sm:p-4">
        {/* Chart Canvas */}
        <div className="h-52 sm:h-60 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 15, right: 12, left: -20, bottom: 5 }}
              onClick={(data) => {
                if (data && data.activePayload && data.activePayload[0]) {
                  setSelectedDay(data.activePayload[0].payload as DayTrendPoint);
                }
              }}
            >
              <defs>
                <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.45} />
                  <stop offset="65%" stopColor="#ef4444" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
                vertical={false}
              />

              <XAxis
                dataKey="dateLabel"
                stroke="#555"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: '#222' }}
                tick={{ fill: '#888', fontFamily: 'monospace' }}
              />

              <YAxis
                stroke="#555"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: '#222' }}
                tickFormatter={(val) => `${currencySymbol}${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                tick={{ fill: '#888', fontFamily: 'monospace' }}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as DayTrendPoint;
                    return (
                      <div className="bg-[#111114] border border-red-800/80 p-2.5 sm:p-3 rounded-xl shadow-2xl font-mono text-xs space-y-1.5 min-w-[170px] z-50">
                        <div className="flex items-center justify-between gap-2 border-b border-[#222] pb-1.5">
                          <span className="font-bold text-white text-[11px]">{data.fullDateLabel}</span>
                          <span className="text-[9px] px-1.5 py-0.2 bg-red-950/90 text-red-400 font-bold rounded">
                            {data.count} {data.count === 1 ? 'tx' : 'txns'}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 pt-0.5">
                          <span className="text-[10px] text-[#777]">Spent:</span>
                          <span className="font-extrabold text-red-400 text-xs sm:text-sm">
                            {currencySymbol}{data.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                        {data.count > 0 && (
                          <div className="text-[9px] text-[#888] flex items-center justify-between border-t border-[#1a1a1a] pt-1">
                            <span>Top Category:</span>
                            <span className="text-white font-bold truncate max-w-[90px]">{data.topCategory}</span>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Daily Average Benchmark Reference Line */}
              {dailyAverage > 0 && (
                <ReferenceLine
                  y={dailyAverage}
                  stroke="#eab308"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: `Avg ${currencySymbol}${Math.round(dailyAverage)}`,
                    fill: '#eab308',
                    fontSize: 9,
                    position: 'insideTopRight',
                    fontFamily: 'monospace'
                  }}
                />
              )}

              <Area
                type="monotone"
                dataKey="amount"
                stroke="#ef4444"
                strokeWidth={2.5}
                fill="url(#spendGradient)"
                activeDot={{
                  r: 6,
                  fill: '#ffffff',
                  stroke: '#ef4444',
                  strokeWidth: 3,
                  className: 'animate-pulse cursor-pointer'
                }}
                dot={{
                  r: 3.5,
                  fill: '#ef4444',
                  stroke: '#111114',
                  strokeWidth: 2
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Quick Insights Row Below Chart */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-[#222] text-[10px]">
          <div className="bg-[#111114] p-2 rounded-xl border border-[#222] flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[#666] block truncate">Peak Day</span>
              <span className="font-bold text-white truncate block">
                {peakDay ? `${peakDay.dayOfWeek} (${currencySymbol}${peakDay.amount.toLocaleString('en-IN')})` : 'N/A'}
              </span>
            </div>
          </div>

          <div className="bg-[#111114] p-2 rounded-xl border border-[#222] flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[#666] block truncate">Zero-Spend Days</span>
              <span className="font-bold text-emerald-400 truncate block">
                {zeroSpendDays} of 7 days
              </span>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-[#111114] p-2 rounded-xl border border-[#222] flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[#666] block truncate">Selected Day</span>
              <span className="font-bold text-white truncate block">
                {activeDay.dateLabel}: {currencySymbol}{activeDay.amount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Day Transaction Breakdown (if activeDay has transactions) */}
      {activeDay && activeDay.transactions.length > 0 && (
        <div className="p-3 bg-obsidian border border-nothing rounded-xl space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[#aaa]">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-red-500" />
              Transactions on {activeDay.fullDateLabel}
            </span>
            <span className="text-red-400 font-bold">
              Total: {currencySymbol}{activeDay.amount.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {activeDay.transactions.map((tx) => (
              <div
                key={tx.id}
                className="p-2 bg-[#121216] border border-[#222] rounded-lg flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-bold text-white truncate text-[11px]">{tx.title}</div>
                  <div className="text-[9px] text-[#777] truncate">{tx.category} • {tx.paymentMethod}</div>
                </div>
                <div className="font-bold text-red-400 text-xs shrink-0">
                  -{currencySymbol}{tx.amount.toLocaleString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
