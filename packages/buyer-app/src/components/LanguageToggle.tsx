"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Locale } from "@/lib/i18n";

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

  const toggle = useCallback(() => {
    const next = locale === "en" ? "hi" : "en";
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", next);
    router.push(`${pathname}?${params.toString()}`);
  }, [locale, router, pathname, searchParams]);

  return (
    <button
      onClick={toggle}
      className="btn-sm btn-secondary"
      aria-label={label}
      type="button"
    >
      {locale === "en" ? "हिंदी" : "English"}
    </button>
  );
}
