'use client';

import { useState } from 'react';
import type { InventoryItem } from '@/lib/bpp-client';

interface InventoryTableProps {
  items: InventoryItem[];
  translations: {
    product_name: string;
    sku: string;
    stock: string;
    reserved: string;
    available: string;
    threshold: string;
    update: string;
    out_of_stock: string;
    low_stock: string;
    healthy: string;
  };
  onUpdate?: (itemId: string, quantity: number, threshold: number) => Promise<void>;
}

function stockStatus(item: InventoryItem): 'out' | 'low' | 'healthy' {
  if (item.available_quantity <= 0) return 'out';
  if (item.available_quantity <= item.low_stock_threshold) return 'low';
  return 'healthy';
}

function rowClass(status: 'out' | 'low' | 'healthy'): string {
  if (status === 'out') return 'row-out-of-stock';
  if (status === 'low') return 'row-low-stock';
  return 'row-healthy';
}

function statusBadge(status: 'out' | 'low' | 'healthy', t: InventoryTableProps['translations']): { className: string; label: string } {
  if (status === 'out') return { className: 'badge-red', label: t.out_of_stock };
  if (status === 'low') return { className: 'badge-yellow', label: t.low_stock };
  return { className: 'badge-green', label: t.healthy };
}

export default function InventoryTable({ items, translations: t, onUpdate }: InventoryTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [editThreshold, setEditThreshold] = useState(0);

  function startEdit(item: InventoryItem) {
    setEditingId(item.item_id);
    setEditQty(item.stock_quantity);
    setEditThreshold(item.low_stock_threshold);
  }

  async function saveEdit(itemId: string) {
    if (onUpdate) {
      await onUpdate(itemId, editQty, editThreshold);
    }
    setEditingId(null);
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-surface-border">
      <table className="table" role="table" aria-label={t.stock}>
        <thead>
          <tr>
            <th scope="col">{t.product_name}</th>
            <th scope="col">{t.sku}</th>
            <th scope="col">{t.stock}</th>
            <th scope="col">{t.reserved}</th>
            <th scope="col">{t.available}</th>
            <th scope="col">{t.threshold}</th>
            <th scope="col"><span className="sr-only">Status</span></th>
            <th scope="col"><span className="sr-only">{t.update}</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const status = stockStatus(item);
            const badge = statusBadge(status, t);
            const isEditing = editingId === item.item_id;

            return (
              <tr key={item.item_id} className={rowClass(status)}>
                <td className="font-medium text-white">{item.item_id}</td>
                <td className="font-mono text-xs">{item.sku || '-'}</td>
                <td>
                  {isEditing ? (
                    <input
                      type="number"
                      className="input w-20 text-center"
                      value={editQty}
                      onChange={(e) => setEditQty(parseInt(e.target.value) || 0)}
                      min={0}
                      aria-label={t.stock}
                    />
                  ) : (
                    item.stock_quantity
                  )}
                </td>
                <td>{item.reserved_quantity}</td>
                <td className="font-semibold">{item.available_quantity}</td>
                <td>
                  {isEditing ? (
                    <input
                      type="number"
                      className="input w-20 text-center"
                      value={editThreshold}
                      onChange={(e) => setEditThreshold(parseInt(e.target.value) || 0)}
                      min={0}
                      aria-label={t.threshold}
                    />
                  ) : (
                    item.low_stock_threshold
                  )}
                </td>
                <td><span className={badge.className}>{badge.label}</span></td>
                <td>
                  {isEditing ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="btn-success text-xs"
                        onClick={() => saveEdit(item.item_id)}
                        aria-label={`Save ${item.item_id}`}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel edit"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => startEdit(item)}
                      aria-label={`Edit stock for ${item.item_id}`}
                    >
                      {t.update}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
