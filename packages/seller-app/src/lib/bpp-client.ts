const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || 'http://localhost:3005';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function bppFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${BPP_URL}/api${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`BPP API error ${res.status}: ${errorBody}`);
  }

  return res.json() as Promise<T>;
}

export const bppClient = {
  // Catalog
  getCatalog: () => bppFetch<CatalogResponse>('/catalog'),
  saveCatalog: (data: CatalogSaveRequest) =>
    bppFetch('/catalog', { method: 'POST', body: data }),
  updateItem: (id: string, data: ItemUpdateRequest) =>
    bppFetch(`/catalog/items/${id}`, { method: 'PUT', body: data }),

  // Inventory
  getInventory: (providerId?: string) =>
    bppFetch<InventoryResponse>(`/inventory${providerId ? `?provider_id=${providerId}` : ''}`),
  getLowStock: (providerId?: string) =>
    bppFetch<InventoryResponse>(`/inventory/low-stock${providerId ? `?provider_id=${providerId}` : ''}`),
  updateInventoryItem: (itemId: string, data: InventoryUpdateRequest) =>
    bppFetch(`/inventory/${itemId}`, { method: 'PUT', body: data }),
  bulkUpdateInventory: (data: InventoryBulkRequest) =>
    bppFetch('/inventory', { method: 'POST', body: data }),

  // Orders
  getOrders: () => bppFetch<OrdersResponse>('/orders'),
  fulfillOrder: (orderId: string, data: FulfillRequest) =>
    bppFetch(`/fulfill/${orderId}`, { method: 'POST', body: data }),

  // Upload
  uploadImage: async (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BPP_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },
};

// Types
export interface CatalogResponse {
  provider: {
    id: string;
    descriptor: { name: string; short_desc?: string; images?: Array<{ url: string }> };
  };
  items: CatalogItem[];
  updatedAt: string;
}

export interface CatalogItem {
  id: string;
  descriptor: { name: string; short_desc?: string; long_desc?: string; images?: Array<{ url: string }> };
  price: { value: string; currency: string; maximum_value?: string };
  quantity: { available: { count: number }; maximum?: { count: number } };
  category_id?: string;
  tags?: Array<{ code: string; list: Array<{ code: string; value: string }> }>;
  active?: boolean;
}

export interface CatalogSaveRequest {
  provider: {
    id: string;
    descriptor: { name: string; short_desc?: string; images?: Array<{ url: string }> };
  };
  items: CatalogItem[];
}

export interface ItemUpdateRequest {
  price?: CatalogItem['price'];
  quantity?: CatalogItem['quantity'];
  descriptor?: CatalogItem['descriptor'];
  active?: boolean;
  tags?: CatalogItem['tags'];
}

export interface InventoryResponse {
  provider_id: string;
  items: InventoryItem[];
  total: number;
}

export interface InventoryItem {
  item_id: string;
  sku: string | null;
  stock_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  low_stock_threshold: number;
  max_quantity_per_order?: number;
  track_inventory?: boolean;
  updated_at: string | null;
}

export interface InventoryUpdateRequest {
  stock_quantity: number;
  sku?: string;
  low_stock_threshold?: number;
  max_quantity_per_order?: number;
  provider_id?: string;
}

export interface InventoryBulkRequest {
  items: Array<{
    item_id: string;
    stock_quantity: number;
    sku?: string;
    low_stock_threshold?: number;
    max_quantity_per_order?: number;
  }>;
  provider_id?: string;
}

export interface OrdersResponse {
  orders: Order[];
  total: number;
}

export interface Order {
  transaction_id: string;
  bap_id: string | null;
  domain: string | null;
  latest_action: string;
  latest_status: string | null;
  created_at: string | null;
  actions: Array<{
    action: string;
    status: string | null;
    created_at: string | null;
    message_id: string;
  }>;
}

export interface FulfillRequest {
  status: string;
  bap_id: string;
  bap_uri: string;
  transaction_id: string;
  tracking?: { url?: string; status?: string };
  domain?: string;
  city?: string;
}

export interface UploadResponse {
  url: string;
}
