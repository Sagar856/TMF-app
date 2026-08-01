import React from 'react';
import { Transaction } from '../types/finance';
import { MapPin, Store, ShoppingBag, Coffee, Car, Zap, Building2, ExternalLink } from 'lucide-react';

interface TopMerchantsCardProps {
  transactions: Transaction[];
  currencySymbol: string;
}

export const TopMerchantsCard: React.FC<TopMerchantsCardProps> = ({
  transactions,
  currencySymbol,
}) => {
  // Aggregate expenses by merchant/location name or payee
  const merchantMap: {
    [key: string]: {
      name: string;
      totalSpent: number;
      txCount: number;
    };
  } = {};

  const debitTxs = transactions.filter((t) => t.type === 'debit');
  const totalDebitSum = debitTxs.reduce((sum, t) => sum + t.amount, 0);

  debitTxs.forEach((t) => {
    const rawName = t.payeeOrPayer || t.location?.name || t.title;
    const key = rawName.trim();

    if (!merchantMap[key]) {
      merchantMap[key] = {
        name: key,
        totalSpent: 0,
        txCount: 0,
      };
    }

    merchantMap[key].totalSpent += t.amount;
    merchantMap[key].txCount += 1;
  });

  const sortedMerchants = Object.values(merchantMap)
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 5);

  const maxSpent = sortedMerchants.length > 0 ? sortedMerchants[0].totalSpent : 1;

  // Distinct visual colors for the visual bar breakdown
  const barColors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-400',
    'bg-emerald-400',
    'bg-cyan-400',
  ];

  // Helper icon selection
  const getMerchantIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('apple') || lower.includes('gadget') || lower.includes('store')) return ShoppingBag;
    if (lower.includes('coffee') || lower.includes('starbucks') || lower.includes('swiggy') || lower.includes('food')) return Coffee;
    if (lower.includes('uber') || lower.includes('fuel') || lower.includes('shell') || lower.includes('petrol')) return Car;
    if (lower.includes('airtel') || lower.includes('recharge') || lower.includes('bill')) return Zap;
    return Store;
  };

  return (
    <div className="bg-carbon border border-nothing p-4 rounded-2xl space-y-4">
      {/* Visual Header */}
      <div className="flex items-center justify-between pb-2 border-b border-nothing">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-red-500 animate-pulse shrink-0" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white truncate">
            Most Spend Places & Merchants
          </h3>
        </div>
        <span className="text-[10px] font-mono font-bold text-[#888] bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
          {sortedMerchants.length} Outlets
        </span>
      </div>

      {/* Visual Graphic 1: Segmented Proportion Bar */}
      {totalDebitSum > 0 && sortedMerchants.length > 0 && (
        <div className="space-y-1.5 bg-obsidian p-2.5 rounded-xl border border-nothing">
          <div className="flex items-center justify-between text-[9px] font-mono text-[#888]">
            <span>SHARE DISTRIBUTION</span>
            <span className="text-white font-bold">{sortedMerchants.length} TOP SPEND DESTINATIONS</span>
          </div>
          <div className="w-full h-3 bg-[#111] rounded-full overflow-hidden flex p-0.5 gap-0.5 border border-[#222]">
            {sortedMerchants.map((merchant, idx) => {
              const sharePct = (merchant.totalSpent / totalDebitSum) * 100;
              if (sharePct < 1) return null;
              return (
                <div
                  key={idx}
                  title={`${merchant.name}: ${sharePct.toFixed(1)}%`}
                  style={{ width: `${sharePct}%` }}
                  className={`h-full ${barColors[idx % barColors.length]} rounded-sm transition-all hover:opacity-80`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Visual Graphic 2: Visual Merchant Bar Tiles */}
      <div className="space-y-2.5">
        {sortedMerchants.map((merchant, idx) => {
          const IconComp = getMerchantIcon(merchant.name);
          const percent = totalDebitSum > 0 ? (merchant.totalSpent / totalDebitSum) * 100 : 0;
          const relativeBarWidth = Math.max(8, (merchant.totalSpent / maxSpent) * 100);
          const colorClass = barColors[idx % barColors.length];

          return (
            <div
              key={idx}
              className="p-3 bg-obsidian border border-nothing hover:border-[#333] rounded-xl space-y-2 transition-all hover:bg-[#121212]"
            >
              {/* Row 1: Brand Info & Amount */}
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 bg-black border border-[#262626] rounded-lg flex items-center justify-center font-mono text-[10px] font-bold text-white shrink-0">
                    #{idx + 1}
                  </div>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${colorClass} bg-opacity-20 text-white border border-white/10`}>
                    <IconComp className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white font-mono truncate">
                      {merchant.name}
                    </div>
                    <div className="text-[9px] text-[#777] font-mono flex items-center gap-1">
                      <span>{merchant.txCount} transactions</span>
                      <span>•</span>
                      <span className="text-red-400 font-bold">{percent.toFixed(1)}% of total</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono">
                  <div className="text-xs sm:text-sm font-bold text-white">
                    {currencySymbol}{merchant.totalSpent.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Row 2: Visual Relative Bar Meter */}
              <div className="w-full bg-[#181818] h-2 rounded-full overflow-hidden p-0.5 border border-[#222]">
                <div
                  className={`h-full ${colorClass} rounded-full transition-all duration-500`}
                  style={{ width: `${relativeBarWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
