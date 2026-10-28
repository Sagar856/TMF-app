import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, X } from 'lucide-react';

export interface InfoButtonProps {
  id?: string;
  title?: string;
  content: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  buttonClassName?: string;
}

export const InfoButton: React.FC<InfoButtonProps> = ({
  id,
  title = 'Information',
  content,
  align = 'right',
  size = 'xs',
  className = '',
  buttonClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  // Horizontal offset (px, relative to the trigger) that keeps the popover inside the viewport.
  const [popoverOffset, setPopoverOffset] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clamp the popover inside the viewport on narrow screens instead of letting
  // a fixed left/right alignment push it off-screen.
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const popoverWidth = Math.min(window.innerWidth >= 640 ? 288 : 256, window.innerWidth - 24);
    const rect = containerRef.current.getBoundingClientRect();
    const margin = 12;
    let preferredLeft: number;
    if (align === 'left') preferredLeft = rect.left;
    else if (align === 'right') preferredLeft = rect.right - popoverWidth;
    else preferredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const clampedLeft = Math.max(margin, Math.min(preferredLeft, window.innerWidth - margin - popoverWidth));
    setPopoverOffset(Math.round(clampedLeft - rect.left));
  }, [isOpen, align]);

  // Click outside / Escape listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const sizeClasses = {
    xs: 'p-1 text-[11px]',
    sm: 'p-1.5 text-xs',
    md: 'p-2 text-sm',
  };

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
  };

  const alignClasses = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  };

  return (
    <div ref={containerRef} className={`relative inline-flex items-center shrink-0 ${className}`}>
      <button
        id={id}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-label={title || 'Information'}
        title={typeof content === 'string' ? content : title}
        className={`rounded-lg border transition-all cursor-pointer flex items-center justify-center select-none ${sizeClasses[size]} ${
          isOpen
            ? 'bg-red-50 dark:bg-red-950/70 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 shadow-xs'
            : 'bg-surface-2 border-line text-content-3 hover:text-content-1 hover:bg-surface-3'
        } ${buttonClassName}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Info className={`${iconSizes[size]} stroke-[2.2]`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-label={title}
            style={popoverOffset !== null ? { left: popoverOffset } : undefined}
            className={`absolute top-full mt-1.5 w-64 sm:w-72 max-w-[calc(100vw-1.5rem)] p-3 bg-surface-1 backdrop-blur-xl border border-line-strong rounded-xl shadow-xl z-popover text-left font-mono ${
              popoverOffset === null ? alignClasses[align] : ''
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-line">
              <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400 font-bold uppercase text-[10px] tracking-wider">
                <Info className="w-3 h-3 shrink-0" />
                <span className="truncate">{title}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-content-3 hover:text-content-1 p-0.5 cursor-pointer rounded transition-colors"
                aria-label="Close"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Content Body */}
            <div className="text-[11px] text-content-2 leading-relaxed font-mono">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
