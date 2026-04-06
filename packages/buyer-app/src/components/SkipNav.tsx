"use client";

export default function SkipNav({ label }: { label: string }) {
  return (
    <a href="#main-content" className="skip-nav">
      {label}
    </a>
  );
}
