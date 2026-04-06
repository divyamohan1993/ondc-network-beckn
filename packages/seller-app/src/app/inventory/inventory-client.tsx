'use client';

import { useState } from 'react';
import InventoryTable from '@/components/InventoryTable';
import type { InventoryItem } from '@/lib/bpp-client';

interface InventoryClientProps {
  initialItems: InventoryItem[];
  locale: string;
  translations: {
    product_name: string;
    sku: string;
    stock: string;
    reserved: string;
    available: string;
    threshold: string;
    low_stock: string;
    update: string;
    bulk_update: string;
    csv_upload: string;
    csv_template: string;
    show_low_stock: string;
    out_of_stock: string;
    healthy: string;
    updated: string;
  };
}

export default function InventoryClient({ initialItems, locale, translations: t }: InventoryClientProps) {
  const [items, setItems] = useState(initialItems);
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [message, setMessage] = useState('');

  const filtered = showLowOnly
    ? items.filter((item) => item.available_quantity <= item.low_stock_threshold)
    : items;

  async function handleUpdate(itemId: string, quantity: number, threshold: number) {
    const res = await fetch('/api/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, stock_quantity: quantity, low_stock_threshold: threshold }),
    });

    if (res.ok) {
      setItems((prev) =>
        prev.map((item) =>
          item.item_id === itemId
            ? { ...item, stock_quantity: quantity, low_stock_threshold: threshold, available_quantity: quantity - item.reserved_quantity }
            : item,
        ),
      );
      setMessage(t.updated);
      setTimeout(() => setMessage(''), 3000);
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.trim().split('\n');
    const updates: Array<{ item_id: string; stock_quantity: number }> = [];

    for (let i = 1; i < lines.length; i++) {
      const [item_id, qty] = lines[i].split(',').map((s) => s.trim());
      if (item_id && qty) {
        updates.push({ item_id, stock_quantity: parseInt(qty) || 0 });
      }
    }

    if (updates.length > 0) {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updates }),
      });

      if (res.ok) {
        setMessage(`${updates.length} ${locale === 'hi' ? 'उत्पाद अपडेट किए गए' : 'items updated'}`);
        setTimeout(() => setMessage(''), 3000);
      }
    }
    e.target.value = '';
  }

  function downloadTemplate() {
    const csv = 'item_id,stock_quantity\nexample-item-1,100\nexample-item-2,50\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            checked={showLowOnly}
            onChange={(e) => setShowLowOnly(e.target.checked)}
            className="w-4 h-4 rounded border-surface-border bg-surface-raised text-saffron-500 accent-saffron-500"
          />
          <span className="text-sm text-ash-300">{t.show_low_stock}</span>
        </label>

        <div className="flex gap-2 ml-auto">
          <label className="btn-secondary text-xs cursor-pointer">
            {t.csv_upload}
            <input type="file" accept=".csv" className="sr-only" onChange={handleCsvUpload} aria-label={t.csv_upload} />
          </label>
          <button type="button" className="btn-secondary text-xs" onClick={downloadTemplate}>
            {t.csv_template}
          </button>
        </div>
      </div>

      {message && (
        <div className="badge-green text-sm" role="status" aria-live="polite">
          {message}
        </div>
      )}

      <InventoryTable
        items={filtered}
        translations={t}
        onUpdate={handleUpdate}
      />
    </>
  );
}
