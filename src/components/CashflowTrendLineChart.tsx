import React, { useState } from 'react';
import { Transaction } from '../types/finance';
import { TrendingUp, ArrowUpRight, ArrowDownLeft, Activity } from 'lucide-react';

interface CashflowTrendLineChartProps {
  transactions: Transaction[];
  currencySymbol: string;
}

export const CashflowTrendLineChart: React.FC<CashflowTrendLineChartProps> = ({
  transactions,
  currencySymbol,
}) => {
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  // Filter or aggregate data points
  // For 'month', get last 7 or 10 date buckets
  const now = new Date();
  
  // Generate date points for the line graph
  const generateDataPoints = () => {
    const points: { label: string; dateStr: string; debit: number; credit: number }[] = [];

    if (period === 'week') {
      // Last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('en-US', { weekday: 'short' });

        const debit = transactions
          .filter((t) => t.type === 'debit' && t.date === dateStr)
          .reduce((sum, t) => sum + t.amount, 0);

        const credit = transactions
          .filter((t) => t.type === 'credit' && t.date === dateStr)
          .reduce((sum, t) => sum + t.amount, 0);

        points.push({ label, dateStr, debit, credit });
      }
    } else {
      // Dynamic intervals across the last 30 days up to current date
      const intervalCount = 7;
      const intervalDays = 4;
      const dates: string[] = [];

      for (let i = intervalCount - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - (i * intervalDays));
        dates.push(d.toISOString().slice(0, 10));
      }
      
      dates.forEach((dateStr) => {
        const d = new Date(dateStr);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const debit = transactions
          .filter((t) => t.type === 'debit' && t.date <= dateStr)
          .reduce((sum, t) => sum + t.amount, 0);

        const credit = transactions
          .filter((t) => t.type === 'credit' && t.date <= dateStr)
          .reduce((sum, t) => sum + t.amount, 0);

        points.push({ label, dateStr, debit, credit });
      });
    }

    return points;
  };

  const dataPoints = generateDataPoints();

  // Find max value for SVG scaling
  const maxDebitVal = Math.max(...dataPoints.map((p) => p.debit), 5000);
  const maxCreditVal = Math.max(...dataPoints.map((p) => p.credit), 5000);
  const maxVal = Math.max(maxDebitVal, maxCreditVal) * 1.1;

  // SVG Chart Dimensions
  const svgWidth = 600;
  const svgHeight = 180;
  const paddingX = 35;
  const paddingY = 25;
  const graphWidth = svgWidth - paddingX * 2;
  const graphHeight = svgHeight - paddingY * 2;

  // Calculate coordinates for debit line & credit line
  const debitCoords = dataPoints.map((pt, idx) => {
    const x = paddingX + (idx / (dataPoints.length - 1)) * graphWidth;
    const y = svgHeight - paddingY - (pt.debit / maxVal) * graphHeight;
    return { x, y, ...pt };
  });

  const creditCoords = dataPoints.map((pt, idx) => {
    const x = paddingX + (idx / (dataPoints.length - 1)) * graphWidth;
    const y = svgHeight - paddingY - (pt.credit / maxVal) * graphHeight;
    return { x, y, ...pt };
  });

  // SVG path generator function with simple linear or smooth cubic curve
  const createPathD = (coords: { x: number; y: number }[]) => {
    if (coords.length === 0) return '';
    return coords.reduce((acc, curr, i) => {
      if (i === 0) return `M ${curr.x} ${curr.y}`;
      const prev = coords[i - 1];
      const cx = (prev.x + curr.x) / 2;
      return `${acc} C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
    }, '');
  };

  const debitPathD = createPathD(debitCoords);
  const creditPathD = createPathD(creditCoords);

  // Closed path for SVG area gradient fill
  const debitAreaD = debitCoords.length > 0
    ? `${debitPathD} L ${debitCoords[debitCoords.length - 1].x} ${svgHeight - paddingY} L ${debitCoords[0].x} ${svgHeight - paddingY} Z`
    : '';

  const activePoint = activePointIndex !== null ? dataPoints[activePointIndex] : null;

  return (
    <div className="bg-carbon border border-nothing p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4">
      {/* Header Title */}
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-red-500" />
        <h3 className="text-xs sm:text-sm font-mono font-bold uppercase tracking-widest text-white">
          Cash Flow Trend Trajectory
        </h3>
      </div>

      {/* Same Row Controls: WEEK/MONTH option on left, Legend on right (one below one) */}
      <div className="flex items-center justify-between gap-2 border-t border-[#222] pt-2.5">
        {/* WEEK/MONTH Toggle on LEFT */}
        <div className="flex gap-1 bg-obsidian p-1 rounded-xl border border-nothing shrink-0">
          <button
            type="button"
            onClick={() => {
              setPeriod('week');
              setActivePointIndex(null);
            }}
            className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded-lg transition-colors cursor-pointer ${
              period === 'week' ? 'bg-white text-black' : 'text-[#666] hover:text-white'
            }`}
          >
            WEEK
          </button>
          <button
            type="button"
            onClick={() => {
              setPeriod('month');
              setActivePointIndex(null);
            }}
            className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded-lg transition-colors cursor-pointer ${
              period === 'month' ? 'bg-white text-black' : 'text-[#666] hover:text-white'
            }`}
          >
            MONTH
          </button>
        </div>

        {/* Legend on RIGHT (Stacked one below one) */}
        <div className="flex flex-col gap-1 text-[10px] font-mono shrink-0">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[#aaa]">Debit (Expenses)</span>
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[#aaa]">Credit (Income)</span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* Interactive Tooltip Callout if point active */}
      {activePoint && (
        <div className="p-3 bg-obsidian border border-red-800/80 rounded-xl flex items-center justify-between text-xs font-mono animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold">{activePoint.label}</span>
            <span className="text-[#666]">({activePoint.dateStr})</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-red-400">Debit: -{currencySymbol}{activePoint.debit.toLocaleString()}</span>
            <span className="text-emerald-400">Credit: +{currencySymbol}{activePoint.credit.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* SVG Line Chart Container */}
      <div className="relative w-full overflow-x-auto bg-obsidian border border-nothing rounded-2xl p-2 sm:p-4">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto min-w-[340px] select-none"
        >
          <defs>
            {/* Debit Red Gradient */}
            <linearGradient id="debitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dc2626" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#dc2626" stopOpacity="0.0" />
            </linearGradient>

            {/* Grid Pattern */}
            <pattern id="dotGrid" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="0.8" fill="rgba(255,255,255,0.08)" />
            </pattern>
          </defs>

          {/* Dot Grid Background */}
          <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="url(#dotGrid)" />

          {/* Horizontal Grid lines */}
          {[0.2, 0.5, 0.8].map((ratio, i) => {
            const y = paddingY + ratio * graphHeight;
            return (
              <line
                key={i}
                x1={paddingX}
                y1={y}
                x2={svgWidth - paddingX}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
              />
            );
          })}

          {/* Area under Debit curve */}
          <path d={debitAreaD} fill="url(#debitGradient)" />

          {/* Credit Line Path (Green) */}
          <path
            d={creditPathD}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Debit Line Path (Red) */}
          <path
            d={debitPathD}
            fill="none"
            stroke="#ef4444"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Nodes (Interactive Dots) */}
          {debitCoords.map((pt, idx) => {
            const isSelected = activePointIndex === idx;
            return (
              <g key={idx} className="cursor-pointer" onClick={() => setActivePointIndex(idx)}>
                {/* Touch/Hover target area */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="14"
                  fill="transparent"
                  onMouseEnter={() => setActivePointIndex(idx)}
                />

                {/* Outer Glow Ring if selected */}
                {isSelected && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="8"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    className="animate-ping opacity-75"
                  />
                )}

                {/* Node Center */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isSelected ? 5 : 3.5}
                  fill={isSelected ? '#ffffff' : '#ef4444'}
                  stroke="#000000"
                  strokeWidth="1.5"
                />

                {/* Credit Node */}
                <circle
                  cx={creditCoords[idx].x}
                  cy={creditCoords[idx].y}
                  r={isSelected ? 5 : 3.5}
                  fill={isSelected ? '#ffffff' : '#10b981'}
                  stroke="#000000"
                  strokeWidth="1.5"
                />

                {/* X Axis Label */}
                <text
                  x={pt.x}
                  y={svgHeight - 6}
                  textAnchor="middle"
                  fill={isSelected ? '#ffffff' : '#666666'}
                  fontSize="9"
                  fontFamily="Space Mono, monospace"
                  fontWeight={isSelected ? 'bold' : 'normal'}
                >
                  {pt.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
