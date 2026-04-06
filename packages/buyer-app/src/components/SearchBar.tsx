"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export default function SearchBar({ locale }: { locale: Locale }) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    router.push(`/search?q=${encodeURIComponent(trimmed)}&lang=${locale}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="w-full max-w-2xl mx-auto"
    >
      <label htmlFor="search-input" className="sr-only">
        {t(locale, "search.placeholder")}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id="search-input"
          type="search"
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(locale, "search.placeholder")}
          className="form-input flex-1"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" className="btn btn-primary">
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="hidden sm:inline">{t(locale, "search.button")}</span>
        </button>
      </div>
    </form>
  );
}
