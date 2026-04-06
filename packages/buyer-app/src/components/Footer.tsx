import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export default function Footer({ locale }: { locale: Locale }) {
  return (
    <footer
      className="bg-[var(--color-bg-secondary)] border-t-2 border-[var(--color-surface-border)] mt-12"
      role="contentinfo"
    >
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav
          className="flex flex-wrap gap-4 justify-center mb-4"
          aria-label="Footer navigation"
        >
          <Link
            href={`/support?lang=${locale}`}
            className="text-[var(--color-text-secondary)] underline min-h-[44px] min-w-[44px] flex items-center"
          >
            {t(locale, "footer.grievance")}
          </Link>
          <span className="text-[var(--color-text-muted)]" aria-hidden="true">|</span>
          <span className="text-[var(--color-text-secondary)] min-h-[44px] flex items-center">
            {t(locale, "footer.privacy")}
          </span>
          <span className="text-[var(--color-text-muted)]" aria-hidden="true">|</span>
          <span className="text-[var(--color-text-secondary)] min-h-[44px] flex items-center">
            {t(locale, "footer.terms")}
          </span>
        </nav>
        <p className="text-center text-sm text-[var(--color-text-muted)]">
          {t(locale, "footer.copyright")}
        </p>

        {/* Mobile bottom nav */}
        <nav
          className="sm:hidden fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t-2 border-[var(--color-surface-border)] flex justify-around py-2 z-50"
          aria-label="Mobile navigation"
        >
          <Link
            href={`/?lang=${locale}`}
            className="flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center p-1 text-[var(--color-text-secondary)] no-underline"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span className="text-[11px] font-semibold">{t(locale, "nav.home")}</span>
          </Link>
          <Link
            href={`/orders?lang=${locale}`}
            className="flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center p-1 text-[var(--color-text-secondary)] no-underline"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span className="text-[11px] font-semibold">{t(locale, "nav.orders")}</span>
          </Link>
          <Link
            href={`/cart?lang=${locale}`}
            className="flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center p-1 text-[var(--color-text-secondary)] no-underline"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            <span className="text-[11px] font-semibold">{t(locale, "nav.cart")}</span>
          </Link>
          <Link
            href={`/support?lang=${locale}`}
            className="flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center p-1 text-[var(--color-text-secondary)] no-underline"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span className="text-[11px] font-semibold">{t(locale, "nav.support")}</span>
          </Link>
        </nav>
      </div>
    </footer>
  );
}
