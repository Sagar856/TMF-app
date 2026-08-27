import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface CarouselSectionState {
  progress: number;
  contentHeight: number;
  isExpanded: boolean;
  isFocused: boolean;
  chevronRotation: number;
  buttonLabel: 'EXPAND' | 'COLLAPSE';
  bodyStyle: React.CSSProperties;
}

export interface UseScrollCarouselGroupOptions {
  /**
   * Whether auto scroll-driven expansion/collapse is enabled.
   * If false (MANUAL TOGGLE mode), all sections start collapsed by default
   * and scrolling does not alter section states.
   */
  enabled?: boolean;
  /**
   * Viewport ratio from top (0 to 1) where a section is considered focused.
   */
  centerFocusRatio?: number;
  /**
   * Minimum ratio above bottom of viewport before a section begins collapsing.
   */
  bottomHoldRatio?: number;
}

export function useScrollCarouselGroup<T extends string>(
  sectionKeys: readonly T[],
  options: UseScrollCarouselGroupOptions = {}
) {
  const { enabled = true } = options;

  // Stable section keys key-string to prevent dependency thrashing
  const keysSignature = sectionKeys.join(',');

  // Element Refs for containers and inner contents
  const containerRefs = useRef<Record<T, HTMLDivElement | null>>({} as Record<T, HTMLDivElement | null>);
  const contentRefs = useRef<Record<T, HTMLDivElement | null>>({} as Record<T, HTMLDivElement | null>);

  // Currently active focused index
  const activeIndexRef = useRef<number>(0);

  // Target progresses for each section (describes the desired state: 0.0 or 1.0)
  const targetProgressesRef = useRef<Record<T, number>>({} as Record<T, number>);

  // Actual animated/interpolated progresses shown to the user
  const [progresses, setProgresses] = useState<Record<T, number>>(() => {
    const initial: Record<string, number> = {};
    sectionKeys.forEach((key, index) => {
      const initialVal = enabled && index === 0 ? 1.0 : 0.0;
      initial[key] = initialVal;
      targetProgressesRef.current[key as T] = initialVal;
    });
    return initial as Record<T, number>;
  });

  const progressesRef = useRef<Record<T, number>>(progresses);
  useEffect(() => {
    progressesRef.current = progresses;
  }, [progresses]);

  // Measured natural content heights - ref-driven to prevent render loops
  const contentHeightsRef = useRef<Record<T, number>>({} as Record<T, number>);
  const [contentHeights, setContentHeights] = useState<Record<T, number>>(() => {
    const initial: Record<string, number> = {};
    sectionKeys.forEach((key) => {
      initial[key] = 0;
      contentHeightsRef.current[key as T] = 0;
    });
    return initial as Record<T, number>;
  });

  // Manual override states: null = auto; true = manually expanded; false = manually collapsed
  const manualOverridesRef = useRef<Record<T, boolean | null>>({} as Record<T, boolean | null>);
  const [manualOverrides, setManualOverrides] = useState<Record<T, boolean | null>>(() => {
    const initial: Record<string, boolean | null> = {};
    sectionKeys.forEach((key) => {
      initial[key] = null;
      manualOverridesRef.current[key as T] = null;
    });
    return initial as Record<T, boolean | null>;
  });

  const lastScrollYRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const animatingRef = useRef<boolean>(false);
  const interpolationLoopRef = useRef<number | null>(null);

  // Measure content heights without triggering unnecessary state updates
  const measureHeights = useCallback(() => {
    if (!isMountedRef.current) return;
    const updatedHeights: Partial<Record<T, number>> = {};
    let hasChanges = false;

    sectionKeys.forEach((key) => {
      const el = contentRefs.current[key];
      if (el) {
        const measured = Math.max(el.scrollHeight, el.offsetHeight, Math.round(el.getBoundingClientRect().height));
        const prev = contentHeightsRef.current[key] || 0;
        // Only update if difference is meaningful (> 4px) to avoid sub-pixel layout oscillation
        if (measured > 0 && Math.abs(measured - prev) > 4) {
          updatedHeights[key] = measured;
          contentHeightsRef.current[key] = measured;
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      setContentHeights((prev) => ({ ...prev, ...updatedHeights }));
    }
  }, [sectionKeys]);

  // Helper to register container element
  const registerContainer = useCallback((key: T) => (el: HTMLDivElement | null) => {
    containerRefs.current[key] = el;
  }, []);

  // Helper to register content element for height measurement
  // Purely assigns the ref; does not call setState synchronously during render
  const registerContent = useCallback((key: T) => (el: HTMLDivElement | null) => {
    contentRefs.current[key] = el;
    if (el) {
      const measured = Math.max(el.scrollHeight, el.offsetHeight);
      if (measured > 0 && Math.abs(measured - (contentHeightsRef.current[key] || 0)) > 4) {
        contentHeightsRef.current[key] = measured;
      }
    }
  }, []);

  // Continuous frame LERP tick function
  const tickInterpolation = useCallback(() => {
    if (!isMountedRef.current) return;

    let needsAnotherTick = false;
    const currentProgresses = { ...progressesRef.current };
    const targets = targetProgressesRef.current;

    sectionKeys.forEach((key) => {
      const current = currentProgresses[key] ?? 0;
      const target = targets[key] ?? 0;
      const diff = target - current;

      if (Math.abs(diff) > 0.002) {
        // Smooth LERP factor (0.16 gives a responsive 180ms ease)
        const nextValue = current + diff * 0.16;
        currentProgresses[key] = Math.max(0, Math.min(1, nextValue));
        needsAnotherTick = true;
      } else if (current !== target) {
        currentProgresses[key] = target;
      }
    });

    progressesRef.current = currentProgresses;
    setProgresses(currentProgresses);

    if (needsAnotherTick) {
      interpolationLoopRef.current = requestAnimationFrame(tickInterpolation);
    } else {
      animatingRef.current = false;
    }
  }, [sectionKeys]);

  // Trigger interpolation on demand
  const triggerInterpolation = useCallback(() => {
    if (!animatingRef.current) {
      animatingRef.current = true;
      if (interpolationLoopRef.current !== null) {
        cancelAnimationFrame(interpolationLoopRef.current);
      }
      interpolationLoopRef.current = requestAnimationFrame(tickInterpolation);
    }
  }, [tickInterpolation]);

  // Observe and measure content heights with ResizeObserver
  useEffect(() => {
    isMountedRef.current = true;
    const resizeObserver = new ResizeObserver(() => {
      measureHeights();
    });

    sectionKeys.forEach((key) => {
      const el = contentRefs.current[key];
      if (el) {
        resizeObserver.observe(el);
      }
    });

    // Initial measurement after DOM mount
    measureHeights();

    return () => {
      isMountedRef.current = false;
      resizeObserver.disconnect();
      if (interpolationLoopRef.current !== null) {
        cancelAnimationFrame(interpolationLoopRef.current);
      }
    };
  }, [keysSignature, measureHeights, sectionKeys]);

  // Main scroll handling loop
  const updateScrollProgress = useCallback(() => {
    if (!enabled) return;

    const scrollParent = document.querySelector('main') || (document.scrollingElement as HTMLElement) || window;

    let viewportHeight = window.innerHeight;
    let currentScrollY = 0;

    if (scrollParent instanceof HTMLElement) {
      viewportHeight = scrollParent.clientHeight || window.innerHeight;
      currentScrollY = scrollParent.scrollTop;
    } else {
      currentScrollY = window.scrollY || window.pageYOffset;
    }

    lastScrollYRef.current = currentScrollY;

    // The primary focal band on the viewport where a section is considered actively viewed
    const focalLine = viewportHeight * 0.38;

    // Check if fully scrolled back to top of dashboard (< 40px)
    if (currentScrollY < 40) {
      let targetChanged = false;
      sectionKeys.forEach((key, idx) => {
        const manual = manualOverridesRef.current[key];
        const desired = manual !== null ? (manual ? 1.0 : 0.0) : idx === 0 ? 1.0 : 0.0;
        if (targetProgressesRef.current[key] !== desired) {
          targetProgressesRef.current[key] = desired;
          targetChanged = true;
        }
      });
      activeIndexRef.current = 0;
      if (targetChanged) {
        triggerInterpolation();
      }
      return;
    }

    // Determine the section that contains or is closest to the focal line
    let activeIdx = -1;
    let minDistanceToHeader = Infinity;

    for (let i = 0; i < sectionKeys.length; i++) {
      const key = sectionKeys[i];
      const container = containerRefs.current[key];
      if (!container) continue;

      const rect = container.getBoundingClientRect();

      // Check if this container is spanning the active focus line
      if (rect.top <= focalLine && rect.bottom >= focalLine) {
        activeIdx = i;
        break;
      }

      // Track the closest section header to the focal line
      const dist = Math.abs(rect.top - focalLine);
      if (dist < minDistanceToHeader) {
        minDistanceToHeader = dist;
        activeIdx = i;
      }
    }

    if (activeIdx === -1) {
      activeIdx = 0;
    }

    activeIndexRef.current = activeIdx;

    let targetChanged = false;
    sectionKeys.forEach((key, idx) => {
      const container = containerRefs.current[key];
      const manual = manualOverridesRef.current[key];

      // If user manually toggled, check if container has scrolled completely offscreen
      if (manual !== null && container) {
        const rect = container.getBoundingClientRect();
        if (rect.bottom < -350 || rect.top > viewportHeight + 350) {
          setManualOverrides((prev) => ({ ...prev, [key]: null }));
          manualOverridesRef.current[key] = null;
        }
      }

      const activeManual = manualOverridesRef.current[key];
      let desiredTarget = 0.0;

      if (activeManual !== null) {
        desiredTarget = activeManual ? 1.0 : 0.0;
      } else {
        desiredTarget = idx === activeIdx ? 1.0 : 0.0;
      }

      if (Math.abs(targetProgressesRef.current[key] - desiredTarget) > 0.001) {
        targetProgressesRef.current[key] = desiredTarget;
        targetChanged = true;
      }
    });

    if (targetChanged) {
      triggerInterpolation();
    }
  }, [enabled, sectionKeys, triggerInterpolation]);

  // Scroll and Resize Event Listener
  useEffect(() => {
    if (!enabled) return;

    const scrollParent = document.querySelector('main') || window;

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

  // Handle Mode Changes (Auto Mode vs MANUAL TOGGLE)
  useEffect(() => {
    if (!enabled) {
      // MANUAL TOGGLE Mode: All sections start COLLAPSED by default (0.0)
      const collapsedAll: Record<string, number> = {};
      const clearedOverrides: Record<string, boolean | null> = {};
      sectionKeys.forEach((k) => {
        collapsedAll[k] = 0.0;
        targetProgressesRef.current[k] = 0.0;
        clearedOverrides[k] = null;
        manualOverridesRef.current[k] = null;
      });
      activeIndexRef.current = 0;
      progressesRef.current = collapsedAll as Record<T, number>;
      setProgresses(collapsedAll as Record<T, number>);
      setManualOverrides(clearedOverrides as Record<T, boolean | null>);
    } else {
      // Auto Mode: Section 0 expanded (1.0), others collapsed (0.0)
      const autoInitial: Record<string, number> = {};
      const clearedOverrides: Record<string, boolean | null> = {};
      sectionKeys.forEach((k, idx) => {
        const val = idx === 0 ? 1.0 : 0.0;
        autoInitial[k] = val;
        targetProgressesRef.current[k] = val;
        clearedOverrides[k] = null;
        manualOverridesRef.current[k] = null;
      });
      activeIndexRef.current = 0;
      progressesRef.current = autoInitial as Record<T, number>;
      setProgresses(autoInitial as Record<T, number>);
      setManualOverrides(clearedOverrides as Record<T, boolean | null>);
    }
  }, [enabled, keysSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual toggle handler for a specific section
  const toggleSection = useCallback((key: T) => {
    const currentProgress = targetProgressesRef.current[key] ?? 0;
    const isCurrentlyExpanded = currentProgress >= 0.5 || manualOverridesRef.current[key] === true;
    const nextState = !isCurrentlyExpanded;

    const idx = sectionKeys.indexOf(key);
    if (idx !== -1) {
      activeIndexRef.current = idx;
    }

    setManualOverrides((prev) => ({
      ...prev,
      [key]: nextState,
    }));
    manualOverridesRef.current[key] = nextState;

    targetProgressesRef.current[key] = nextState ? 1.0 : 0.0;

    // If expanding, re-measure content heights
    if (nextState) {
      measureHeights();
    }

    triggerInterpolation();
  }, [measureHeights, sectionKeys, triggerInterpolation]);

  // Generate helper state and styles for each section
  const getSectionState = useCallback((key: T): CarouselSectionState => {
    const p = progresses[key] ?? 0;
    const measuredHeight = contentHeights[key] || contentHeightsRef.current[key] || 0;
    // Provide a reliable fallback if height hasn't finished initial measure yet
    const fallbackHeight = key === 'recurring' ? 780 : key === 'trend' ? 420 : 520;
    const effectiveHeight = measuredHeight > 0 ? measuredHeight : fallbackHeight;

    const isFullyExpanded = p >= 0.98;
    const calculatedHeight = Math.max(0, Math.round(p * effectiveHeight));

    const bodyStyle: React.CSSProperties = {
      height: isFullyExpanded ? 'auto' : `${calculatedHeight}px`,
      maxHeight: isFullyExpanded ? 'none' : `${calculatedHeight}px`,
      opacity: Math.max(0, Math.min(1, Math.pow(p, 1.15))),
      transform: isFullyExpanded ? 'none' : `translateY(${(1 - p) * -6}px)`,
      overflow: isFullyExpanded ? 'visible' : 'hidden',
      transition: 'none',
      pointerEvents: p > 0.25 ? 'auto' : 'none',
      visibility: p <= 0.002 ? 'hidden' : 'visible',
    };

    return {
      progress: p,
      contentHeight: effectiveHeight,
      isExpanded: p > 0.02,
      isFocused: p > 0.45,
      chevronRotation: Math.round(p * 180),
      buttonLabel: p >= 0.5 ? 'COLLAPSE' : 'EXPAND',
      bodyStyle,
    };
  }, [contentHeights, progresses]);

  return {
    registerContainer,
    registerContent,
    toggleSection,
    getSectionState,
    progresses,
    manualOverrides,
  };
}
