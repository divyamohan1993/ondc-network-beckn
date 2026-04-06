"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-store";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import LanguageToggle from "./LanguageToggle";
import { Suspense } from "react";

function CartBadge({ locale }: { locale: Locale }) {
  const { totalItems } = useCart();
  const countLabel = t(locale, "a11y.cart_count", { count: totalItems });

  return (
    <Link
      href={`/cart?lang=${locale}`}
      className="relative btn-sm btn-secondary"
      aria-label={countLabel}
    >
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
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      <span className="font-bold">{t(locale, "nav.cart")}</span>
      {totalItems > 0 && (
        <span
          className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--color-error)] text-[var(--color-text-inverse)] text-[11px] font-bold rounded-full flex items-center justify-center"
          aria-hidden="true"
        >
          {totalItems > 99 ? "99+" : totalItems}
        </span>
      )}
    </Link>
  );
}

function LanguageToggleWrapper({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={<span className="btn-sm btn-secondary">{locale === "en" ? "हिंदी" : "English"}</span>}>
      <LanguageToggle locale={locale} label={t(locale, "a11y.language_toggle")} />
    </Suspense>
  );
}

export default function Header({ locale }: { locale: Locale }) {
  return (
    <header
      className="sticky top-0 z-50 bg-[var(--color-surface)] border-b-2 border-[var(--color-surface-border)]"
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link
          href={`/?lang=${locale}`}
          className="flex items-center gap-2 font-bold text-lg text-[var(--color-brand)] no-underline min-h-[44px] min-w-[44px]"
          aria-label={t(locale, "app.name")}
        >
          <svg
            aria-hidden="true"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="var(--color-brand)"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="hidden sm:inline">{t(locale, "app.name")}</span>
        </Link>

        <nav className="flex items-center gap-2" aria-label="Main navigation">
          <Link
            href={`/?lang=${locale}`}
            className="btn-sm btn-secondary hidden sm:inline-flex"
          >
            {t(locale, "nav.home")}
          </Link>
          <Link
            href={`/orders?lang=${locale}`}
            className="btn-sm btn-secondary hidden sm:inline-flex"
          >
            {t(locale, "nav.orders")}
          </Link>
          <Link
            href={`/support?lang=${locale}`}
            className="btn-sm btn-secondary hidden sm:inline-flex"
          >
            {t(locale, "nav.support")}
          </Link>
          <CartBadge locale={locale} />
          <LanguageToggleWrapper locale={locale} />
        </nav>
      </div>
    </header>
  );
}
