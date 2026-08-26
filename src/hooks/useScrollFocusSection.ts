import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Cooldown duration (in milliseconds) after a user manually collapses a section.
 */
export const MANUAL_COLLAPSE_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

export interface UseScrollFocusSectionOptions {
  /**
   * Whether auto scroll-driven expansion/collapse is enabled.
   */
  enabled?: boolean;
  /**
   * Optional center focus ratio
   */
  centerFocusRatio?: number;
  /**
   * Optional focus radius
   */
  focusRadius?: number;
  /**
   * Minimum ratio above bottom of viewport before section begins collapsing.
   * Default 0.30 (i.e. 30% height above bottom of screen, Y = 0.70 * H).
   */
  bottomHoldRatio?: number;
  /**
   * Initial progress (default 0).
   */
  initialProgress?: number;
  /**
   * Whether to enable manual override tracking.
   */
  allowManualOverride?: boolean;
  /**
   * Configurable manual collapse suppression cooldown.
   */
  manualCollapseCooldownMs?: number;
}

export interface UseScrollFocusSectionReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  progress: number;
  isExpanded: boolean;
  contentHeight: number;
  manualOverride: boolean | null;
  toggleManualExpand: () => void;
  bodyStyle: React.CSSProperties;
  chevronRotation: number;
  buttonLabel: 'EXPAND' | 'COLLAPSE';
  isFocused: boolean;
}

