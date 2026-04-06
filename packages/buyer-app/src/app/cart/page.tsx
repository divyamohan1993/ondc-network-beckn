"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import CartItemComponent from "@/components/CartItem";
import CartSummary from "@/components/CartSummary";
import { useCart } from "@/lib/cart-store";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function CartContent() {
  const searchParams = useSearchParams();
  const locale = (searchParams.get("lang") === "hi" ? "hi" : "en") as Locale;
  const { items, subtotal } = useCart();

  const estimatedTax = Math.round(subtotal * 0.05);

  return (
    <>
      <SkipNav label={t(locale, "nav.skip_to_content")} />
      <Header locale={locale} />
      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6">
          {t(locale, "cart.title")}
        </h1>

        {items.length === 0 ? (
          <div className="text-center py-12">
            <svg
              aria-hidden="true"
              className="mx-auto mb-4"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="1"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              {t(locale, "cart.empty")}
            </p>
            <p className="text-[var(--color-text-muted)] mb-6">
              {t(locale, "cart.empty_message")}
            </p>
            <Link href={`/?lang=${locale}`} className="btn btn-primary">
              {t(locale, "cart.start_shopping")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4" role="list" aria-label={t(locale, "cart.title")}>
              {items.map((item) => (
                <CartItemComponent
                  key={`${item.bppId}-${item.providerId}-${item.itemId}`}
                  item={item}
                  locale={locale}
                />
              ))}
            </div>

            <div className="space-y-4">
              <CartSummary
                subtotal={subtotal}
                deliveryFee={0}
                taxes={estimatedTax}
                locale={locale}
              />
              <Link
                href={`/checkout?lang=${locale}`}
                className="btn btn-primary w-full text-center"
              >
                {t(locale, "cart.checkout")}
              </Link>
            </div>
          </div>
        )}
      </main>
      <Footer locale={locale} />
    </>
  );
}

export default function CartPage() {
  return (
    <Suspense>
      <CartContent />
    </Suspense>
  );
}
