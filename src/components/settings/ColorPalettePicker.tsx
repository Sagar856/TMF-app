import React, { useEffect, useRef, useState } from 'react';
import { Check, TrendingUp, Bell, Sun, Wallet, LayoutGrid, ArrowLeftRight, Landmark, ChartNoAxesCombined, HandCoins, Settings, type LucideIcon } from 'lucide-react';
import { BrandMark } from '../BrandMark';
import { getUiPalette, UI_PALETTES, type UiPalette } from '../../utils/uiPalette';

interface ColorPalettePickerProps {
  value: UiPalette;
  onChange: (value: UiPalette) => void;
  currencySymbol?: string;
}

const PREVIEW_NAV: { icon: LucideIcon; label: string }[] = [
  { icon: LayoutGrid, label: 'Home' }, { icon: ArrowLeftRight, label: 'Txns' },
  { icon: Landmark, label: 'Accounts' }, { icon: ChartNoAxesCombined, label: 'Invest' },
  { icon: HandCoins, label: 'Loans' }, { icon: Settings, label: 'Settings' },
];

export const ColorPalettePicker: React.FC<ColorPalettePickerProps> = ({ value, onChange, currencySymbol = '₹' }) => {
  const [preview, setPreview] = useState(value);
  const tilesRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  useEffect(() => {
    const stage = stageRef.current;
    const home = homeRef.current;
    if (!stage || !home) return;
    const fitPreview = () => {
      setPreviewScale(Math.min(1, stage.clientWidth / home.offsetWidth, stage.clientHeight / home.offsetHeight));
    };
    const observer = new ResizeObserver(fitPreview);
    observer.observe(stage);
    observer.observe(home);
    fitPreview();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setPreview(value); }, [value]);
  const palette = getUiPalette(preview);
  const previewStyle = { '--ui-hue-shift': palette.hueShift } as React.CSSProperties;
  useEffect(() => {
    const tiles = tilesRef.current;
    const tile = tiles?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    if (tiles && tile) tiles.scrollTo({ left: tile.offsetLeft - tiles.offsetLeft - (tiles.clientWidth - tile.offsetWidth) / 2, behavior: 'auto' });
  }, [preview]);

  return (
    <div className="palette-selection-content">
      <div ref={stageRef} className="palette-preview-stage" style={previewStyle}>
        <div ref={homeRef} className="palette-home-preview" style={{ transform: `translate(-50%, -50%) scale(${previewScale})` }}
          role="img" aria-label={`Home page preview in ${palette.name}. Illustrative balances, not your financial data.`}>
          <div aria-hidden="true">
            <div className="flex items-center justify-between gap-3 text-xs font-bold">
              <span className="flex items-center gap-1.5"><BrandMark className="h-6 w-6" />MINARTH</span>
              <span className="flex gap-2"><Sun className="h-3.5 w-3.5" /><Bell className="h-3.5 w-3.5" /></span>
            </div>
            <div className="palette-preview-inset my-3 w-fit rounded-lg border px-2 py-1 text-[9px] font-bold">
              NET WORTH: {currencySymbol}0.00
            </div>
            <div className="mb-2 flex justify-between text-[9px] font-bold">
              <span>FINANCIAL METRICS</span><span className="palette-preview-inset rounded px-1">MONTH · ALL TIME</span>
            </div>
            <div className="palette-preview-feature rounded-xl border p-3">
              <p className="flex items-center gap-1 text-[9px]"><Wallet className="h-3 w-3" />CASH IN ACCOUNTS</p>
              <p className="mt-1 text-xl font-bold">{currencySymbol}0.00</p>
            </div>
            <div className="palette-preview-inset mx-1 h-2 rounded-b-xl border" />
            <div className="palette-preview-inset mx-2 h-1.5 rounded-b-xl border" />
            <div className="palette-home-panel mt-3">
              <p className="mb-2 text-[9px] font-bold">RECENT ACTIVITY</p>
              <div className="grid grid-cols-3 gap-2">
                {['Groceries', 'Lunch', 'Travel'].map(label => (
                  <div key={label} className="palette-preview-inset rounded-lg border p-2 text-[8px]">
                    <p>{label}</p><p className="mt-1 font-bold text-red-500">-{currencySymbol}0.00</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="palette-home-panel mt-3">
              <p className="flex items-center gap-1 text-[9px] font-bold"><TrendingUp className="h-3 w-3" />CASH FLOW TREND TRAJECTORY</p>
              <div className="mt-2 flex justify-between text-[8px]"><span>WEEK · MONTH</span><span>Debit / Credit</span></div>
              <svg viewBox="0 0 280 60" className="mt-2 w-full" aria-hidden="true">
                <path d="M5 52 H275 M5 28 H275" stroke="currentColor" opacity=".12" />
                <path d="M8 45 L58 39 L108 43 L158 23 L208 30 L272 12" fill="none" stroke="var(--glass-chart-accent)" strokeWidth="3" />
                <path d="M8 51 L58 51 L108 49 L158 48 L208 22 L272 22" fill="none" stroke="var(--glass-chart-credit)" strokeWidth="2" />
              </svg>
            </div>
            <div className="palette-home-panel mt-3 flex items-center justify-between text-[9px] font-bold">
              <span>MONITOR BUDGET</span><span className="palette-home-accent">7-DAY SPENDING</span>
            </div>
            <div className="mt-3 flex justify-between border-t pt-2 text-[7px]">
              {PREVIEW_NAV.map(({ icon: NavIcon, label }) => (
                <span key={label} className={`flex flex-col items-center gap-1 ${label === 'Home' ? 'palette-home-accent' : ''}`}>
                  <NavIcon className="h-3 w-3" />{label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="palette-caption text-center" aria-live="polite">
        <h3 className="text-base font-bold text-content-1">{palette.name}</h3>
        <p className="mt-1 text-xs text-content-3">{palette.description}</p>
      </div>
      <div ref={tilesRef} className="palette-tiles relative flex gap-3 overflow-x-auto px-1 py-2" role="radiogroup" aria-label="UI color palette"
        onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const index = UI_PALETTES.findIndex(option => option.id === preview);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? UI_PALETTES.length - 1
            : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + UI_PALETTES.length) % UI_PALETTES.length;
          setPreview(UI_PALETTES[next].id);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
        }}>
        {UI_PALETTES.map(option => (
          <button
            key={option.id} type="button" role="radio" aria-checked={preview === option.id}
            tabIndex={preview === option.id ? 0 : -1}
            aria-label={option.name} onClick={() => setPreview(option.id)}
            className="palette-option flex shrink-0 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center text-[10px] font-bold"
          >
            <span className="palette-swatch flex h-10 w-12 items-center justify-center rounded-lg"
              style={{ '--ui-hue-shift': option.hueShift } as React.CSSProperties}>
              {preview === option.id && <Check className="h-4 w-4 text-white" aria-hidden="true" />}
            </span>
            {option.name}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onChange(preview)} disabled={preview === value}
        style={previewStyle}
        className="palette-apply w-full rounded-xl border px-4 py-3 text-xs font-bold disabled:cursor-default disabled:opacity-60">
        {preview === value ? `${palette.name} applied` : `Apply ${palette.name}`}
      </button>
      <p className="palette-selection-note text-[10px] leading-relaxed text-content-3">
        UI and logo colors follow your palette. Glass effects, financial status colors and the logo shape stay the same.
      </p>
    </div>
  );
};
