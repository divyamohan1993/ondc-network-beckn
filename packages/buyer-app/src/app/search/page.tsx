import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import SearchBar from "@/components/SearchBar";
import ProductGrid from "@/components/ProductGrid";
import { ProductGridSkeleton } from "@/components/LoadingSkeleton";
import { searchProducts } from "@/lib/bap-client";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { Suspense } from "react";

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
  // BAP search is async. The /api/search returns an ACK with transaction_id.
  // Results come via on_search callback. For the buyer app, we poll /api/orders/:txn_id
  // or the BAP provides a webhook. For now, handle both shapes.
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

  // If BAP returns catalog data directly (simplified response)
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

  // If response is an array of catalogs (multiple BPPs)
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

async function SearchResults({
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
  let products: ReturnType<typeof extractProducts> = [];
  let searchSent = false;

  try {
    const result = await searchProducts({
      query,
      city: city || "std:011",
      domain: domain || "ONDC:RET10",
    });
    products = extractProducts(result);
    searchSent = result?.message?.ack?.status === "ACK" || !!result?.context?.transaction_id;
  } catch {
    // BAP unavailable
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12" role="status">
        <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
          {t(locale, "search.no_results", { query })}
        </p>
        <p className="text-[var(--color-text-muted)]">
          {t(locale, "search.try_different")}
        </p>
        {searchSent && (
          <p className="text-sm text-[var(--color-text-muted)] mt-4">
            Search request sent. Results arrive asynchronously via ONDC network.
            Refresh in a few seconds.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {t(locale, "a11y.search_results_loaded", { count: products.length })}
      </p>
      <ProductGrid products={products} locale={locale} />
    </>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; domain?: string; city?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const locale = (params.lang === "hi" ? "hi" : "en") as Locale;
  const query = params.q || "";

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

        <Suspense fallback={<ProductGridSkeleton />}>
          <SearchResults
            query={query}
            domain={params.domain}
            city={params.city}
            locale={locale}
          />
        </Suspense>
      </main>
      <Footer locale={locale} />
    </>
  );
}
