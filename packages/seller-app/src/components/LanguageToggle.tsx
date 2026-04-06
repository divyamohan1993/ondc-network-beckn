'use client';

import { useRouter } from 'next/navigation';

interface LanguageToggleProps {
  locale: string;
  label: string;
}

export default function LanguageToggle({ locale, label }: LanguageToggleProps) {
  const router = useRouter();

  function switchLocale(newLocale: string) {
    document.cookie = `locale=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => switchLocale('en')}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[44px] min-w-[44px] flex items-center justify-center ${
          locale === 'en'
            ? 'bg-saffron-500/15 text-saffron-400 border border-saffron-500/30'
            : 'text-ash-400 hover:text-ash-300 hover:bg-surface-raised border border-transparent'
        }`}
        aria-pressed={locale === 'en'}
        aria-label="Switch to English"
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => switchLocale('hi')}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[44px] min-w-[44px] flex items-center justify-center ${
          locale === 'hi'
            ? 'bg-saffron-500/15 text-saffron-400 border border-saffron-500/30'
            : 'text-ash-400 hover:text-ash-300 hover:bg-surface-raised border border-transparent'
        }`}
        aria-pressed={locale === 'hi'}
        aria-label="हिन्दी में बदलें"
      >
        हि
      </button>
    </div>
  );
}
