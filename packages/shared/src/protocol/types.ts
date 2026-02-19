// ---------------------------------------------------------------------------
// Beckn Action Enums
// ---------------------------------------------------------------------------

export enum BecknAction {
  search = "search",
  select = "select",
  init = "init",
  confirm = "confirm",
  status = "status",
  track = "track",
  cancel = "cancel",
  update = "update",
  rating = "rating",
  support = "support",
}

export enum BecknCallbackAction {
  on_search = "on_search",
  on_select = "on_select",
  on_init = "on_init",
  on_confirm = "on_confirm",
  on_status = "on_status",
  on_track = "on_track",
  on_cancel = "on_cancel",
  on_update = "on_update",
  on_rating = "on_rating",
  on_support = "on_support",
}

// ---------------------------------------------------------------------------
// Subscriber Enums
// ---------------------------------------------------------------------------

export enum SubscriberType {
  BAP = "BAP",
  BPP = "BPP",
  BG = "BG",
}

export enum SubscriberStatus {
  INITIATED = "INITIATED",
  UNDER_SUBSCRIPTION = "UNDER_SUBSCRIPTION",
  SUBSCRIBED = "SUBSCRIBED",
  SUSPENDED = "SUSPENDED",
  REVOKED = "REVOKED",
}

// ---------------------------------------------------------------------------
// Core protocol types
// ---------------------------------------------------------------------------

export interface Descriptor {
  name?: string;
  code?: string;
  symbol?: string;
  short_desc?: string;
  long_desc?: string;
  images?: string[];
  audio?: string;
  "3d_render"?: string;
}

export interface Tag {
  code?: string;
  name?: string;
  value?: string;
  display?: boolean;
  list?: Array<{ code?: string; name?: string; value?: string }>;
}

export interface Location {
  id?: string;
  descriptor?: Descriptor;
  gps?: string;
  address?: {
    door?: string;
    name?: string;
    building?: string;
    street?: string;
    locality?: string;
    ward?: string;
    city?: string;
    state?: string;
    country?: string;
    area_code?: string;
  };
  station_code?: string;
  city?: { name?: string; code?: string };
  country?: { name?: string; code?: string };
  circle?: { gps?: string; radius?: { type?: string; value?: string } };
  polygon?: string;
  "3dspace"?: string;
  time?: {
    label?: string;
    timestamp?: string;
    duration?: string;
    range?: { start?: string; end?: string };
    days?: string;
    schedule?: { frequency?: string; holidays?: string[]; times?: string[] };
  };
}

export interface Category {
  id?: string;
  parent_category_id?: string;
  descriptor?: Descriptor;
  time?: {
    label?: string;
    timestamp?: string;
    duration?: string;
    range?: { start?: string; end?: string };
    days?: string;
  };
  tags?: Tag[];
}

export interface Fulfillment {
  id?: string;
  type?: string;
  provider_id?: string;
  rating?: number;
  state?: { descriptor?: Descriptor; updated_at?: string; updated_by?: string };
  tracking?: boolean;
  customer?: {
    person?: { name?: string };
    contact?: { phone?: string; email?: string };
  };
  agent?: {
    name?: string;
    rateable?: boolean;
    tags?: Tag[];
    phone?: string;
  };
  vehicle?: {
    category?: string;
    capacity?: number;
    make?: string;
    model?: string;
    color?: string;
    energy_type?: string;
    registration?: string;
  };
  start?: {
    location?: Location;
    time?: {
      label?: string;
      timestamp?: string;
      duration?: string;
      range?: { start?: string; end?: string };
    };
    instructions?: Descriptor;
    contact?: { phone?: string; email?: string };
    person?: { name?: string };
    authorization?: {
      type?: string;
      token?: string;
      valid_from?: string;
      valid_to?: string;
      status?: string;
    };
  };
  end?: {
    location?: Location;
    time?: {
      label?: string;
      timestamp?: string;
      duration?: string;
      range?: { start?: string; end?: string };
    };
    instructions?: Descriptor;
    contact?: { phone?: string; email?: string };
    person?: { name?: string };
    authorization?: {
      type?: string;
      token?: string;
      valid_from?: string;
      valid_to?: string;
      status?: string;
    };
  };
  rateable?: boolean;
  tags?: Tag[];
}

