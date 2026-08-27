import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';

interface FloatingActionButtonProps {
  onClick: () => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  visible: boolean;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onClick,
  scrollContainerRef,
  visible,
}) => {
  const [isScrolled, setIsScrolled] = useState<boolean>(false);

  useEffect(() => {
    const target = scrollContainerRef?.current || document.querySelector('main');
    if (!target) return;

    const handleScroll = () => {
      if (target.scrollTop > 40) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    target.addEventListener('scroll', handleScroll);
    return () => target.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef]);

  if (!visible) return null;

  return (
    <button
      id="global-fab-add-transaction"
      onClick={onClick}
      className={`fixed bottom-20 right-4 sm:bottom-8 sm:right-8 z-50 w-11 h-11 sm:w-13 sm:h-13 bg-red-600 text-white rounded-full shadow-[0_0_20px_rgba(220,38,38,0.45)] flex items-center justify-center hover:bg-red-500 hover:scale-105 active:scale-95 hover:opacity-100 transition-all duration-300 cursor-pointer border border-red-500/80 group ${
        isScrolled ? 'opacity-30 backdrop-blur-sm shadow-none' : 'opacity-100'
      }`}
      title="Add Record (+)"
    >
      <Plus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5] group-hover:rotate-90 transition-transform duration-300" />
    </button>
  );
};
