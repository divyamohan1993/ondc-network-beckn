"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-store";
import { formatINR } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  providerId: string;
  providerName?: string;
  bppId: string;
  bppUri: string;
  locale: Locale;
  domain?: string;
}

export default function ProductCard({
  id,
  name,
  price,
  imageUrl,
  providerId,
  providerName,
  bppId,
  bppUri,
  locale,
  domain,
}: ProductCardProps) {
  const { addToCart } = useCart();

  function handleAdd() {
    addToCart({
      itemId: id,
      providerId,
      bppId,
      bppUri,
      name,
      price,
      imageUrl,
      domain,
    });
  }

  return (
    <article className="card flex flex-col" aria-label={name}>
      <Link
        href={`/product/${id}?provider=${providerId}&bpp=${bppId}&bppUri=${encodeURIComponent(bppUri)}&lang=${locale}`}
        className="block"
      >
        <div className="bg-[var(--color-bg-secondary)] rounded-lg h-48 w-full mb-3 flex items-center justify-center overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={t(locale, "a11y.product_image", { name })}
              className="h-full w-full object-cover rounded-lg"
              loading="lazy"
            />
          ) : (
            <svg
              aria-hidden="true"
              width="48"
              height="48"
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
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1 line-clamp-2">
          {name}
        </h3>
        {providerName && (
          <p className="text-xs text-[var(--color-text-muted)] mb-2">
            {t(locale, "product.seller")}: {providerName}
          </p>
        )}
      </Link>
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <span
          className="text-lg font-bold text-[var(--color-text-primary)]"
          aria-label={t(locale, "a11y.price_of", { name, price: formatINR(price) })}
        >
          {formatINR(price)}
        </span>
        <button
          onClick={handleAdd}
          className="btn btn-primary btn-sm text-sm"
          aria-label={`${t(locale, "product.add_to_cart")} - ${name}`}
        >
          {t(locale, "product.add_to_cart")}
        </button>
      </div>
    </article>
  );
}
