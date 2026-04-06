'use client';

import { useState, type ReactNode, type ButtonHTMLAttributes } from 'react';

interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'secondary';
  children: ReactNode;
  onClick?: () => void | Promise<void>;
}

const variantMap: Record<string, string> = {
  primary: 'btn-primary',
  success: 'btn-success',
  danger: 'btn-danger',
  warning: 'btn-warning',
  secondary: 'btn-secondary',
};

export default function ActionButton({
  variant = 'primary',
  children,
  onClick,
  disabled,
  ...props
}: ActionButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!onClick || loading) return;
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={`${variantMap[variant]} gap-2 text-xs`}
      onClick={handleClick}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
