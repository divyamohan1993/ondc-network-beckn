'use client';

import { useState, type FormEvent } from 'react';
import ImageUploader from './ImageUploader';
import ActionButton from './ActionButton';

interface Variant {
  id: string;
  type: string;
  value: string;
  price: string;
  stock: number;
}

interface ProductFormData {
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
  variants: Variant[];
}

interface ProductFormProps {
  initialData?: Partial<ProductFormData>;
  onSubmit: (data: ProductFormData) => Promise<void>;
  onImageUpload: (files: File[]) => Promise<string[]>;
  locale: string;
  translations: {
    name: string;
    description: string;
    price: string;
    mrp: string;
    category: string;
    images: string;
    gst_rate: string;
    hsn_code: string;
    country_of_origin: string;
    weight: string;
    length: string;
    width: string;
    height: string;
    variants: string;
    add_variant: string;
    size: string;
    color: string;
    variant_price: string;
    variant_stock: string;
    save: string;
    cancel: string;
    drag_drop: string;
    or_browse: string;
    max_size: string;
    uploading: string;
    upload_failed: string;
    remove: string;
  };
}

const categories = [
  'Grocery',
  'Fashion',
  'Electronics',
  'Home & Kitchen',
  'Health & Beauty',
  'Books',
  'Sports',
  'Toys',
  'Automotive',
  'Other',
];

const gstRates = ['0', '5', '12', '18', '28'];

