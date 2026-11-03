import React from 'react';
import { motion } from 'motion/react';
import { BrandMark } from './BrandMark';

interface AppLaunchLoaderProps {
  reduceMotion: boolean;
  error?: string;
  onRetry?: () => void;
  onSignOut?: () => void;
}

export function AppLaunchLoader({ reduceMotion, error, onRetry, onSignOut }: AppLaunchLoaderProps) {
  return (
    <div className="identity-glass app-launch flex flex-col items-center justify-center min-h-dvh text-content-1 font-mono p-6 relative overflow-hidden select-none">
      <div className="absolute w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none motion-safe:animate-pulse" />
      <motion.div
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.5, ease: 'easeOut' }}
        className="identity-glass-panel flex flex-col items-center space-y-6 relative z-10 text-center w-full max-w-sm rounded-3xl border border-line p-8"
      >
        <BrandMark className="w-36 h-36 sm:w-40 sm:h-40 object-contain" />
        <div>
          <h1 className="text-sm font-bold tracking-[0.25em] text-white uppercase font-mono">MINARTH</h1>
          <p className="text-[10px] text-[#777] font-mono mt-1 uppercase tracking-widest">Clarity for your money</p>
        </div>
        <div aria-hidden="true" className="w-full bg-[#1c1c1c] h-1.5 rounded-full overflow-hidden border border-[#333]">
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: reduceMotion ? 0 : 0.9, ease: 'easeInOut' }}
            className="h-full bg-gradient-to-r from-violet-600 via-violet-400 to-indigo-300 rounded-full"
          />
        </div>
        <p role="status" className="text-[9px] text-[#555] font-mono uppercase tracking-widest">Preparing your private workspace</p>
        {error && (
          <div className="space-y-4">
            <p role="alert" className="text-xs text-content-1">{error}</p>
            <div className="flex flex-wrap justify-center gap-4">
              {onRetry && <button type="button" onClick={onRetry} className="rounded-xl bg-violet-600 px-4 py-2 text-sm text-white">Retry</button>}
              {onSignOut && <button type="button" onClick={onSignOut} className="text-sm underline">Sign out</button>}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
