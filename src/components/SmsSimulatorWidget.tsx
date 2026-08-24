import React, { useState } from 'react';
import { PRESET_SMS_TEMPLATES } from '../data/initialData';
import { parseNotification } from '../services/notification/ParserManager';
import { ParsedNotification, LocationTag, Transaction } from '../types/finance';
import { Smartphone, Send, MapPin, Zap, X, ShieldAlert, AlertTriangle } from 'lucide-react';

interface SmsSimulatorWidgetProps {
  transactions?: Transaction[];
  pendingNotifications?: ParsedNotification[];
  onInterceptNotification: (notif: ParsedNotification) => void;
  onClose: () => void;
  currencySymbol: string;
}

export const SmsSimulatorWidget: React.FC<SmsSimulatorWidgetProps> = ({
  transactions = [],
  pendingNotifications = [],
  onInterceptNotification,
  onClose,
  currencySymbol,
}) => {
  const [customSms, setCustomSms] = useState<string>('');
  const [useCurrentLocation, setUseCurrentLocation] = useState<boolean>(true);
  const [customLocationName, setCustomLocationName] = useState<string>('BKC Business District');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const handleSimulate = (text: string, force = false) => {
    if (!text.trim()) return;

    // Simulate location capture
    const location: LocationTag = {
      lat: 19.0760 + (Math.random() - 0.5) * 0.05,
      lng: 72.8777 + (Math.random() - 0.5) * 0.05,
      name: customLocationName || 'Captured Mobile Coordinates',
    };

    const { parsed, isDuplicate } = parseNotification(
      text,
      useCurrentLocation ? location : null,
      transactions,
      pendingNotifications
    );

    if (isDuplicate && !force) {
      setDuplicateWarning(
        `Duplicate detected: An identical transaction (${parsed.payeeOrPayer} for ${currencySymbol}${parsed.amount.toLocaleString()}) already exists or is pending.`
      );
      return;
    }

    setDuplicateWarning(null);
    onInterceptNotification(parsed);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-carbon border border-nothing p-6 rounded-3xl max-w-lg w-full shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-nothing">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-red-950/60 border border-red-800/80 rounded-xl flex items-center justify-center text-red-500">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                UPI & SMS Interceptor Simulator
              </h3>
              <p className="text-[10px] text-[#666] font-mono">
                Simulates live bank/UPI notification interception with auto location
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Duplicate Warning Banner if triggered */}
        {duplicateWarning && (
          <div className="mb-4 p-3 bg-amber-950/60 border border-amber-600/80 rounded-2xl space-y-2 text-amber-200 text-xs font-mono">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Duplicate SMS Intercepted</span>
            </div>
            <p className="text-[11px] text-amber-300/90 leading-relaxed">{duplicateWarning}</p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="px-3 py-1 bg-black/40 border border-amber-600/50 hover:bg-black/60 rounded-lg text-[10px] text-amber-300 font-bold uppercase transition-colors"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => handleSimulate(customSms || PRESET_SMS_TEMPLATES[0].text, true)}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-[10px] font-bold uppercase transition-colors"
              >
                Queue Anyway
              </button>
            </div>
          </div>
        )}

        {/* Preset Bank / UPI Templates */}
        <div className="mb-5">
          <div className="text-[10px] text-[#666] uppercase tracking-[0.2em] font-mono mb-2 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-red-500" />
            Quick Test Presets (Indian UPI & Global Banks)
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_SMS_TEMPLATES.map((preset, index) => (
              <button
                key={index}
                onClick={() => handleSimulate(preset.text)}
                className="p-2.5 bg-obsidian hover:bg-graphite border border-nothing rounded-xl text-left transition-all group cursor-pointer"
              >
                <div className="text-[11px] font-bold text-white group-hover:text-red-400 font-mono mb-0.5">
                  {preset.label}
                </div>
                <div className="text-[9px] text-[#666] font-mono truncate">
                  {preset.text}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom SMS Input */}
        <div className="mb-5">
          <label className="block text-[10px] text-[#666] uppercase tracking-[0.2em] font-mono mb-2">
            Paste Raw Notification Text / SMS
          </label>
          <textarea
            value={customSms}
            onChange={(e) => {
              setCustomSms(e.target.value);
              if (duplicateWarning) setDuplicateWarning(null);
            }}
            placeholder="e.g. Sent Rs 1,450.00 via Google Pay to Uber India on 28-Jul-26..."
            className="w-full h-24 p-3 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white placeholder-[#444] focus:outline-none focus:border-red-600 transition-colors"
          />
        </div>

        {/* Location Simulator Settings */}
        <div className="mb-6 p-3 bg-obsidian border border-nothing rounded-xl flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-500" />
            <span className="text-[#aaa]">Attach Mobile GPS Tag</span>
          </div>
          <input
            type="text"
            value={customLocationName}
            onChange={(e) => setCustomLocationName(e.target.value)}
            className="bg-carbon border border-nothing px-2.5 py-1 rounded text-[11px] text-white focus:outline-none focus:border-red-500 font-mono w-48 text-right"
          />
        </div>

        {/* Trigger Button */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-nothing text-[#888] text-xs font-mono rounded-xl hover:text-white hover:bg-graphite transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSimulate(customSms)}
            disabled={!customSms.trim()}
            className="px-5 py-2 bg-white text-black text-xs font-mono font-bold uppercase rounded-xl hover:bg-neutral-200 disabled:opacity-40 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Trigger Interceptor
          </button>
        </div>
      </div>
    </div>
  );
};
