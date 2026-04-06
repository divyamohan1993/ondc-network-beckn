"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Locale } from "@/lib/i18n";

const LANGUAGES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "EN" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
];

export default function LanguageToggle({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const switchLocale = useCallback((next: Locale) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", next);
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={label}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => switchLocale(lang.code)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${
            locale === lang.code
              ? "bg-primary/10 text-primary border border-primary/30 font-semibold"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-transparent"
          }`}
          aria-pressed={locale === lang.code}
          aria-label={`Switch to ${lang.label}`}
          type="button"
        >
          {lang.nativeLabel}
        </button>
      ))}
    </div>
  );
}
