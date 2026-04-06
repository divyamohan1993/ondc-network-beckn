import { cookies } from 'next/headers';
import { getMessages } from '@/lib/i18n';
import InventoryClient from './inventory-client';

export const dynamic = 'force-dynamic';

const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || 'http://bpp:3005';

async function fetchInventory() {
  try {
    const res = await fetch(`${BPP_URL}/api/inventory`, { cache: 'no-store' });
    if (!res.ok) return { items: [], total: 0 };
    return res.json();
  } catch {
    return { items: [], total: 0 };
  }
}

export default async function InventoryPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value || 'en';
  const t = getMessages(locale);
  const data = await fetchInventory();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="page-title">{t.inventory.title}</h1>
          <p className="page-subtitle">{data.total} {locale === 'hi' ? 'उत्पाद' : 'products'}</p>
        </div>
      </div>

      <InventoryClient
        initialItems={data.items || []}
        locale={locale}
        translations={t.inventory}
      />
    </div>
  );
}
