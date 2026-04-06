import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import SearchBar from "@/components/SearchBar";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const CATEGORIES = [
  { key: "grocery", icon: "🛒", domain: "ONDC:RET10" },
  { key: "fashion", icon: "👕", domain: "ONDC:RET12" },
  { key: "electronics", icon: "📱", domain: "ONDC:RET14" },
  { key: "health", icon: "💊", domain: "ONDC:RET18" },
  { key: "home_kitchen", icon: "🏠", domain: "ONDC:RET16" },
  { key: "beauty", icon: "✨", domain: "ONDC:RET13" },
] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const locale = (params.lang === "hi" ? "hi" : "en") as Locale;

  return (
    <>
      <SkipNav label={t(locale, "nav.skip_to_content")} />
      <Header locale={locale} />
      <main id="main-content" className="max-w-7xl mx-auto px-4 py-6">
        <section className="text-center py-8" aria-labelledby="hero-heading">
          <h1
            id="hero-heading"
            className="text-3xl sm:text-4xl font-bold text-[var(--color-text-primary)] mb-2"
          >
            {t(locale, "app.name")}
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)] mb-6">
            {t(locale, "app.tagline")}
          </p>
          <SearchBar locale={locale} />
        </section>

        <section className="py-8" aria-labelledby="categories-heading">
          <h2
            id="categories-heading"
            className="text-xl font-bold text-[var(--color-text-primary)] mb-6"
          >
            {t(locale, "categories.title")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.key}
                href={`/search?q=${cat.key}&domain=${cat.domain}&lang=${locale}`}
                className="card flex flex-col items-center gap-3 p-6 text-center hover:border-[var(--color-brand)] transition-colors no-underline min-h-[120px]"
              >
                <span className="text-4xl" role="img" aria-hidden="true">
                  {cat.icon}
                </span>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {t(locale, `categories.${cat.key}`)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer locale={locale} />
    </>
  );
}
