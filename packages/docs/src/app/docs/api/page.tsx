import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Reference — ONDC Network Platform',
  description:
    'Complete API reference for all ONDC Network Platform services: Registry, Gateway, BAP, and BPP endpoints.',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Endpoint({
  method,
  path,
  service,
  description,
  requestExample,
  responseExample,
}: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  service: string;
  description: string;
  requestExample?: string;
  responseExample?: string;
}) {
  const methodColors: Record<string, string> = {
    GET: 'bg-green-100 text-green-800 border-green-200',
    POST: 'bg-blue-100 text-blue-800 border-blue-200',
    PUT: 'bg-amber-100 text-amber-800 border-amber-200',
    DELETE: 'bg-red-100 text-red-800 border-red-200',
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
      <div className="bg-gray-50 px-5 py-3 flex items-center gap-3 border-b border-gray-200">
        <span
          className={`px-2.5 py-0.5 text-xs font-bold rounded-md border ${methodColors[method]}`}
        >
          {method}
        </span>
        <code className="text-sm font-semibold text-gray-900">{path}</code>
        <span className="text-xs text-gray-500 ml-auto">{service}</span>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-gray-700 mb-0">{description}</p>
        {requestExample && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Request Body
            </p>
            <div className="code-block text-xs">
              <code>{requestExample}</code>
            </div>
          </div>
        )}
        {responseExample && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Response
            </p>
            <div className="code-block text-xs">
              <code>{responseExample}</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ApiReferencePage() {
  return (
    <div className="doc-prose">
      <h1>API Reference</h1>

      <p className="text-lg text-gray-600">
        Complete endpoint documentation for all ONDC Network Platform services.
        All Beckn protocol endpoints require a signed{' '}
        <code className="code-inline">Authorization</code> header (see the{' '}
        <a href="/docs/signing">Signing Tutorial</a>).
      </p>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 my-6">
        <h3 className="text-sm font-semibold text-gray-900 mt-0 mb-3">Services</h3>
        <ul className="space-y-1 mb-0">
          <li><a href="#registry">Registry</a> — <code className="code-inline">:3001</code></li>
          <li><a href="#gateway">Gateway</a> — <code className="code-inline">:3002</code></li>
          <li><a href="#bap">BAP (Buyer Application Platform)</a> — <code className="code-inline">:3003</code></li>
          <li><a href="#bpp">BPP (Seller Application Platform)</a> — <code className="code-inline">:3004</code></li>
        </ul>
      </div>

      {/* ════════════════════════════════════════════════════════
          REGISTRY
          ════════════════════════════════════════════════════════ */}
      <h2 id="registry">Registry</h2>
      <p>
        The Registry manages subscriber registrations and provides key lookup
        services. It runs on port <code className="code-inline">3001</code>.
      </p>

      <Endpoint
        method="POST"
        path="/subscribe"
        service="Registry"
        description="Register a new subscriber (BAP, BPP, BG) with the network. The registry initiates a challenge to verify the subscriber's callback URL."
        requestExample={`{
  "subscriber_id": "myapp.example.com",
  "subscriber_url": "https://myapp.example.com/beckn",
  "type": "BAP",
  "domain": "ONDC:NIC2004:49299",
  "city": "std:011",
  "signing_public_key": "MCowBQYDK2VwAyEA...",
  "encr_public_key": "MCowBQYDK2VuAyEA...",
  "unique_key_id": "key-001"
}`}
        responseExample={`{
  "subscriber_id": "myapp.example.com",
  "status": "INITIATED",
  "challenge": "eyJhbGciOiJFZERTQSIs..."
}`}
      />

      <Endpoint
        method="POST"
        path="/on_subscribe"
        service="Registry"
        description="Callback endpoint the registry uses to send the encrypted challenge. The subscriber must decrypt and return the answer."
        requestExample={`{
  "subscriber_id": "myapp.example.com",
  "challenge": "<encrypted-challenge-string>"
}`}
        responseExample={`{
  "answer": "<decrypted-challenge-string>"
}`}
      />

      <Endpoint
        method="POST"
        path="/lookup"
        service="Registry"
        description="Look up a subscriber's public keys and details by subscriber_id. Used for signature verification."
        requestExample={`{
  "subscriber_id": "myapp.example.com",
  "unique_key_id": "key-001",
  "type": "BAP"
}`}
        responseExample={`[
  {
    "subscriber_id": "myapp.example.com",
    "subscriber_url": "https://myapp.example.com/beckn",
    "type": "BAP",
    "domain": "ONDC:NIC2004:49299",
    "city": "std:011",
    "signing_public_key": "MCowBQYDK2VwAyEA...",
    "encr_public_key": "MCowBQYDK2VuAyEA...",
    "unique_key_id": "key-001",
    "status": "SUBSCRIBED",
    "valid_from": "2024-01-01T00:00:00.000Z",
    "valid_until": "2025-01-01T00:00:00.000Z"
  }
]`}
      />

      {/* ════════════════════════════════════════════════════════
          GATEWAY
          ════════════════════════════════════════════════════════ */}
      <h2 id="gateway">Gateway</h2>
      <p>
        The Gateway routes search requests from BAPs to matching BPPs based on
        domain, city, and catalog. It runs on port{' '}
        <code className="code-inline">3002</code>.
      </p>

      <Endpoint
        method="POST"
        path="/search"
        service="Gateway"
        description="Broadcast a search intent to all matching BPPs in the network. The gateway returns an ACK immediately and delivers results asynchronously via the BAP's /on_search callback."
        requestExample={`{
  "context": {
    "domain": "ONDC:NIC2004:52110",
    "action": "search",
    "bap_id": "myapp.example.com",
    "bap_uri": "https://myapp.example.com/beckn",
    "transaction_id": "txn-uuid",
    "message_id": "msg-uuid",
    "timestamp": "2024-02-01T10:00:00.000Z",
    "version": "1.1.0",
    "ttl": "PT30S"
  },
  "message": {
    "intent": {
      "item": { "descriptor": { "name": "rice" } },
      "fulfillment": {
        "type": "Delivery",
        "end": {
          "location": { "gps": "28.6139,77.2090" }
        }
      }
    }
  }
}`}
        responseExample={`{
  "message": {
    "ack": { "status": "ACK" }
  }
}`}
      />

      <Endpoint
        method="POST"
        path="/on_search"
        service="Gateway"
        description="Receives search results from BPPs and forwards them to the originating BAP's callback URL. This is an internal endpoint used by BPPs, not called directly by BAPs."
        requestExample={`{
  "context": {
    "domain": "ONDC:NIC2004:52110",
    "action": "on_search",
    "bpp_id": "seller.example.com",
    "bpp_uri": "https://seller.example.com/beckn",
    "bap_id": "myapp.example.com",
    "bap_uri": "https://myapp.example.com/beckn",
    "transaction_id": "txn-uuid",
    "message_id": "msg-uuid",
    "timestamp": "2024-02-01T10:00:01.000Z"
  },
  "message": {
    "catalog": {
      "providers": [
        {
          "id": "provider-001",
          "descriptor": { "name": "Rice Store" },
          "items": [
            {
              "id": "item-001",
              "descriptor": { "name": "Basmati Rice 5kg" },
              "price": { "currency": "INR", "value": "450.00" }
            }
          ]
        }
      ]
    }
  }
}`}
        responseExample={`{
  "message": {
    "ack": { "status": "ACK" }
  }
}`}
      />

      {/* ════════════════════════════════════════════════════════
          BAP
          ════════════════════════════════════════════════════════ */}
      <h2 id="bap">BAP (Buyer Application Platform)</h2>
      <p>
        The BAP service provides a simplified client API that handles signing
        and context management. It runs on port{' '}
        <code className="code-inline">3003</code>.
      </p>

      <h3>Simplified Client API</h3>
      <p>
        These endpoints accept simplified request bodies and handle Beckn protocol
        details internally.
      </p>

      <Endpoint
        method="POST"
        path="/api/search"
        service="BAP"
        description="Initiate a search across the network. The BAP builds the full Beckn context, signs the request, and sends it through the gateway."
        requestExample={`{
  "query": "rice",
  "domain": "ONDC:NIC2004:52110",
  "fulfillment_type": "Delivery",
  "location": {
    "gps": "28.6139,77.2090",
    "area_code": "110001"
  }
}`}
        responseExample={`{
  "transaction_id": "txn-uuid",
  "message_id": "msg-uuid",
  "status": "ACK"
}`}
      />

      <Endpoint
        method="POST"
        path="/api/select"
        service="BAP"
        description="Select specific items from a BPP's catalog. Requires the BPP ID and provider/item details from a previous search result."
        requestExample={`{
  "transaction_id": "txn-uuid",
  "bpp_id": "seller.example.com",
  "bpp_uri": "https://seller.example.com/beckn",
  "provider_id": "provider-001",
  "items": [
    { "id": "item-001", "quantity": 2 }
  ]
}`}
        responseExample={`{
  "transaction_id": "txn-uuid",
  "message_id": "msg-uuid",
  "status": "ACK"
}`}
      />

      <Endpoint
        method="POST"
        path="/api/init"
        service="BAP"
        description="Initialize an order with billing and shipping details. Called after receiving a quote from /on_select."
        requestExample={`{
  "transaction_id": "txn-uuid",
  "bpp_id": "seller.example.com",
  "bpp_uri": "https://seller.example.com/beckn",
  "provider_id": "provider-001",
  "items": [{ "id": "item-001", "quantity": 2 }],
  "billing": {
    "name": "John Doe",
    "phone": "+91-9876543210",
    "email": "john@example.com",
    "address": {
      "city": "New Delhi",
      "state": "Delhi",
      "area_code": "110001"
    }
  },
  "fulfillment": {
    "type": "Delivery",
    "gps": "28.6139,77.2090",
    "phone": "+91-9876543210"
  }
}`}
        responseExample={`{
  "transaction_id": "txn-uuid",
  "message_id": "msg-uuid",
  "status": "ACK"
}`}
      />

      <Endpoint
        method="POST"
        path="/api/confirm"
        service="BAP"
        description="Confirm and place the order. Triggers payment processing and order creation on the BPP side."
        requestExample={`{
  "transaction_id": "txn-uuid",
  "bpp_id": "seller.example.com",
  "bpp_uri": "https://seller.example.com/beckn",
  "payment": {
    "amount": "900.00",
    "currency": "INR",
    "type": "ON-ORDER",
    "status": "PAID"
  }
}`}
        responseExample={`{
  "transaction_id": "txn-uuid",
  "message_id": "msg-uuid",
  "status": "ACK"
}`}
      />

      <Endpoint
        method="POST"
        path="/api/status"
        service="BAP"
        description="Check the current status of an order. Results are delivered asynchronously to /on_status."
        requestExample={`{
  "transaction_id": "txn-uuid",
  "order_id": "order-uuid",
  "bpp_id": "seller.example.com",
  "bpp_uri": "https://seller.example.com/beckn"
}`}
        responseExample={`{
  "transaction_id": "txn-uuid",
  "message_id": "msg-uuid",
  "status": "ACK"
}`}
      />

      <Endpoint
        method="POST"
        path="/api/track"
        service="BAP"
        description="Request real-time tracking information for a fulfillment. Returns tracking URL or coordinates via /on_track callback."
        requestExample={`{
  "transaction_id": "txn-uuid",
  "order_id": "order-uuid",
  "bpp_id": "seller.example.com",
  "bpp_uri": "https://seller.example.com/beckn"
}`}
        responseExample={`{
  "transaction_id": "txn-uuid",
  "message_id": "msg-uuid",
  "status": "ACK"
}`}
      />

      <Endpoint
        method="POST"
        path="/api/cancel"
        service="BAP"
        description="Cancel an existing order. Requires a cancellation reason code. Results delivered via /on_cancel callback."
        requestExample={`{
  "transaction_id": "txn-uuid",
  "order_id": "order-uuid",
  "bpp_id": "seller.example.com",
  "bpp_uri": "https://seller.example.com/beckn",
  "cancellation_reason_id": "001"
}`}
        responseExample={`{
  "transaction_id": "txn-uuid",
  "message_id": "msg-uuid",
  "status": "ACK"
}`}
      />

      {/* ════════════════════════════════════════════════════════
          BPP
          ════════════════════════════════════════════════════════ */}
      <h2 id="bpp">BPP (Seller Application Platform)</h2>
      <p>
        The BPP service handles seller-side operations including catalog
        management and order fulfillment. It runs on port{' '}
        <code className="code-inline">3004</code>.
      </p>

      <Endpoint
        method="GET"
        path="/api/catalog"
        service="BPP"
        description="Retrieve the full product catalog for this BPP. Returns all providers and their items grouped by domain."
        responseExample={`{
  "providers": [
    {
      "id": "provider-001",
      "descriptor": { "name": "Fresh Foods Store" },
      "domain": "ONDC:NIC2004:52110",
      "items": [
        {
          "id": "item-001",
          "descriptor": {
            "name": "Basmati Rice 5kg",
            "short_desc": "Premium aged basmati rice"
          },
          "price": { "currency": "INR", "value": "450.00" },
          "quantity": { "available": { "count": 100 } }
        }
      ]
    }
  ]
}`}
      />

      <Endpoint
        method="GET"
        path="/api/orders"
        service="BPP"
        description="List all orders received by this BPP. Supports optional query parameters for filtering by status, date range, and domain."
        responseExample={`{
  "orders": [
    {
      "id": "order-uuid",
      "state": "Accepted",
      "provider": { "id": "provider-001" },
      "items": [{ "id": "item-001", "quantity": { "count": 2 } }],
      "billing": { "name": "John Doe" },
      "quote": {
        "price": { "currency": "INR", "value": "900.00" }
      },
      "created_at": "2024-02-01T10:05:00.000Z",
      "updated_at": "2024-02-01T10:05:30.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}`}
      />

      <Endpoint
        method="POST"
        path="/api/fulfill/:order_id"
        service="BPP"
        description="Mark an order as fulfilled. Updates the order state and triggers an on_status callback to the originating BAP."
        requestExample={`{
  "fulfillment_id": "fulfillment-001",
  "state": "Order-delivered",
  "tracking": {
    "url": "https://track.example.com/order-uuid",
    "status": "active"
  },
  "agent": {
    "name": "Delivery Partner",
    "phone": "+91-9876543210"
  }
}`}
        responseExample={`{
  "order_id": "order-uuid",
  "state": "Order-delivered",
  "updated_at": "2024-02-01T14:30:00.000Z"
}`}
      />

      {/* ── Auth info ──────────────────────────────────────── */}
      <h2>Authentication</h2>

      <p>
        All Beckn protocol endpoints (Gateway, BAP callbacks, BPP callbacks)
        require a signed <code className="code-inline">Authorization</code>{' '}
        header. The simplified BAP client endpoints (
        <code className="code-inline">/api/*</code>) handle signing internally
        and do not require external authentication.
      </p>

      <p>
        See the <a href="/docs/signing">Signing Tutorial</a> for complete
        details on building the Authorization header.
      </p>

      {/* ── Error Codes ────────────────────────────────────── */}
      <h2>Error Codes</h2>

      <table>
        <thead>
          <tr>
            <th>HTTP Status</th>
            <th>Error</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code className="code-inline">200</code></td>
            <td>ACK / NACK</td>
            <td>Standard Beckn response with ACK or NACK in the body</td>
          </tr>
          <tr>
            <td><code className="code-inline">400</code></td>
            <td>Bad Request</td>
            <td>Invalid request body or missing required fields</td>
          </tr>
          <tr>
            <td><code className="code-inline">401</code></td>
            <td>Unauthorized</td>
            <td>Invalid or expired signature in Authorization header</td>
          </tr>
          <tr>
            <td><code className="code-inline">404</code></td>
            <td>Not Found</td>
            <td>Subscriber not found in registry lookup</td>
          </tr>
          <tr>
            <td><code className="code-inline">422</code></td>
            <td>Unprocessable</td>
            <td>Valid JSON but semantically incorrect Beckn payload</td>
          </tr>
          <tr>
            <td><code className="code-inline">500</code></td>
            <td>Internal Error</td>
            <td>Unexpected server error</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