export interface Item {
  id?: string;
  parent_item_id?: string;
  descriptor?: Descriptor;
  price?: {
    currency?: string;
    value?: string;
    estimated_value?: string;
    computed_value?: string;
    listed_value?: string;
    offered_value?: string;
    minimum_value?: string;
    maximum_value?: string;
  };
  category_id?: string;
  fulfillment_id?: string;
  rating?: number;
  location_id?: string;
  time?: {
    label?: string;
    timestamp?: string;
    duration?: string;
    range?: { start?: string; end?: string };
  };
  rateable?: boolean;
  matched?: boolean;
  related?: boolean;
  recommended?: boolean;
  quantity?: {
    available?: { count?: number };
    maximum?: { count?: number };
    minimum?: { count?: number };
    selected?: { count?: number };
  };
  tags?: Tag[];
}

export interface Provider {
  id?: string;
  descriptor?: Descriptor;
  category_id?: string;
  rating?: number;
  time?: {
    label?: string;
    timestamp?: string;
    duration?: string;
    range?: { start?: string; end?: string };
    days?: string;
    schedule?: { frequency?: string; holidays?: string[]; times?: string[] };
  };
  categories?: Category[];
  fulfillments?: Fulfillment[];
  payments?: Payment[];
  locations?: Location[];
  offers?: Array<{
    id?: string;
    descriptor?: Descriptor;
    location_ids?: string[];
    category_ids?: string[];
    item_ids?: string[];
    time?: {
      label?: string;
      timestamp?: string;
      duration?: string;
      range?: { start?: string; end?: string };
    };
    tags?: Tag[];
  }>;
  items?: Item[];
  exp?: string;
  rateable?: boolean;
  tags?: Tag[];
}

export interface Catalog {
  "bpp/descriptor"?: Descriptor;
  "bpp/categories"?: Category[];
  "bpp/fulfillments"?: Fulfillment[];
  "bpp/payments"?: Payment[];
  "bpp/offers"?: Array<{
    id?: string;
    descriptor?: Descriptor;
    location_ids?: string[];
    category_ids?: string[];
    item_ids?: string[];
    time?: {
      label?: string;
      timestamp?: string;
      duration?: string;
      range?: { start?: string; end?: string };
    };
    tags?: Tag[];
  }>;
  "bpp/providers"?: Provider[];
  exp?: string;
}

export interface SearchIntent {
  descriptor?: Descriptor;
  provider?: {
    id?: string;
    descriptor?: Descriptor;
    category_id?: string;
    locations?: Location[];
  };
  fulfillment?: {
    id?: string;
    type?: string;
    start?: { location?: Location; time?: { timestamp?: string } };
    end?: { location?: Location; time?: { timestamp?: string } };
  };
  payment?: Payment;
  category?: Category;
  item?: {
    id?: string;
    descriptor?: Descriptor;
    price?: { currency?: string; value?: string; minimum_value?: string; maximum_value?: string };
    category_id?: string;
  };
  tags?: Tag[];
}

