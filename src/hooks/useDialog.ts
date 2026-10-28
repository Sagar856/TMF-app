import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseDialogOptions {
  /** Whether the dialog is currently open. */
  isOpen: boolean;
  /** Called when the user presses Escape. */
  onClose: () => void;
  /** Focus the first focusable element on open (default true). */
  autoFocus?: boolean;
  /** Lock body scroll while open (default true). */
  lockScroll?: boolean;
}

/**
 * Shared dialog behaviour: Escape-to-close, Tab focus trap, initial focus,
 * focus restoration to the opener and body scroll lock.
 * Attach the returned ref to the dialog's root element.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  autoFocus = true,
  lockScroll = true,
}: UseDialogOptions) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const root: HTMLElement | null = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (autoFocus && root) {
      const first = root.querySelector<HTMLElement>('[data-autofocus]') || root.querySelector<HTMLElement>(FOCUSABLE);
      (first || root).focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !root) return;
      const focusable: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el: HTMLElement) => el.offsetParent !== null || el === document.activeElement
      );
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first: HTMLElement = focusable[0];
      const last: HTMLElement = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    let previousOverflow: string | null = null;
    if (lockScroll) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (lockScroll && previousOverflow !== null) document.body.style.overflow = previousOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen, autoFocus, lockScroll]);

  return ref;
}
