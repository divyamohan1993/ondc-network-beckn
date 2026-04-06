export function ProductCardSkeleton() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <div className="bg-[var(--color-bg-tertiary)] rounded-lg h-48 w-full mb-3" />
      <div className="bg-[var(--color-bg-tertiary)] rounded h-4 w-3/4 mb-2" />
      <div className="bg-[var(--color-bg-tertiary)] rounded h-4 w-1/2 mb-3" />
      <div className="bg-[var(--color-bg-tertiary)] rounded h-5 w-1/3" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
      role="status"
      aria-label="Loading products"
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function OrderSkeleton() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <div className="bg-[var(--color-bg-tertiary)] rounded h-4 w-1/3 mb-3" />
      <div className="bg-[var(--color-bg-tertiary)] rounded h-4 w-2/3 mb-2" />
      <div className="bg-[var(--color-bg-tertiary)] rounded h-8 w-1/4 mt-4" />
    </div>
  );
}
