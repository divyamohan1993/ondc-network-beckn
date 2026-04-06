'use client';

import { useRouter } from 'next/navigation';

const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'EN', ariaLabel: 'Switch to English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिंदी', ariaLabel: 'हिन्दी में बदलें' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', ariaLabel: 'தமிழில் மாற்று' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', ariaLabel: 'తెలుగులో మార్చు' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', ariaLabel: 'ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಿ' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', ariaLabel: 'বাংলায় পরিবর্তন করুন' },
] as const;

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
    <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={label}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => switchLocale(lang.code)}
          className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[44px] min-w-[44px] flex items-center justify-center ${
            locale === lang.code
              ? 'bg-saffron-500/15 text-saffron-400 border border-saffron-500/30'
              : 'text-ash-400 hover:text-ash-300 hover:bg-surface-raised border border-transparent'
          }`}
          aria-pressed={locale === lang.code}
          aria-label={lang.ariaLabel}
        >
          {lang.nativeLabel}
        </button>
      ))}
    </div>
  );
}
