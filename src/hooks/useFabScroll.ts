import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export function useFabScroll(scrollContainerRef?: RefObject<HTMLElement | null>): boolean {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const target = scrollContainerRef?.current || document.querySelector('main');
    if (!target) return;

    const handleScroll = () => setIsScrolled(target.scrollTop > 40);
    handleScroll();
    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef]);

  return isScrolled;
}
