import React from 'react';
import { Sparkles } from 'lucide-react';
import { useFabScroll } from '../hooks/useFabScroll';

interface AssistantShortcutProps {
  visible: boolean;
  onClick: () => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export const AssistantShortcut: React.FC<AssistantShortcutProps> = ({ visible, onClick, scrollContainerRef }) => {
  const isScrolled = useFabScroll(scrollContainerRef);
  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label="Open MINA on-device assistant"
      title="Open MINA assistant"
      onClick={onClick}
      className={`fixed right-4 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] lg:bottom-24 lg:right-8 z-fab flex h-11 w-11 sm:h-13 sm:w-13 flex-col items-center justify-center rounded-full border border-violet-400/70 bg-violet-700 text-white shadow-[0_0_18px_rgba(124,58,237,0.35)] hover:bg-violet-600 hover:opacity-100 transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
        isScrolled ? 'opacity-30 backdrop-blur-sm shadow-none' : 'opacity-100'
      }`}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="text-[9px] font-bold leading-tight">MINA</span>
    </button>
  );
};
