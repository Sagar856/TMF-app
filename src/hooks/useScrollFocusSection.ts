import React, { useState, useEffect, useRef, useCallback } from 'react';

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

  const contentHeightRef = useRef<number>(0);
  const [contentHeight, setContentHeight] = useState<number>(0);

  const manualOverrideRef = useRef<boolean | null>(null);
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);

  const lastScrollYRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const animatingRef = useRef<boolean>(false);
  const interpolationLoopRef = useRef<number | null>(null);

  const measureHeight = useCallback(() => {
    if (!isMountedRef.current || !contentRef.current) return;
    const el = contentRef.current;
    const measured = Math.max(el.scrollHeight, el.offsetHeight, Math.round(el.getBoundingClientRect().height));
    const prev = contentHeightRef.current || 0;
    if (measured > 0 && Math.abs(measured - prev) > 4) {
      contentHeightRef.current = measured;
      setContentHeight(measured);
    }
  }, []);

  // Continuous frame LERP tick function
  const tickInterpolation = useCallback(() => {
    if (!isMountedRef.current) return;

    const current = progressRef.current;
    const target = targetProgressRef.current;
    const diff = target - current;

    if (Math.abs(diff) > 0.002) {
      const nextValue = current + diff * 0.16;
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

    measureHeight();

    const resizeObserver = new ResizeObserver(() => {
      measureHeight();
    });

    resizeObserver.observe(contentEl);

    return () => {
      isMountedRef.current = false;
      resizeObserver.disconnect();
      if (interpolationLoopRef.current !== null) {
        cancelAnimationFrame(interpolationLoopRef.current);
      }
    };
  }, [measureHeight]);

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

    lastScrollYRef.current = currentScrollY;

    // Check manual override
    if (manualOverrideRef.current !== null) {
      const rect = container.getBoundingClientRect();
      if (rect.bottom < -350 || rect.top > viewportHeight + 350) {
        setManualOverride(null);
        manualOverrideRef.current = null;
      } else {
        const target = manualOverrideRef.current ? 1 : 0;
        if (Math.abs(target - targetProgressRef.current) > 0.001) {
          targetProgressRef.current = target;
          triggerInterpolation();
        }
        return;
      }
    }

    const rect = container.getBoundingClientRect();
    const containerTop = rect.top - parentTop;
    const containerBottom = rect.bottom - parentTop;

    const entryStart = viewportHeight * 0.88;
    const entryFull = viewportHeight * 0.50;
    const entryDistance = entryStart - entryFull;

    const exitStart = viewportHeight * (1 - bottomHoldRatio);
    const exitComplete = viewportHeight * 0.15;
    const exitDistance = Math.max(80, exitStart - exitComplete);

    let entryProg = 1;
    if (containerTop > entryStart) {
      entryProg = 0;
    } else if (containerTop > entryFull) {
      entryProg = (entryStart - containerTop) / entryDistance;
    } else {
      entryProg = 1;
    }

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

    if (Math.abs(cleanProgress - targetProgressRef.current) > 0.001) {
      targetProgressRef.current = cleanProgress;
      triggerInterpolation();
    }
  }, [bottomHoldRatio, enabled, triggerInterpolation]);

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

    return () => {
      scrollParent.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [enabled, updateScrollProgress]);

  // Toggle manual expand/collapse override
  const toggleManualExpand = useCallback(() => {
    if (!allowManualOverride) return;

    const currentProgress = targetProgressRef.current;
    const isCurrentlyExpanded = currentProgress >= 0.5 || manualOverrideRef.current === true;
    const nextState = !isCurrentlyExpanded;

    setManualOverride(nextState);
    manualOverrideRef.current = nextState;
    const nextProg = nextState ? 1 : 0;
    targetProgressRef.current = nextProg;

    if (nextState) {
      measureHeight();
    }

    triggerInterpolation();
  }, [allowManualOverride, measureHeight, triggerInterpolation]);

  const isExpanded = progress > 0.02;
  const isFullyExpanded = progress >= 0.98;
  const effectiveHeight = contentHeight > 0 ? contentHeight : 500;
  const calculatedHeight = Math.max(0, Math.round(progress * effectiveHeight));

  const bodyStyle: React.CSSProperties = {
    height: isFullyExpanded ? 'auto' : `${calculatedHeight}px`,
    maxHeight: isFullyExpanded ? 'none' : `${calculatedHeight}px`,
    opacity: Math.max(0, Math.min(1, Math.pow(progress, 1.15))),
    transform: isFullyExpanded ? 'none' : `translateY(${(1 - progress) * -6}px)`,
    overflow: isFullyExpanded ? 'visible' : 'hidden',
    transition: 'none',
    pointerEvents: progress > 0.25 ? 'auto' : 'none',
    visibility: progress <= 0.002 ? 'hidden' : 'visible',
  };

  const chevronRotation = Math.round(progress * 180);
  const buttonLabel: 'EXPAND' | 'COLLAPSE' = progress >= 0.5 ? 'COLLAPSE' : 'EXPAND';
  const isFocused = progress > 0.45;

  return {
    containerRef,
    contentRef,
    progress,
    isExpanded,
    contentHeight: effectiveHeight,
    manualOverride,
    toggleManualExpand,
    bodyStyle,
    chevronRotation,
    buttonLabel,
    isFocused,
  };
}
