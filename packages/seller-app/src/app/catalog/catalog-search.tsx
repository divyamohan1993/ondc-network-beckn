'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatINR } from '@/lib/format';
import type { CatalogItem } from '@/lib/bpp-client';

interface CatalogSearchProps {
  items: CatalogItem[];
  locale: string;
  translations: {
    search_placeholder: string;
    grid_view: string;
    list_view: string;
    in_stock: string;
    low_stock: string;
    out_of_stock: string;
    all: string;
    edit: string;
    filter_category: string;
    filter_stock: string;
  };
}

export default function CatalogSearch({ items, locale, translations: t }: CatalogSearchProps) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [stockFilter, setStockFilter] = useState<string>('all');

  const filtered = items.filter((item) => {
    const name = item.descriptor?.name?.toLowerCase() || '';
    const matchSearch = !search || name.includes(search.toLowerCase()) || item.id.toLowerCase().includes(search.toLowerCase());

    let matchStock = true;
    if (stockFilter === 'in_stock') matchStock = (item.quantity?.available?.count ?? 0) > 10;
    else if (stockFilter === 'low_stock') matchStock = (item.quantity?.available?.count ?? 0) > 0 && (item.quantity?.available?.count ?? 0) <= 10;
    else if (stockFilter === 'out_of_stock') matchStock = (item.quantity?.available?.count ?? 0) === 0;

    return matchSearch && matchStock;
  });

  return (
    <>
      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="catalog-search" className="sr-only">{t.search_placeholder}</label>
          <input
            id="catalog-search"
            type="search"
            className="input"
            placeholder={t.search_placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="stock-filter" className="sr-only">{t.filter_stock}</label>
          <select
            id="stock-filter"
            className="select"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
          >
            <option value="all">{t.all}</option>
            <option value="in_stock">{t.in_stock}</option>
            <option value="low_stock">{t.low_stock}</option>
            <option value="out_of_stock">{t.out_of_stock}</option>
          </select>
        </div>
        <div className="flex gap-1" role="group" aria-label={`${t.grid_view} / ${t.list_view}`}>
          <button
            type="button"
            className={`btn-secondary p-2.5 ${view === 'grid' ? 'bg-saffron-500/15 text-saffron-400 border-saffron-500/30' : ''}`}
            onClick={() => setView('grid')}
            aria-pressed={view === 'grid'}
            aria-label={t.grid_view}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </button>
          <button
            type="button"
            className={`btn-secondary p-2.5 ${view === 'list' ? 'bg-saffron-500/15 text-saffron-400 border-saffron-500/30' : ''}`}
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            aria-label={t.list_view}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Product Grid/List */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-ash-500">
          <p>{locale === 'hi' ? 'कोई उत्पाद नहीं मिला' : 'No products found'}</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => {
            const stockCount = item.quantity?.available?.count ?? 0;
            const stockBadge = stockCount === 0 ? 'badge-red' : stockCount <= 10 ? 'badge-yellow' : 'badge-green';
            const stockLabel = stockCount === 0 ? t.out_of_stock : stockCount <= 10 ? t.low_stock : t.in_stock;

            return (
              <article key={item.id} className="card hover:border-saffron-500/20 transition-colors">
                {item.descriptor?.images?.[0] && (
                  <div className="aspect-square rounded-xl overflow-hidden bg-surface-raised mb-3 -mx-2 -mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.descriptor.images[0].url} alt={item.descriptor.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <h3 className="text-sm font-semibold text-white mb-1 truncate">{item.descriptor?.name || item.id}</h3>
                <p className="text-lg font-bold text-saffron-400 mb-2">{formatINR(item.price?.value || '0', locale)}</p>
                <div className="flex items-center justify-between">
                  <span className={stockBadge}>{stockLabel} ({stockCount})</span>
                  <Link href={`/catalog/${item.id}`} className="text-xs text-saffron-400 hover:underline font-medium min-h-[44px] flex items-center">
                    {t.edit}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-border">
          <table className="table" role="table">
            <thead>
              <tr>
                <th scope="col">{locale === 'hi' ? 'उत्पाद' : 'Product'}</th>
                <th scope="col">{locale === 'hi' ? 'मूल्य' : 'Price'}</th>
                <th scope="col">{locale === 'hi' ? 'स्टॉक' : 'Stock'}</th>
                <th scope="col"><span className="sr-only">{t.edit}</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="font-medium text-white">{item.descriptor?.name || item.id}</td>
                  <td className="text-saffron-400">{formatINR(item.price?.value || '0', locale)}</td>
                  <td>{item.quantity?.available?.count ?? 0}</td>
                  <td>
                    <Link href={`/catalog/${item.id}`} className="text-xs text-saffron-400 hover:underline font-medium min-h-[44px] flex items-center">
                      {t.edit}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