export function useScrollFocusSection({
  enabled = true,
  bottomHoldRatio = 0.30,
  initialProgress = 0,
  allowManualOverride = true,
  manualCollapseCooldownMs = MANUAL_COLLAPSE_COOLDOWN_MS,
}: UseScrollFocusSectionOptions = {}): UseScrollFocusSectionReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Target progress (desired value: 0.0 or 1.0 or intermediate calculation)
  const targetProgressRef = useRef<number>(enabled ? initialProgress : 0.0);

  // Actual interpolated progress rendered on the screen
  const [progress, setProgress] = useState<number>(enabled ? initialProgress : 0.0);
  const progressRef = useRef<number>(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const [contentHeight, setContentHeight] = useState<number>(0);
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);

  const manualCollapseCooldownUntilRef = useRef<number>(0);
  const lastScrollYRef = useRef<number>(0);
  const scrollDirectionRef = useRef<'down' | 'up' | 'idle'>('idle');

  const isMountedRef = useRef<boolean>(true);

  // requestAnimationFrame interpolation engine
  const animatingRef = useRef<boolean>(false);
  const interpolationLoopRef = useRef<number | null>(null);

  // Continuous frame LERP tick function
  const tickInterpolation = useCallback(() => {
    if (!isMountedRef.current) return;

    const current = progressRef.current;
    const target = targetProgressRef.current;
    const diff = target - current;

    if (Math.abs(diff) > 0.001) {
      // Interpolate smoothly using LERP factor of 0.12
      const nextValue = current + diff * 0.12;
      const cleanNext = Math.max(0, Math.min(1, nextValue));
      progressRef.current = cleanNext;
      setProgress(cleanNext);
      interpolationLoopRef.current = requestAnimationFrame(tickInterpolation);
    } else {
      if (current !== target) {
        progressRef.current = target;
        setProgress(target);
      }
      animatingRef.current = false;
    }
  }, []);

  // Trigger interpolation loop
  const triggerInterpolation = useCallback(() => {
    if (!animatingRef.current) {
      animatingRef.current = true;
      if (interpolationLoopRef.current !== null) {
        cancelAnimationFrame(interpolationLoopRef.current);
      }
      interpolationLoopRef.current = requestAnimationFrame(tickInterpolation);
    }
  }, [tickInterpolation]);

  // Measure content natural height whenever content changes
  useEffect(() => {
    isMountedRef.current = true;
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const measure = () => {
      if (!contentRef.current) return;
      const height = contentRef.current.scrollHeight || contentRef.current.getBoundingClientRect().height;
      if (height > 0) {
        setContentHeight(height);
      }
    };

    measure();

    const resizeObserver = new ResizeObserver(() => {
      measure();
    });

    resizeObserver.observe(contentEl);

    return () => {
      isMountedRef.current = false;
      resizeObserver.disconnect();
      if (interpolationLoopRef.current !== null) {
        cancelAnimationFrame(interpolationLoopRef.current);
      }
    };
  }, []);

  // Compute scroll-synchronized progress
  const updateScrollProgress = useCallback(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const scrollParent = container.closest('main') || (document.scrollingElement as HTMLElement) || window;
    
    let viewportHeight = window.innerHeight;
    let parentTop = 0;
    let currentScrollY = 0;

    if (scrollParent instanceof HTMLElement) {
      const parentRect = scrollParent.getBoundingClientRect();
      viewportHeight = scrollParent.clientHeight || window.innerHeight;
      parentTop = parentRect.top;
      currentScrollY = scrollParent.scrollTop;
    } else {
      currentScrollY = window.scrollY || window.pageYOffset;
    }

    // Direction tracking
    const scrollDelta = currentScrollY - lastScrollYRef.current;
    if (scrollDelta > 2) {
      scrollDirectionRef.current = 'down';
    } else if (scrollDelta < -2) {
      scrollDirectionRef.current = 'up';
    }
    lastScrollYRef.current = currentScrollY;

    // Check manual override
    if (manualOverride !== null) {
      const target = manualOverride ? 1 : 0;
      if (Math.abs(target - targetProgressRef.current) > 0.001) {
        targetProgressRef.current = target;
        triggerInterpolation();
      }
      return;
    }

    // Check manual collapse cooldown
    const now = Date.now();
    if (now < manualCollapseCooldownUntilRef.current) {
      if (targetProgressRef.current !== 0) {
        targetProgressRef.current = 0;
        triggerInterpolation();
      }
      return;
    }

    const currentProg = targetProgressRef.current;

    // When scrolling UP, do NOT auto-expand
    if (scrollDirectionRef.current === 'up' && currentProg < 0.1) {
      if (targetProgressRef.current !== 0) {
        targetProgressRef.current = 0;
        triggerInterpolation();
      }
      return;
    }

    const rect = container.getBoundingClientRect();
    const containerTop = rect.top - parentTop;
    const containerBottom = rect.bottom - parentTop;

    // Viewport threshold zones:
    const entryStart = viewportHeight * 0.88;
    const entryFull = viewportHeight * 0.54;
    const entryDistance = entryStart - entryFull;

    // Correct application of bottom hold threshold (30% bottom-offset requirement)
    const exitStart = viewportHeight * (1 - bottomHoldRatio); // 0.70 * H
    const exitComplete = viewportHeight * 0.15;
    const exitDistance = Math.max(80, exitStart - exitComplete);

    // 1. Entry calculation
    let entryProg = 1;
    if (containerTop > entryStart) {
      entryProg = 0;
    } else if (containerTop > entryFull) {
      entryProg = (entryStart - containerTop) / entryDistance;
    } else {
      entryProg = 1;
    }

    // 2. Exit calculation
    let exitProg = 1;
    if (containerBottom >= exitStart) {
      exitProg = 1;
    } else if (containerBottom > exitComplete) {
      exitProg = (containerBottom - exitComplete) / exitDistance;
    } else {
      exitProg = 0;
    }

    let rawProgress = Math.min(entryProg, exitProg);
    rawProgress = Math.max(0, Math.min(1, rawProgress));

    const smoothProgress = rawProgress * rawProgress * (3 - 2 * rawProgress);
    const cleanProgress = Math.round(smoothProgress * 1000) / 1000;

    if (Math.abs(cleanProgress - currentProg) > 0.001) {
      targetProgressRef.current = cleanProgress;
      triggerInterpolation();
    }
  }, [bottomHoldRatio, enabled, manualOverride, triggerInterpolation]);

  // Scroll and Resize Event Listener
  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const scrollParent = container.closest('main') || window;

    const handleScrollOrResize = () => {
      updateScrollProgress();
    };

    scrollParent.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    handleScrollOrResize();

    return () => {
      scrollParent.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [enabled, updateScrollProgress]);

  // Toggle manual expand/collapse override
  const toggleManualExpand = useCallback(() => {
    if (!allowManualOverride) return;

    const currentProgress = targetProgressRef.current;
    const isCurrentlyExpanded = currentProgress >= 0.5 || manualOverride === true;
    const nextState = !isCurrentlyExpanded;

    if (!nextState) {
      manualCollapseCooldownUntilRef.current = Date.now() + manualCollapseCooldownMs;
    } else {
      manualCollapseCooldownUntilRef.current = 0;
    }

    setManualOverride(nextState);
    const nextProg = nextState ? 1 : 0;
    targetProgressRef.current = nextProg;
    triggerInterpolation();
  }, [allowManualOverride, manualCollapseCooldownMs, manualOverride, triggerInterpolation]);

  const isExpanded = progress > 0.02;
  const isFullyExpanded = progress >= 0.98;
  const calculatedHeight = Math.round(progress * contentHeight);

  const bodyStyle: React.CSSProperties = {
    height: isFullyExpanded ? 'auto' : `${calculatedHeight}px`,
    maxHeight: isFullyExpanded ? 'none' : `${calculatedHeight}px`,
    opacity: Math.max(0, Math.min(1, Math.pow(progress, 1.25))),
    transform: `translateY(${(1 - progress) * -6}px)`,
    overflow: isFullyExpanded ? 'visible' : 'hidden',
    transition: 'none', // Frame-by-frame LERP animation via requestAnimationFrame
    pointerEvents: progress > 0.35 ? 'auto' : 'none',
    visibility: progress <= 0.005 ? 'hidden' : 'visible',
  };

  const chevronRotation = Math.round(progress * 180);
  const buttonLabel: 'EXPAND' | 'COLLAPSE' = progress >= 0.5 ? 'COLLAPSE' : 'EXPAND';
  const isFocused = progress > 0.45;

  return {
    containerRef,
    contentRef,
    progress,
    isExpanded,
    contentHeight,
    manualOverride,
    toggleManualExpand,
    bodyStyle,
    chevronRotation,
    buttonLabel,
    isFocused,
  };
}
