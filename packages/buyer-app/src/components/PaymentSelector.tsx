"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export type PaymentMethod = "upi" | "card" | "cod";

interface PaymentSelectorProps {
  locale: Locale;
  onSelect: (method: PaymentMethod) => void;
  selected?: PaymentMethod;
}

const METHODS: { key: PaymentMethod; labelKey: string; icon: string }[] = [
  { key: "upi", labelKey: "payment.upi", icon: "UPI" },
  { key: "card", labelKey: "payment.card", icon: "CARD" },
  { key: "cod", labelKey: "payment.cod", icon: "COD" },
];

export default function PaymentSelector({
  locale,
  onSelect,
  selected: initialSelected,
}: PaymentSelectorProps) {
  const [selected, setSelected] = useState<PaymentMethod | undefined>(initialSelected);

  function handleSelect(method: PaymentMethod) {
    setSelected(method);
    onSelect(method);
  }

  return (
    <fieldset>
      <legend className="text-lg font-bold text-[var(--color-text-primary)] mb-4">
        {t(locale, "checkout.payment")}
      </legend>
      <div className="space-y-3" role="radiogroup" aria-label={t(locale, "checkout.payment")}>
        {METHODS.map((m) => (
          <label
            key={m.key}
            className={`card flex items-center gap-4 cursor-pointer ${
              selected === m.key
                ? "border-2 border-[var(--color-brand)] bg-[var(--color-brand-light)]"
                : ""
            }`}
          >
            <input
              type="radio"
              name="payment-method"
              value={m.key}
              checked={selected === m.key}
              onChange={() => handleSelect(m.key)}
              className="w-5 h-5 accent-[var(--color-brand)]"
            />
            <span className="inline-flex items-center justify-center w-12 h-8 bg-[var(--color-bg-secondary)] rounded text-xs font-bold text-[var(--color-text-muted)]">
              {m.icon}
            </span>
            <span className="font-semibold text-[var(--color-text-primary)]">
              {t(locale, m.labelKey)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
