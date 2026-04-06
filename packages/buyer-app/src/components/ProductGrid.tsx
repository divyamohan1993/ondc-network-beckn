"use client";

import ProductCard from "./ProductCard";
import type { Locale } from "@/lib/i18n";

interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  providerId: string;
  providerName?: string;
  bppId: string;
  bppUri: string;
  domain?: string;
}

export default function ProductGrid({
  products,
  locale,
}: {
  products: Product[];
  locale: Locale;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((p) => (
        <ProductCard
          key={`${p.bppId}-${p.providerId}-${p.id}`}
          id={p.id}
          name={p.name}
          price={p.price}
          imageUrl={p.imageUrl}
          providerId={p.providerId}
          providerName={p.providerName}
          bppId={p.bppId}
          bppUri={p.bppUri}
          locale={locale}
          domain={p.domain}
        />
      ))}
    </div>
  );
}
