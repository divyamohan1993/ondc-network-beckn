"use client";

import { formatINR } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface CartSummaryProps {
  subtotal: number;
  deliveryFee?: number;
  taxes?: number;
  locale: Locale;
}

export default function CartSummary({
  subtotal,
  deliveryFee = 0,
  taxes = 0,
  locale,
}: CartSummaryProps) {
  const total = subtotal + deliveryFee + taxes;

  return (
    <div className="card" role="region" aria-label={t(locale, "checkout.order_summary")}>
      <dl className="space-y-3">
        <div className="flex justify-between">
          <dt className="text-[var(--color-text-secondary)]">
            {t(locale, "cart.subtotal")}
          </dt>
          <dd className="font-semibold text-[var(--color-text-primary)]">
            {formatINR(subtotal)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--color-text-secondary)]">
            {t(locale, "cart.delivery_fee")}
          </dt>
          <dd className="font-semibold text-[var(--color-text-primary)]">
            {deliveryFee === 0 ? t(locale, "common.free") : formatINR(deliveryFee)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--color-text-secondary)]">
            {t(locale, "cart.taxes")}
          </dt>
          <dd className="font-semibold text-[var(--color-text-primary)]">
            {formatINR(taxes)}
          </dd>
        </div>
        <div
          className="flex justify-between pt-3 border-t-2 border-[var(--color-surface-border)]"
        >
          <dt className="text-lg font-bold text-[var(--color-text-primary)]">
            {t(locale, "cart.total")}
          </dt>
          <dd className="text-lg font-bold text-[var(--color-text-primary)]">
            {formatINR(total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
