"use client";

import { useCart } from "@/lib/cart-store";
import { formatINR } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { CartItem as CartItemType } from "@/lib/cart-store";

export default function CartItem({
  item,
  locale,
}: {
  item: CartItemType;
  locale: Locale;
}) {
  const { updateQuantity, removeFromCart } = useCart();

  return (
    <div className="card flex gap-4 items-start" role="listitem">
      <div className="w-20 h-20 bg-[var(--color-bg-secondary)] rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={t(locale, "a11y.product_image", { name: item.name })}
            className="w-full h-full object-cover rounded-lg"
            loading="lazy"
          />
        ) : (
          <svg
            aria-hidden="true"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="1"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[var(--color-text-primary)] text-sm line-clamp-2 mb-1">
          {item.name}
        </h3>
        <p className="text-lg font-bold text-[var(--color-text-primary)]">
          {formatINR(item.price * item.quantity)}
        </p>

        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center border-2 border-[var(--color-surface-border)] rounded-lg" role="group" aria-label={t(locale, "product.select_quantity")}>
            <button
              onClick={() =>
                updateQuantity(item.itemId, item.providerId, item.bppId, item.quantity - 1)
              }
              className="w-11 h-11 flex items-center justify-center text-lg font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
              aria-label={t(locale, "cart.decrease")}
              type="button"
            >
              -
            </button>
            <span
              className="w-10 text-center font-semibold text-[var(--color-text-primary)]"
              aria-live="polite"
              aria-atomic="true"
            >
              {item.quantity}
            </span>
            <button
              onClick={() =>
                updateQuantity(item.itemId, item.providerId, item.bppId, item.quantity + 1)
              }
              className="w-11 h-11 flex items-center justify-center text-lg font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
              aria-label={t(locale, "cart.increase")}
              type="button"
            >
              +
            </button>
          </div>

          <button
            onClick={() => removeFromCart(item.itemId, item.providerId, item.bppId)}
            className="btn-sm btn-secondary text-[var(--color-error)]"
            aria-label={`${t(locale, "cart.remove")} ${item.name}`}
            type="button"
          >
            {t(locale, "cart.remove")}
          </button>
        </div>
      </div>
    </div>
  );
}
