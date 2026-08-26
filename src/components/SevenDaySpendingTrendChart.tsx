import React, { useState, useMemo, useRef } from 'react';
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
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useScrollFocusSection } from '../hooks/useScrollFocusSection';
import { CarouselSectionState } from '../hooks/useScrollCarouselGroup';

interface SevenDaySpendingTrendChartProps {
  transactions: Transaction[];
  currencySymbol: string;
  carouselState?: CarouselSectionState;
  containerRef?: (el: HTMLDivElement | null) => void;
  contentRef?: (el: HTMLDivElement | null) => void;
  onToggleExpand?: () => void;
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
  carouselState,
  containerRef: externalContainerRef,
  contentRef: externalContentRef,
  onToggleExpand: externalToggleExpand,
}) => {
  // Self-managed scroll focus if not controlled by parent group
  const selfScroll = useScrollFocusSection({
    enabled: !carouselState,
    centerFocusRatio: 0.46,
    focusRadius: 0.38,
  });

  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const internalContentRef = useRef<HTMLDivElement | null>(null);

  // Combine external and internal refs
  const handleContainerRef = (el: HTMLDivElement | null) => {
    internalContainerRef.current = el;
    if (externalContainerRef) externalContainerRef(el);
    if (!carouselState && selfScroll.containerRef) {
      (selfScroll.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }
  };

  const handleContentRef = (el: HTMLDivElement | null) => {
    internalContentRef.current = el;
    if (externalContentRef) externalContentRef(el);
    if (!carouselState && selfScroll.contentRef) {
      (selfScroll.contentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }
  };

  const effectiveState: CarouselSectionState = carouselState || {
    progress: selfScroll.progress,
    contentHeight: selfScroll.contentHeight,
    isExpanded: selfScroll.isExpanded,
    isFocused: selfScroll.isFocused,
    chevronRotation: selfScroll.chevronRotation,
    buttonLabel: selfScroll.buttonLabel,
    bodyStyle: selfScroll.bodyStyle,
  };

  const handleToggleExpand = () => {
    if (externalToggleExpand) {
      externalToggleExpand();
    } else {
      selfScroll.toggleManualExpand();
    }
  };

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
    <div 
      ref={handleContainerRef}
      id="seven-day-spending-trend"
      className={`bg-carbon border rounded-2xl sm:rounded-3xl font-mono text-white shadow-md transition-all duration-300 overflow-hidden ${
        effectiveState.isFocused 
          ? 'border-red-500/70 shadow-[0_10px_30px_rgba(220,38,38,0.15)] ring-1 ring-red-500/20' 
          : 'border-nothing'
      }`}
    >
      {/* Top Header with title, summary statistics and expand/collapse toggle */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222]">
        <div 
          onClick={handleToggleExpand}
          className="flex items-center gap-2 cursor-pointer select-none"
        >
          <div className={`p-1.5 rounded-lg shrink-0 transition-colors ${
            effectiveState.isFocused 
              ? 'bg-red-950/90 border border-red-500 text-red-400' 
              : 'bg-red-950/60 border border-red-800/50 text-red-500'
          }`}>
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

        {/* 7-Day Metric Badges & Collapse Toggle Button */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
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

          {/* Expand/Collapse Toggle Button */}
          <button
            type="button"
            onClick={handleToggleExpand}
            className={`p-1.5 px-2.5 bg-[#18181c] hover:bg-[#222226] border rounded-xl hover:text-white transition-colors cursor-pointer shrink-0 flex items-center gap-1 text-[10px] font-bold ${
              effectiveState.isFocused ? 'border-red-500 text-white' : 'border-[#333] text-[#aaa]'
            }`}
            title={effectiveState.buttonLabel === 'COLLAPSE' ? "Collapse 7-Day Spending Trend" : "Expand 7-Day Spending Trend"}
          >
            <span>{effectiveState.buttonLabel}</span>
            <div
              style={{ transform: `rotate(${effectiveState.chevronRotation}deg)`, transition: 'transform 0.1s linear' }}
              className="shrink-0"
            >
              <ChevronDown className="w-4 h-4 text-red-400" />
            </div>
          </button>
        </div>
      </div>

      {/* Progressive Scroll-Driven Body Content */}
      <div style={effectiveState.bodyStyle} className="will-change-[height,opacity,transform]">
        <div ref={handleContentRef} className="p-4 sm:p-5 pt-4 space-y-4">
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
                className="p-2 bg-[#121216] border border-[#222] hover:border-[#333] hover:bg-[#16161c] rounded-lg flex items-center justify-between gap-2 text-xs transition-all tactile-lift cursor-pointer"
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
      </div>
    </div>
  );
};
