import { useEffect, useState } from 'react';
import { resolveTheme, type ThemePreference } from '../utils/theme';

export function useResolvedTheme(preference: ThemePreference | undefined): 'dark' | 'light' {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener('change', update);
    const resume = () => { if (document.visibilityState === 'visible') update(); };
    document.addEventListener('visibilitychange', resume);
    return () => {
      query.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  return resolveTheme(preference, systemDark);
}
