'use client';

import { useEffect, useRef, useState } from 'react';
import HomeLineIcon from './HomeLineIcon';

type Theme = 'light' | 'dark';

export default function HomeThemeToggle() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('midad-home-theme');
    } catch {
      /* storage may be unavailable */
    }
    const selected: Theme =
      saved === 'light' || saved === 'dark'
        ? saved
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    setTheme(selected);
    const home = buttonRef.current?.closest<HTMLElement>('.public-home, .auth-page');
    if (home) home.dataset.homeTheme = selected;
  }, []);

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    const home = buttonRef.current?.closest<HTMLElement>('.public-home, .auth-page');
    if (home) home.dataset.homeTheme = next;
    try {
      localStorage.setItem('midad-home-theme', next);
    } catch {
      /* the choice still works this visit */
    }
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className="home-theme-toggle"
      onClick={toggle}
      aria-pressed={theme === 'dark'}
      aria-label={theme === 'light' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'}
      title={theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح'}
    >
      <HomeLineIcon name={theme === 'light' ? 'moon' : 'sun'} size={19} />
    </button>
  );
}
