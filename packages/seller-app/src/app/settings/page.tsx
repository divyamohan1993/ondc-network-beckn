'use client';

import { useState, useEffect } from 'react';
import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';
import ActionButton from '@/components/ActionButton';

function getLocale(): string {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.match(/(?:^|; )locale=([^;]*)/);
  return match?.[1] || 'en';
}

export default function SettingsPage() {
  const [locale, setLocale] = useState('en');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocale(getLocale());
  }, []);

  const t = locale === 'hi' ? hi : en;

  const [form, setForm] = useState({
    businessName: '',
    gstin: '',
    pan: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    accountName: '',
    accountNumber: '',
    ifscCode: '',
    bankName: '',
    notifyNewOrder: true,
    notifyCancellation: true,
    notifyLowStock: true,
    notifySettlement: true,
  });

  function update(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    // Will save to API when implemented
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">{t.settings.title}</h1>
        <p className="page-subtitle">{locale === 'hi' ? 'अपनी दुकान की सेटिंग्स प्रबंधित करें' : 'Manage your shop settings'}</p>
      </div>

      {saved && (
        <div className="badge-green text-sm" role="status" aria-live="polite">
          {t.settings.saved}
        </div>
      )}

      {/* Business Details */}
      <fieldset className="card space-y-5">
        <legend className="card-header">{t.settings.business_details}</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="businessName" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.business_name}</label>
            <input id="businessName" type="text" className="input" value={form.businessName} onChange={(e) => update('businessName', e.target.value)} />
          </div>
          <div>
            <label htmlFor="gstin" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.gstin}</label>
            <input id="gstin" type="text" className="input" value={form.gstin} onChange={(e) => update('gstin', e.target.value)} maxLength={15} />
          </div>
          <div>
            <label htmlFor="pan" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.pan}</label>
            <input id="pan" type="text" className="input" value={form.pan} onChange={(e) => update('pan', e.target.value)} maxLength={10} />
          </div>
        </div>

        <div>
          <label htmlFor="address" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.address}</label>
          <textarea id="address" className="input min-h-[80px] resize-y" rows={2} value={form.address} onChange={(e) => update('address', e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="city" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.city}</label>
            <input id="city" type="text" className="input" value={form.city} onChange={(e) => update('city', e.target.value)} />
          </div>
          <div>
            <label htmlFor="state" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.state}</label>
            <input id="state" type="text" className="input" value={form.state} onChange={(e) => update('state', e.target.value)} />
          </div>
          <div>
            <label htmlFor="pincode" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.pincode}</label>
            <input id="pincode" type="text" className="input" value={form.pincode} onChange={(e) => update('pincode', e.target.value)} maxLength={6} inputMode="numeric" pattern="[0-9]{6}" />
          </div>
        </div>
      </fieldset>

      {/* Bank Account */}
      <fieldset className="card space-y-5">
        <legend className="card-header">{t.settings.bank_account}</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="accountName" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.account_name}</label>
            <input id="accountName" type="text" className="input" value={form.accountName} onChange={(e) => update('accountName', e.target.value)} />
          </div>
          <div>
            <label htmlFor="accountNumber" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.account_number}</label>
            <input id="accountNumber" type="text" className="input" value={form.accountNumber} onChange={(e) => update('accountNumber', e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label htmlFor="ifscCode" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.ifsc_code}</label>
            <input id="ifscCode" type="text" className="input" value={form.ifscCode} onChange={(e) => update('ifscCode', e.target.value)} maxLength={11} />
          </div>
          <div>
            <label htmlFor="bankName" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">{t.settings.bank_name}</label>
            <input id="bankName" type="text" className="input" value={form.bankName} onChange={(e) => update('bankName', e.target.value)} />
          </div>
        </div>
      </fieldset>

      {/* Notifications */}
      <fieldset className="card space-y-4">
        <legend className="card-header">{t.settings.notifications}</legend>

        {[
          { key: 'notifyNewOrder', label: t.settings.notify_new_order },
          { key: 'notifyCancellation', label: t.settings.notify_cancellation },
          { key: 'notifyLowStock', label: t.settings.notify_low_stock },
          { key: 'notifySettlement', label: t.settings.notify_settlement },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              checked={form[key as keyof typeof form] as boolean}
              onChange={(e) => update(key, e.target.checked)}
              className="w-5 h-5 rounded border-surface-border bg-surface-raised text-saffron-500 accent-saffron-500"
            />
            <span className="text-sm text-ash-300">{label}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex justify-end">
        <ActionButton variant="primary" onClick={handleSave}>
          {t.app.save}
        </ActionButton>
      </div>
    </div>
  );
}
