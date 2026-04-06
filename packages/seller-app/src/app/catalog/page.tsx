import { cookies } from 'next/headers';
import Link from 'next/link';
import { getMessages } from '@/lib/i18n';
import { formatINR } from '@/lib/format';
import CatalogSearch from './catalog-search';

export const dynamic = 'force-dynamic';

const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || 'http://bpp:3005';

async function fetchCatalog() {
  try {
    const res = await fetch(`${BPP_URL}/api/catalog`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function CatalogPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value || 'en';
  const t = getMessages(locale);
  const catalog = await fetchCatalog();
  const items = catalog?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="page-title">{t.catalog.title}</h1>
          <p className="page-subtitle">{items.length} {locale === 'hi' ? 'उत्पाद' : 'products'}</p>
        </div>
        <Link href="/catalog/new" className="btn-primary">
          + {t.catalog.add}
        </Link>
      </div>

      <CatalogSearch items={items} locale={locale} translations={t.catalog} />
    </div>
  );
}
