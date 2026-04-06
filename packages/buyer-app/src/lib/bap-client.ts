const BAP_URL = process.env.BAP_URL || process.env.NEXT_PUBLIC_BAP_URL || "http://localhost:3004";

interface SearchParams {
  query?: string;
  city?: string;
  domain?: string;
  provider?: { id?: string; descriptor?: { name?: string } };
  item?: { descriptor?: { name?: string } };
}

interface SelectParams {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  provider_id: string;
  items: Array<{ id: string; quantity?: { count?: number } }>;
  domain?: string;
}

interface InitParams {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  billing: {
    name?: string;
    phone?: string;
    email?: string;
    address?: {
      door?: string;
      name?: string;
      building?: string;
      street?: string;
      locality?: string;
      city?: string;
      state?: string;
      country?: string;
      area_code?: string;
    };
  };
  fulfillment?: {
    id?: string;
    type?: string;
    end?: {
      location?: {
        gps?: string;
        address?: {
          door?: string;
          name?: string;
          building?: string;
          street?: string;
          locality?: string;
          city?: string;
          state?: string;
          country?: string;
          area_code?: string;
        };
      };
      contact?: { phone?: string; email?: string };
    };
  };
}

interface ConfirmParams {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  payment?: {
    type?: string;
    status?: string;
    params?: {
      transaction_id?: string;
      amount?: string;
      currency?: string;
    };
  };
}

interface StatusParams {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
}

interface SupportParams {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  order_id?: string;
  support?: {
    ref_id?: string;
    callback_phone?: string;
    phone?: string;
    email?: string;
  };
}

interface CancelParams {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  order_id?: string;
  reason?: { id?: string; descriptor?: { name?: string; short_desc?: string } };
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("auth_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
}

async function bapFetch(endpoint: string, body: unknown) {
  const res = await fetch(`${BAP_URL}/api${endpoint}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return res.json();
}

async function bapGet(endpoint: string) {
  const res = await fetch(`${BAP_URL}/api${endpoint}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
  return res.json();
}

export async function searchProducts(params: SearchParams) {
  return bapFetch("/search", {
    domain: params.domain || "ONDC:RET10",
    city: params.city || "std:011",
    query: params.query,
    item: params.query ? { descriptor: { name: params.query } } : params.item,
    provider: params.provider,
  });
}

export async function selectItems(params: SelectParams) {
  return bapFetch("/select", params);
}

export async function initOrder(params: InitParams) {
  return bapFetch("/init", params);
}

export async function confirmOrder(params: ConfirmParams) {
  return bapFetch("/confirm", params);
}

export async function getOrderStatus(params: StatusParams) {
  return bapFetch("/status", params);
}

export async function getOrderByTxnId(txnId: string) {
  return bapGet(`/orders/${txnId}`);
}

export async function requestSupport(params: SupportParams) {
  return bapFetch("/support", params);
}

export async function cancelOrder(params: CancelParams) {
  return bapFetch("/cancel", params);
}
