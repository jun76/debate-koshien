import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANG, LANG_LABEL, type Lang } from "@debate/shared";
import { ja, type Dict } from "./ja";
import { en } from "./en";

const DICTS: Record<Lang, Dict> = { ja, en };
const STORAGE_KEY = "debate.lang";

function readStoredLang(): Lang {
  if (typeof localStorage === "undefined") return DEFAULT_LANG;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "ja" || stored === "en" ? stored : DEFAULT_LANG;
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Dict;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures (e.g. private mode); the choice still applies this session.
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t: DICTS[lang] }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within a LanguageProvider");
  return ctx;
}

/** Returns the dictionary for the current UI language. */
export function useT(): Dict {
  return useI18n().t;
}

/** Returns the current language and a setter. */
export function useLang(): { lang: Lang; setLang: (lang: Lang) => void } {
  const { lang, setLang } = useI18n();
  return { lang, setLang };
}

/** JA / EN toggle for the settings screen header. */
export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      {(["ja", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-btn ${lang === l ? "active" : ""}`}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
        >
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}