export default function ProductForm({ initialData, onSubmit, onImageUpload, locale, translations: t }: ProductFormProps) {
  const [form, setForm] = useState<ProductFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    price: initialData?.price || '',
    mrp: initialData?.mrp || '',
    category: initialData?.category || '',
    gstRate: initialData?.gstRate || '18',
    hsnCode: initialData?.hsnCode || '',
    countryOfOrigin: initialData?.countryOfOrigin || 'India',
    weight: initialData?.weight || '',
    length: initialData?.length || '',
    width: initialData?.width || '',
    height: initialData?.height || '',
    images: initialData?.images || [],
    variants: initialData?.variants || [],
  });

  function update<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addVariant() {
    update('variants', [
      ...form.variants,
      { id: crypto.randomUUID(), type: 'size', value: '', price: form.price, stock: 0 },
    ]);
  }

  function updateVariant(id: string, field: keyof Variant, value: string | number) {
    update(
      'variants',
      form.variants.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );
  }

  function removeVariant(id: string) {
    update('variants', form.variants.filter((v) => v.id !== id));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {/* Basic Info */}
      <fieldset className="card space-y-5">
        <legend className="card-header">{locale === 'hi' ? 'मूल जानकारी' : 'Basic Information'}</legend>

        <div>
          <label htmlFor="name" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.name} *</label>
          <input id="name" type="text" className="input" required value={form.name} onChange={(e) => update('name', e.target.value)} />
        </div>

        <div>
          <label htmlFor="description" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.description}</label>
          <textarea id="description" className="input min-h-[100px] resize-y" rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="price" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.price} (₹) *</label>
            <input id="price" type="number" className="input" required min="0" step="0.01" value={form.price} onChange={(e) => update('price', e.target.value)} />
          </div>
          <div>
            <label htmlFor="mrp" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.mrp} (₹) *</label>
            <input id="mrp" type="number" className="input" required min="0" step="0.01" value={form.mrp} onChange={(e) => update('mrp', e.target.value)} />
          </div>
          <div>
            <label htmlFor="category" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.category} *</label>
            <select id="category" className="select" required value={form.category} onChange={(e) => update('category', e.target.value)}>
              <option value="">{locale === 'hi' ? 'चुनें' : 'Select'}</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </fieldset>

      {/* Tax & Compliance */}
      <fieldset className="card space-y-5">
        <legend className="card-header">{locale === 'hi' ? 'कर और अनुपालन' : 'Tax & Compliance'}</legend>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="gst" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.gst_rate}</label>
            <select id="gst" className="select" value={form.gstRate} onChange={(e) => update('gstRate', e.target.value)}>
              {gstRates.map((r) => <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="hsn" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.hsn_code}</label>
            <input id="hsn" type="text" className="input" value={form.hsnCode} onChange={(e) => update('hsnCode', e.target.value)} />
          </div>
          <div>
            <label htmlFor="origin" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.country_of_origin}</label>
            <input id="origin" type="text" className="input" value={form.countryOfOrigin} onChange={(e) => update('countryOfOrigin', e.target.value)} />
          </div>
        </div>
      </fieldset>

      {/* Dimensions */}
      <fieldset className="card space-y-5">
        <legend className="card-header">{locale === 'hi' ? 'आयाम और वज़न' : 'Dimensions & Weight'}</legend>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label htmlFor="weight" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.weight}</label>
            <input id="weight" type="number" className="input" min="0" value={form.weight} onChange={(e) => update('weight', e.target.value)} />
          </div>
          <div>
            <label htmlFor="length" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.length}</label>
            <input id="length" type="number" className="input" min="0" value={form.length} onChange={(e) => update('length', e.target.value)} />
          </div>
          <div>
            <label htmlFor="width" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.width}</label>
            <input id="width" type="number" className="input" min="0" value={form.width} onChange={(e) => update('width', e.target.value)} />
          </div>
          <div>
            <label htmlFor="height" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.height}</label>
            <input id="height" type="number" className="input" min="0" value={form.height} onChange={(e) => update('height', e.target.value)} />
          </div>
        </div>
      </fieldset>

      {/* Images */}
      <fieldset className="card space-y-5">
        <legend className="card-header">{t.images}</legend>
        <ImageUploader
          onUpload={async (files) => {
            const urls = await onImageUpload(files);
            update('images', [...form.images, ...urls]);
            return urls;
          }}
          existingImages={form.images}
          translations={{
            drag_drop: t.drag_drop,
            or_browse: t.or_browse,
            max_size: t.max_size,
            uploading: t.uploading,
            upload_failed: t.upload_failed,
            remove: t.remove,
          }}
        />
      </fieldset>

      {/* Variants */}
      <fieldset className="card space-y-5">
        <legend className="card-header">{t.variants}</legend>

        {form.variants.map((v) => (
          <div key={v.id} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end p-4 bg-surface-raised/40 rounded-xl border border-surface-border">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">Type</label>
              <select className="select" value={v.type} onChange={(e) => updateVariant(v.id, 'type', e.target.value)} aria-label="Variant type">
                <option value="size">{t.size}</option>
                <option value="color">{t.color}</option>
                <option value="weight">{t.weight}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">Value</label>
              <input type="text" className="input" value={v.value} onChange={(e) => updateVariant(v.id, 'value', e.target.value)} aria-label="Variant value" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.variant_price}</label>
              <input type="number" className="input" min="0" step="0.01" value={v.price} onChange={(e) => updateVariant(v.id, 'price', e.target.value)} aria-label="Variant price" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.variant_stock}</label>
              <input type="number" className="input" min="0" value={v.stock} onChange={(e) => updateVariant(v.id, 'stock', parseInt(e.target.value) || 0)} aria-label="Variant stock" />
            </div>
            <div className="flex items-end">
              <button type="button" className="btn-danger text-xs w-full" onClick={() => removeVariant(v.id)} aria-label={`Remove variant ${v.value}`}>
                {locale === 'hi' ? 'हटाएं' : 'Remove'}
              </button>
            </div>
          </div>
        ))}

        <button type="button" className="btn-secondary text-xs" onClick={addVariant}>
          + {t.add_variant}
        </button>
      </fieldset>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <ActionButton variant="primary" type="submit">
          {t.save}
        </ActionButton>
      </div>
    </form>
  );
}
