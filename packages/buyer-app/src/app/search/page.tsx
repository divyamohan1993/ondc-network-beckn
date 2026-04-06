"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import SearchBar from "@/components/SearchBar";
import ProductGrid from "@/components/ProductGrid";
import { ProductGridSkeleton } from "@/components/LoadingSkeleton";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface CatalogItem {
  id?: string;
  descriptor?: { name?: string; long_desc?: string; images?: Array<{ url?: string }> };
  price?: { value?: string; currency?: string };
  quantity?: { available?: { count?: number } };
}

interface Provider {
  id?: string;
  descriptor?: { name?: string };
  items?: CatalogItem[];
}

interface CatalogResponse {
  context?: { transaction_id?: string; bpp_id?: string; bpp_uri?: string; domain?: string };
  message?: {
    catalog?: {
      providers?: Provider[];
    };
  };
}

function extractProducts(data: unknown) {
  const products: Array<{
    id: string;
    name: string;
    price: number;
    imageUrl?: string;
    providerId: string;
    providerName?: string;
    bppId: string;
    bppUri: string;
    domain?: string;
  }> = [];

  if (!data || typeof data !== "object") return products;

  const resp = data as CatalogResponse;
  const catalog = resp?.message?.catalog;
  if (catalog?.providers) {
    for (const provider of catalog.providers) {
      for (const item of provider.items || []) {
        products.push({
          id: item.id || "",
          name: item.descriptor?.name || "Unknown Product",
          price: parseFloat(item.price?.value || "0"),
          imageUrl: item.descriptor?.images?.[0]?.url,
          providerId: provider.id || "",
          providerName: provider.descriptor?.name,
          bppId: resp.context?.bpp_id || "",
          bppUri: resp.context?.bpp_uri || "",
          domain: resp.context?.domain,
        });
      }
    }
  }

  if (Array.isArray(data)) {
    for (const entry of data as CatalogResponse[]) {
      const cat = entry?.message?.catalog;
      if (cat?.providers) {
        for (const provider of cat.providers) {
          for (const item of provider.items || []) {
            products.push({
              id: item.id || "",
              name: item.descriptor?.name || "Unknown Product",
              price: parseFloat(item.price?.value || "0"),
              imageUrl: item.descriptor?.images?.[0]?.url,
              providerId: provider.id || "",
              providerName: provider.descriptor?.name,
              bppId: entry.context?.bpp_id || "",
              bppUri: entry.context?.bpp_uri || "",
              domain: entry.context?.domain,
            });
          }
        }
      }
    }
  }

  return products;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 15000;

function SearchResults({
  query,
  domain,
  city,
  locale,
}: {
  query: string;
  domain?: string;
  city?: string;
  locale: Locale;
}) {
  const [products, setProducts] = useState<ReturnType<typeof extractProducts>>([]);
  const [polling, setPolling] = useState(false);
  const [done, setDone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pollRef.current = null;
    timeoutRef.current = null;
  }, []);

  useEffect(() => {
    if (!query) {
      setDone(true);
      return;
    }

    let cancelled = false;

    async function initiateSearch() {
      setPolling(true);
      setDone(false);
      setProducts([]);

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            city: city || "std:011",
            domain: domain || "ONDC:RET10",
          }),
        });
        const data = await res.json();

        // Extract transaction_id for polling
        const txnId = data?.context?.transaction_id;

        // Check if results came back directly (unlikely in ONDC async, but handle it)
        const directProducts = extractProducts(data);
        if (directProducts.length > 0) {
          if (!cancelled) {
            setProducts(directProducts);
            setPolling(false);
            setDone(true);
          }
          return;
        }

        if (!txnId) {
          if (!cancelled) {
            setPolling(false);
            setDone(true);
          }
          return;
        }

        // Poll for results
        pollRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/search?txn=${encodeURIComponent(txnId)}`);
            const pollData = await pollRes.json();

            if (pollData?.callback_received && pollData?.callback_data) {
              const newProducts = extractProducts(pollData.callback_data);
              if (newProducts.length > 0 && !cancelled) {
                setProducts((prev) => {
                  const existingIds = new Set(prev.map((p) => p.id));
                  const unique = newProducts.filter((p) => !existingIds.has(p.id));
                  return [...prev, ...unique];
                });
              }
            }
          } catch {
            // Poll failed, continue trying
          }
        }, POLL_INTERVAL_MS);

        // Stop polling after timeout
        timeoutRef.current = setTimeout(() => {
          cleanup();
          if (!cancelled) {
            setPolling(false);
            setDone(true);
          }
        }, POLL_TIMEOUT_MS);
      } catch {
        if (!cancelled) {
          setPolling(false);
          setDone(true);
        }
      }
    }

    initiateSearch();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [query, domain, city, cleanup]);

  if (!query) return null;

  if (polling && products.length === 0) {
    return <ProductGridSkeleton />;
  }

  if (done && products.length === 0) {
    return (
      <div className="text-center py-12" role="status">
        <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
          {t(locale, "search.no_results", { query })}
        </p>
        <p className="text-[var(--color-text-muted)]">
          {t(locale, "search.try_different")}
        </p>
      </div>
    );
  }

  return (
    <>
      {polling && (
        <div className="flex items-center gap-2 mb-4 text-sm text-[var(--color-text-muted)]" role="status" aria-live="polite">
          <span className="inline-block w-4 h-4 border-2 border-[var(--color-brand)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          Searching ONDC network...
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {t(locale, "a11y.search_results_loaded", { count: products.length })}
      </p>
      <ProductGrid products={products} locale={locale} />
    </>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const locale = (searchParams.get("lang") === "hi" ? "hi" : "en") as Locale;
  const query = searchParams.get("q") || "";

  return (
    <>
      <SkipNav label={t(locale, "nav.skip_to_content")} />
      <Header locale={locale} />
      <main id="main-content" className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <SearchBar locale={locale} />
        </div>

        {query && (
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-6">
            {t(locale, "search.results_for", { query })}
          </h1>
        )}

        <SearchResults
          query={query}
          domain={searchParams.get("domain") || undefined}
          city={searchParams.get("city") || undefined}
          locale={locale}
        />
      </main>
      <Footer locale={locale} />
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <SearchPageContent />
    </Suspense>
  );
}
