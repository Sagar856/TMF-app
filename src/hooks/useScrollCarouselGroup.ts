import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Cooldown duration (in milliseconds) after a user manually collapses a section.
 * During this period, auto-expansion for that specific section is suppressed on scroll.
 */
export const MANUAL_COLLAPSE_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

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
   * Default 0.30 (i.e. 30% height above bottom of screen, Y = 0.70 * H).
   */
  bottomHoldRatio?: number;
  /**
   * Configurable manual collapse suppression cooldown (defaults to 5 minutes).
   */
  manualCollapseCooldownMs?: number;
}

export function useScrollCarouselGroup<T extends string>(
  sectionKeys: readonly T[],
  options: UseScrollCarouselGroupOptions = {}
) {
  const {
    enabled = true,
    manualCollapseCooldownMs = MANUAL_COLLAPSE_COOLDOWN_MS,
  } = options;

  // Element Refs for containers and inner contents
  const containerRefs = useRef<Record<T, HTMLDivElement | null>>({} as Record<T, HTMLDivElement | null>);
  const contentRefs = useRef<Record<T, HTMLDivElement | null>>({} as Record<T, HTMLDivElement | null>);

  // Currently active focused index (default 0 in Auto Mode)
  const activeIndexRef = useRef<number>(0);

  // Target progresses for each section (describes the desired state: 0.0 or 1.0)
  const targetProgressesRef = useRef<Record<T, number>>({} as Record<T, number>);

  // Actual animated/interpolated progresses shown to the user
  const [progresses, setProgresses] = useState<Record<T, number>>(() => {
    const initial: Record<string, number> = {};
    sectionKeys.forEach((key, index) => {
      initial[key] = enabled && index === 0 ? 1.0 : 0.0;
      targetProgressesRef.current[key as T] = enabled && index === 0 ? 1.0 : 0.0;
    });
    return initial as Record<T, number>;
  });

  // Ref to hold current progresses for access within callbacks
  const progressesRef = useRef<Record<T, number>>(progresses);
  useEffect(() => {
    progressesRef.current = progresses;
  }, [progresses]);

  // Measured natural content heights
  const [contentHeights, setContentHeights] = useState<Record<T, number>>(() => {
    const initial: Record<string, number> = {};
    sectionKeys.forEach((key) => {
      initial[key] = 0;
    });
    return initial as Record<T, number>;
  });

  // Manual override states: null = auto; true = manually expanded; false = manually collapsed
  const [manualOverrides, setManualOverrides] = useState<Record<T, boolean | null>>(() => {
    const initial: Record<string, boolean | null> = {};
    sectionKeys.forEach((key) => {
      initial[key] = null;
    });
    return initial as Record<T, boolean | null>;
  });

  // Timestamps for manual collapse cooldowns (suppresses auto-expand for that section for 2 mins)
  const manualCollapseCooldownsRef = useRef<Record<T, number>>({} as Record<T, number>);

  // Scroll direction and transition lock refs
  const lastScrollYRef = useRef<number>(0);
  const scrollDirectionRef = useRef<'down' | 'up' | 'idle'>('idle');
  const isTransitioningRef = useRef<boolean>(false);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isMountedRef = useRef<boolean>(true);

  // requestAnimationFrame interpolation engine
  const animatingRef = useRef<boolean>(false);
  const interpolationLoopRef = useRef<number | null>(null);

  // Helper to register container element
  const registerContainer = useCallback((key: T) => (el: HTMLDivElement | null) => {
    containerRefs.current[key] = el;
  }, []);

  // Helper to register content element for height measurement
  const registerContent = useCallback((key: T) => (el: HTMLDivElement | null) => {
    contentRefs.current[key] = el;
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

      if (Math.abs(diff) > 0.001) {
        // Interpolate progress smoothly using LERP factor (0.12 gives an ultra-smooth 150-200ms feel)
        const nextValue = current + diff * 0.12;
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

  // Observe and measure content heights
  useEffect(() => {
    isMountedRef.current = true;
    const resizeObserver = new ResizeObserver(() => {
      if (!isMountedRef.current) return;
      const updatedHeights: Partial<Record<T, number>> = {};
      let hasChanges = false;

      sectionKeys.forEach((key) => {
        const el = contentRefs.current[key];
        if (el) {
          const height = el.scrollHeight || el.getBoundingClientRect().height;
          if (height > 0) {
            updatedHeights[key] = height;
            hasChanges = true;
          }
        }
      });

      if (hasChanges) {
        setContentHeights((prev) => ({ ...prev, ...updatedHeights }));
      }
    });

    sectionKeys.forEach((key) => {
      const el = contentRefs.current[key];
      if (el) {
        resizeObserver.observe(el);
      }
    });

    return () => {
      isMountedRef.current = false;
      resizeObserver.disconnect();
      if (interpolationLoopRef.current !== null) {
        cancelAnimationFrame(interpolationLoopRef.current);
      }
    };
  }, [sectionKeys]);

  // Smoothly center a section in the visible viewport
  const smoothCenterSection = useCallback((key: T) => {
    const container = containerRefs.current[key];
    if (!container) return;

    const scrollParent = container.closest('main') || (document.scrollingElement as HTMLElement) || window;
    let viewportHeight = window.innerHeight;
    let parentTop = 0;
    let currentScrollTop = 0;

    if (scrollParent instanceof HTMLElement) {
      const parentRect = scrollParent.getBoundingClientRect();
      viewportHeight = scrollParent.clientHeight || window.innerHeight;
      parentTop = parentRect.top;
      currentScrollTop = scrollParent.scrollTop;
    } else {
      currentScrollTop = window.scrollY || window.pageYOffset;
    }

    const rect = container.getBoundingClientRect();
    const containerTop = rect.top - parentTop;
    // Target position: place header card vertically centered around 32-38% from top of viewport
    const targetOffset = containerTop - (viewportHeight * 0.35);

    if (Math.abs(targetOffset) > 15) {
      if (scrollParent instanceof HTMLElement) {
        scrollParent.scrollTo({
          top: currentScrollTop + targetOffset,
          behavior: 'smooth',
        });
      } else {
        window.scrollTo({
          top: currentScrollTop + targetOffset,
          behavior: 'smooth',
        });
      }
    }
  }, []);

  // Main scroll handling loop
  const updateScrollProgress = useCallback(() => {
    // In MANUAL TOGGLE mode (enabled = false), scrolling NEVER auto expands/collapses!
    if (!enabled) return;

    const scrollParent = document.querySelector('main') || (document.scrollingElement as HTMLElement) || window;

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

    // Determine scroll direction
    const scrollDelta = currentScrollY - lastScrollYRef.current;
    if (scrollDelta > 3) {
      scrollDirectionRef.current = 'down';
    } else if (scrollDelta < -3) {
      scrollDirectionRef.current = 'up';
    }
    lastScrollYRef.current = currentScrollY;

    // Check if fully scrolled back to the top of the dashboard
    if (currentScrollY < 15) {
      if (activeIndexRef.current !== 0 || targetProgressesRef.current[sectionKeys[0]] !== 1.0) {
        activeIndexRef.current = 0;
        sectionKeys.forEach((key, idx) => {
          targetProgressesRef.current[key] = idx === 0 ? 1.0 : 0.0;
        });
        triggerInterpolation();
      }
      return;
    }

    const isScrollingUp = scrollDirectionRef.current === 'up';

    if (isScrollingUp) {
      // Find the closest section to the focal center (35% of viewport height)
      let closestIdx = activeIndexRef.current;
      let minDistance = Infinity;
      sectionKeys.forEach((key, idx) => {
        const container = containerRefs.current[key];
        if (container) {
          const rect = container.getBoundingClientRect();
          const containerCenterY = rect.top - parentTop + (rect.height / 2);
          const distance = Math.abs(containerCenterY - (viewportHeight * 0.35));
          if (distance < minDistance) {
            minDistance = distance;
            closestIdx = idx;
          }
        }
      });

      // If closest section is different from active index, update it
      if (closestIdx !== activeIndexRef.current) {
        const prevActiveKey = sectionKeys[activeIndexRef.current];
        activeIndexRef.current = closestIdx;

        // Smoothly collapse the section we are leaving (only if it has a higher index than the new active index)
        if (closestIdx < sectionKeys.indexOf(prevActiveKey)) {
          targetProgressesRef.current[prevActiveKey] = 0.0;
          triggerInterpolation();
        }
      }
      return;
    }

    // Don't interrupt an active transition animation sequence
    if (isTransitioningRef.current) return;

    const curIdx = activeIndexRef.current;
    const curKey = sectionKeys[curIdx];
    const curContainer = containerRefs.current[curKey];

    if (!curContainer) return;

    const rect = curContainer.getBoundingClientRect();
    const containerBottom = rect.bottom - parentTop;

    // 30% bottom-offset requirement to prevent premature collapse:
    // If bottom edge of container is below 70% from top of viewport (leaving 30% at bottom), keep it expanded.
    // If bottom edge is above 70% of the viewport height, trigger the smooth sequential transition.
    const exitStart = viewportHeight * 0.70;

    if (containerBottom < exitStart && curIdx + 1 < sectionKeys.length) {
      const nextIdx = curIdx + 1;
      const nextKey = sectionKeys[nextIdx];
      const now = Date.now();

      // Check if the next section is under manual collapse cooldown
      const cooldownUntil = manualCollapseCooldownsRef.current[nextKey] || 0;
      const isNextUnderCooldown = now < cooldownUntil;

      isTransitioningRef.current = true;
      activeIndexRef.current = nextIdx;

      // 1. Collapse current section smoothly by updating target to 0.0
      targetProgressesRef.current[curKey] = 0.0;
      triggerInterpolation();

      // 2. Schedule centering and expanding next section sequentially
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;

        // Center next section in visible viewport
        smoothCenterSection(nextKey);

        // 3. Expand next section smoothly if not under cooldown
        if (!isNextUnderCooldown) {
          targetProgressesRef.current[nextKey] = 1.0;
          triggerInterpolation();
        }

        // Release transition lock after centering/expansion completes
        setTimeout(() => {
          isTransitioningRef.current = false;
        }, 300);
      }, 200);
    }
  }, [enabled, sectionKeys, smoothCenterSection, triggerInterpolation]);

  // Scroll and Resize Event Listener
  useEffect(() => {
    if (!enabled) return;

    const scrollParent = document.querySelector('main') || window;

    const handleScrollOrResize = () => {
      updateScrollProgress();
    };

    scrollParent.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    // Run initial progress check on mount to ensure starting section is correctly set
    handleScrollOrResize();

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
      });
      activeIndexRef.current = 0;
      progressesRef.current = collapsedAll as Record<T, number>;
      setProgresses(collapsedAll as Record<T, number>);
      setManualOverrides(clearedOverrides as Record<T, boolean | null>);
    } else {
      // Auto Mode: Section 0 expanded (1.0), others collapsed (0.0)
      const autoInitial: Record<string, number> = {};
      sectionKeys.forEach((k, idx) => {
        autoInitial[k] = idx === 0 ? 1.0 : 0.0;
        targetProgressesRef.current[k] = idx === 0 ? 1.0 : 0.0;
      });
      activeIndexRef.current = 0;
      progressesRef.current = autoInitial as Record<T, number>;
      setProgresses(autoInitial as Record<T, number>);
    }
  }, [enabled, sectionKeys]);

  // Manual toggle handler for a specific section
  const toggleSection = useCallback((key: T) => {
    const currentProgress = targetProgressesRef.current[key] ?? 0;
    const isCurrentlyExpanded = currentProgress >= 0.5 || manualOverrides[key] === true;
    const nextState = !isCurrentlyExpanded;

    if (!nextState) {
      // Manually collapsing: trigger manual collapse suppression cooldown (2 minutes)
      manualCollapseCooldownsRef.current[key] = Date.now() + manualCollapseCooldownMs;
    } else {
      // Manually expanding: clear suppression cooldown
      manualCollapseCooldownsRef.current[key] = 0;
    }

    // Find index of key
    const idx = sectionKeys.indexOf(key);
    if (idx !== -1) {
      activeIndexRef.current = idx;
    }

    setManualOverrides((prev) => ({
      ...prev,
      [key]: nextState,
    }));

    targetProgressesRef.current[key] = nextState ? 1.0 : 0.0;
    triggerInterpolation();
  }, [manualCollapseCooldownMs, manualOverrides, sectionKeys, triggerInterpolation]);

  // Generate helper state and styles for each section
  const getSectionState = useCallback((key: T): CarouselSectionState => {
    const p = progresses[key] ?? 0;
    const height = contentHeights[key] ?? 0;
    const isFullyExpanded = p >= 0.98;
    const calculatedHeight = Math.round(p * height);

    const bodyStyle: React.CSSProperties = {
      height: isFullyExpanded ? 'auto' : `${calculatedHeight}px`,
      maxHeight: isFullyExpanded ? 'none' : `${calculatedHeight}px`,
      opacity: Math.max(0, Math.min(1, Math.pow(p, 1.25))),
      transform: `translateY(${(1 - p) * -6}px)`,
      overflow: isFullyExpanded ? 'visible' : 'hidden',
      transition: 'none', // Frame-by-frame interpolation via requestAnimationFrame
      pointerEvents: p > 0.3 ? 'auto' : 'none',
      visibility: p <= 0.005 ? 'hidden' : 'visible',
    };

    return {
      progress: p,
      contentHeight: height,
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
