import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import ta from '../locales/ta.json';

const STORAGE_KEY = 'gym_locale';
export type Locale = 'en' | 'hi' | 'ta';
const LOCALES: Locale[] = ['en', 'hi', 'ta'];

const messages: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  hi: hi as Record<string, string>,
  ta: ta as Record<string, string>,
};

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang');
  if (lang === 'ta' || lang === 'hi' || lang === 'en') return lang;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'ta' || stored === 'hi' || stored === 'en') return stored;
  return 'en';
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
  };

  const t = (key: string): string => {
    const m = messages[locale];
    if (m && m[key]) return m[key];
    const enMsg = messages.en[key];
    if (enMsg) return enMsg;
    return key;
  };

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export { LOCALES };
