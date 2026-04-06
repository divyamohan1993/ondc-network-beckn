'use client';

import { useRouter } from 'next/navigation';
import ProductForm from '@/components/ProductForm';
import { getMessages } from '@/lib/i18n';
import { useEffect, useState } from 'react';

function getLocale(): string {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.match(/(?:^|; )locale=([^;]*)/);
  return match?.[1] || 'en';
}

export default function NewProductPage() {
  const router = useRouter();
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    setLocale(getLocale());
  }, []);

  const t = getMessages(locale);

  async function handleImageUpload(files: File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        urls.push(data.url);
      }
    }
    return urls;
  }

  async function handleSubmit(data: {
    name: string;
    description: string;
    price: string;
    mrp: string;
    category: string;
    gstRate: string;
    hsnCode: string;
    countryOfOrigin: string;
    weight: string;
    length: string;
    width: string;
    height: string;
    images: string[];
    variants: Array<{ id: string; type: string; value: string; price: string; stock: number }>;
  }) {
    const item = {
      id: crypto.randomUUID(),
      descriptor: {
        name: data.name,
        short_desc: data.description,
        images: data.images.map((url) => ({ url })),
      },
      price: { value: data.price, currency: 'INR', maximum_value: data.mrp },
      quantity: { available: { count: 0 }, maximum: { count: 9999 } },
      category_id: data.category,
      tags: [
        { code: 'origin', list: [{ code: 'country', value: data.countryOfOrigin }] },
        { code: 'tax', list: [{ code: 'gst_rate', value: data.gstRate }, { code: 'hsn_code', value: data.hsnCode }] },
        {
          code: 'dimensions',
          list: [
            { code: 'weight', value: data.weight },
            { code: 'length', value: data.length },
            { code: 'width', value: data.width },
            { code: 'height', value: data.height },
          ],
        },
      ],
    };

    const res = await fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item }),
    });

    if (res.ok) {
      router.push('/catalog');
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">{t.catalog.add}</h1>
        <p className="page-subtitle">{locale === 'hi' ? 'अपने कैटलॉग में नया उत्पाद जोड़ें' : 'Add a new product to your catalog'}</p>
      </div>

      <ProductForm
        onSubmit={handleSubmit}
        onImageUpload={handleImageUpload}
        locale={locale}
        translations={{
          ...t.catalog,
          save: t.app.save,
          cancel: t.app.cancel,
          drag_drop: t.upload.drag_drop,
          or_browse: t.upload.or_browse,
          max_size: t.upload.max_size,
          uploading: t.upload.uploading,
          upload_failed: t.upload.upload_failed,
          remove: t.upload.remove,
        }}
      />
    </div>
  );
}