export interface Billing {
  name?: string;
  organization?: { name?: string; cred?: string };
  address?: {
    door?: string;
    name?: string;
    building?: string;
    street?: string;
    locality?: string;
    ward?: string;
    city?: string;
    state?: string;
    country?: string;
    area_code?: string;
  };
  email?: string;
  phone?: string;
  time?: {
    label?: string;
    timestamp?: string;
    duration?: string;
    range?: { start?: string; end?: string };
  };
  tax_number?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Payment {
  uri?: string;
  tl_method?: string;
  params?: {
    transaction_id?: string;
    transaction_status?: string;
    amount?: string;
    currency?: string;
    [key: string]: string | undefined;
  };
  type?: string;
  status?: string;
  time?: {
    label?: string;
    timestamp?: string;
    duration?: string;
    range?: { start?: string; end?: string };
  };
  collected_by?: string;
  tags?: Tag[];
  "@ondc/org/buyer_app_finder_fee_type"?: string;
  "@ondc/org/buyer_app_finder_fee_amount"?: string;
  "@ondc/org/settlement_details"?: Array<{
    settlement_counterparty?: string;
    settlement_phase?: string;
    settlement_type?: string;
    settlement_bank_account_no?: string;
    settlement_ifsc_code?: string;
    upi_address?: string;
    bank_name?: string;
    branch_name?: string;
    beneficiary_name?: string;
    beneficiary_address?: string;
    settlement_status?: string;
    settlement_reference?: string;
    settlement_timestamp?: string;
  }>;
}

export interface Quote {
  price?: {
    currency?: string;
    value?: string;
    estimated_value?: string;
    computed_value?: string;
    listed_value?: string;
    offered_value?: string;
    minimum_value?: string;
    maximum_value?: string;
  };
  breakup?: Array<{
    title?: string;
    price?: { currency?: string; value?: string };
    "@ondc/org/item_id"?: string;
    "@ondc/org/item_quantity"?: { count?: number };
    "@ondc/org/title_type"?: string;
    item?: { id?: string; price?: { currency?: string; value?: string }; quantity?: { available?: { count?: number }; maximum?: { count?: number } } };
  }>;
  ttl?: string;
}

export interface Order {
  id?: string;
  state?: string;
  provider?: { id?: string; locations?: Array<{ id?: string }> };
  items?: Array<{
    id?: string;
    quantity?: { count?: number };
    fulfillment_id?: string;
  }>;
  billing?: Billing;
  fulfillments?: Fulfillment[];
  quote?: Quote;
  payment?: Payment;
  created_at?: string;
  updated_at?: string;
  tags?: Tag[];
}

// ---------------------------------------------------------------------------
// Beckn Context (supports both v1.1 flat fields and v1.2 nested location)
// ---------------------------------------------------------------------------

export interface BecknContextLocation {
  country?: { code?: string };
  city?: { code?: string };
}

export interface BecknContext {
  domain: string;
  /** @deprecated Use location.country.code in Beckn v1.2+ */
  country: string;
  /** @deprecated Use location.city.code in Beckn v1.2+ */
  city: string;
  /** Beckn v1.2 nested location object */
  location?: BecknContextLocation;
  action: BecknAction | BecknCallbackAction | string;
  /** Beckn v1.1 version field */
  core_version: string;
  /** Beckn v1.2 version field */
  version?: string;
  bap_id: string;
  bap_uri: string;
  bpp_id?: string;
  bpp_uri?: string;
  transaction_id: string;
  message_id: string;
  timestamp: string;
  key?: string;
  /** TTL for the request (ISO 8601 duration, e.g. "PT30S") */
  ttl?: string;
  /** Max number of callbacks expected for this message */
  max_callbacks?: number;
}

// ---------------------------------------------------------------------------
// Beckn Message & Request
// ---------------------------------------------------------------------------

export interface BecknMessage {
  intent?: SearchIntent;
  order?: Order;
  catalog?: Catalog;
  [key: string]: unknown;
}

export interface BecknRequest {
  context: BecknContext;
  message: BecknMessage;
}

// ---------------------------------------------------------------------------
// Beckn Ack / Nack
// ---------------------------------------------------------------------------

export interface BecknAck {
  message: {
    ack: {
      status: "ACK";
    };
  };
}

export interface BecknNack {
  message: {
    ack: {
      status: "NACK";
    };
  };
  error?: {
    type: string;
    code: string;
    message: string;
  };
}
