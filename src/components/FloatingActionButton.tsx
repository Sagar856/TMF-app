import React from 'react';
import { Plus } from 'lucide-react';
import { useFabScroll } from '../hooks/useFabScroll';

interface FloatingActionButtonProps {
  onClick: () => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  visible: boolean;
  label?: string;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onClick,
  scrollContainerRef,
  visible,
  label = 'Add record',
}) => {
  const isScrolled = useFabScroll(scrollContainerRef);

  if (!visible) return null;

  return (
    <button
      type="button"
      id="global-fab-add-transaction"
      onClick={onClick}
      className={`fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-8 lg:right-8 z-fab w-11 h-11 sm:w-13 sm:h-13 bg-red-600 text-white rounded-full shadow-[0_0_20px_rgba(220,38,38,0.45)] flex items-center justify-center hover:bg-red-500 hover:scale-105 active:scale-95 hover:opacity-100 transition-all duration-300 cursor-pointer border border-red-500/80 group ${
        isScrolled ? 'opacity-30 backdrop-blur-sm shadow-none' : 'opacity-100'
      }`}
      title={`${label} (+)`}
      aria-label={label}
    >
      <Plus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5] group-hover:rotate-90 transition-transform duration-300" />
    </button>
  );
};
