"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import { useCart } from "@/lib/cart-store";
import { formatINR } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function ProductContent({ productId }: { productId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const locale = (searchParams.get("lang") === "hi" ? "hi" : "en") as Locale;
  const providerId = searchParams.get("provider") || "";
  const bppId = searchParams.get("bpp") || "";
  const bppUri = searchParams.get("bppUri") || "";
  const productName = decodeURIComponent(searchParams.get("name") || `Product ${productId}`);
  const productPrice = parseFloat(searchParams.get("price") || "0");
  const productImage = searchParams.get("image") || undefined;

  function handleAddToCart() {
    addToCart(
      { itemId: productId, providerId, bppId, bppUri, name: productName, price: productPrice, imageUrl: productImage },
      quantity
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  function handleBuyNow() {
    handleAddToCart();
    router.push(`/cart?lang=${locale}`);
  }

  return (
    <>
      <SkipNav label={t(locale, "nav.skip_to_content")} />
      <Header locale={locale} />
      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6">
        <button onClick={() => router.back()} className="btn btn-secondary btn-sm mb-4" type="button">
          &larr; {t(locale, "common.back")}
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-[var(--color-bg-secondary)] rounded-xl h-72 md:h-96 flex items-center justify-center overflow-hidden">
            {productImage ? (
              <img src={productImage} alt={t(locale, "a11y.product_image", { name: productName })} className="w-full h-full object-contain" />
            ) : (
              <svg aria-hidden="true" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">{productName}</h1>
            {providerId && (
              <p className="text-sm text-[var(--color-text-muted)] mb-4">{t(locale, "product.seller")}: {providerId}</p>
            )}
            <p className="text-3xl font-bold text-[var(--color-text-primary)] mb-6">{formatINR(productPrice)}</p>

            <div className="mb-6">
              <label htmlFor="qty" className="form-label">{t(locale, "product.quantity")}</label>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center border-2 border-[var(--color-surface-border)] rounded-lg">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-11 h-11 flex items-center justify-center text-lg font-bold" aria-label={t(locale, "cart.decrease")} type="button">-</button>
                  <input id="qty" type="number" min="1" max="99" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))} className="w-14 text-center font-semibold text-[var(--color-text-primary)] border-0 bg-transparent" aria-label={t(locale, "product.select_quantity")} />
                  <button onClick={() => setQuantity(Math.min(99, quantity + 1))} className="w-11 h-11 flex items-center justify-center text-lg font-bold" aria-label={t(locale, "cart.increase")} type="button">+</button>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handleAddToCart} className="btn btn-secondary flex-1" type="button">{t(locale, "product.add_to_cart")}</button>
              <button onClick={handleBuyNow} className="btn btn-primary flex-1" type="button">{t(locale, "product.buy_now")}</button>
            </div>

            {added && (
              <p className="mt-3 text-[var(--color-success)] font-semibold" role="status" aria-live="polite">
                {t(locale, "product.added_to_cart")}
              </p>
            )}

            <div className="badge badge-success mt-4">{t(locale, "product.in_stock")}</div>
          </div>
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}

export default function ProductPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const [productId, setProductId] = useState<string | null>(null);

  useEffect(() => {
    paramsPromise.then((p) => setProductId(p.id));
  }, [paramsPromise]);

  if (!productId) return null;

  return (
    <Suspense>
      <ProductContent productId={productId} />
    </Suspense>
  );
}
