import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Integration Guide — ONDC Network Platform',
  description:
    'Complete integration guide with Node.js and Python code examples for the ONDC Beckn protocol transaction lifecycle.',
};

export default function IntegrationPage() {
  return (
    <div className="doc-prose">
      <h1>Integration Guide</h1>

      <p className="text-lg text-gray-600">
        This guide provides full code examples for integrating with the ONDC
        Network Platform. We cover the complete transaction lifecycle in both
        Node.js and Python, plus the simplified BAP client API and webhook
        configuration.
      </p>

      {/* ── TABLE OF CONTENTS ──────────────────────────────── */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 my-6">
        <h3 className="text-sm font-semibold text-gray-900 mt-0 mb-3">On This Page</h3>
        <ul className="space-y-1 mb-0">
          <li><a href="#nodejs-full-flow">Node.js: Full Transaction Flow</a></li>
          <li><a href="#python-search">Python: Basic Search Flow</a></li>
          <li><a href="#simplified-bap-api">Using the Simplified BAP Client API</a></li>
          <li><a href="#webhook-setup">Webhook Setup</a></li>
        </ul>
      </div>

      {/* ── NODE.JS FULL FLOW ──────────────────────────────── */}
      <h2 id="nodejs-full-flow">Node.js: Full Transaction Flow</h2>

      <p>
        The following example walks through the complete{' '}
        <strong>search &rarr; select &rarr; init &rarr; confirm</strong> flow using
        Node.js. Each step sends a signed request and waits for the asynchronous
        callback.
      </p>

      <h3>Setup &amp; Utilities</h3>

      <div className="code-block">
        <code>
          <span className="text-gray-500">// utils/beckn.ts</span>{'\n'}
          import crypto from &apos;crypto&apos;;{'\n'}
          import {'{'} sign {'}'} from &apos;./signing&apos;;{'\n'}
          {'\n'}
          const GATEWAY_URL = process.env.GATEWAY_URL || &apos;https://gateway.ondc.dmj.one&apos;;{'\n'}
          const BAP_ID = process.env.SUBSCRIBER_ID;{'\n'}
          const BAP_URI = process.env.SUBSCRIBER_URL;{'\n'}
          {'\n'}
          export function buildContext(action: string, domain: string) {'{'}{'\n'}
          {'  '}return {'{'}{'\n'}
          {'    '}domain,{'\n'}
          {'    '}action,{'\n'}
          {'    '}bap_id: BAP_ID,{'\n'}
          {'    '}bap_uri: BAP_URI,{'\n'}
          {'    '}transaction_id: crypto.randomUUID(),{'\n'}
          {'    '}message_id: crypto.randomUUID(),{'\n'}
          {'    '}timestamp: new Date().toISOString(),{'\n'}
          {'    '}version: &apos;1.1.0&apos;,{'\n'}
          {'    '}ttl: &apos;PT30S&apos;,{'\n'}
          {'  '}{'}'};{'\n'}
          {'}'}{'\n'}
          {'\n'}
          export async function becknRequest(action: string, body: object) {'{'}{'\n'}
          {'  '}const serialized = JSON.stringify(body);{'\n'}
          {'  '}const authHeader = await sign(serialized);{'\n'}
          {'\n'}
          {'  '}const url = [&apos;search&apos;].includes(action){'\n'}
          {'    '}? `${'{'}{`GATEWAY_URL`}{'}'}/${'{'}{`action`}{'}'}`{'\n'}
          {'    '}: `${'{'}{`process.env.BPP_URI`}{'}'}/${'{'}{`action`}{'}'}`;{'\n'}
          {'\n'}
          {'  '}const res = await fetch(url, {'{'}{'\n'}
          {'    '}method: &apos;POST&apos;,{'\n'}
          {'    '}headers: {'{'}{'\n'}
          {'      '}&apos;Content-Type&apos;: &apos;application/json&apos;,{'\n'}
          {'      '}&apos;Authorization&apos;: authHeader,{'\n'}
          {'    '}{'}'},{'\n'}
          {'    '}body: serialized,{'\n'}
          {'  '}{'}'});{'\n'}
          {'\n'}
          {'  '}return res.json();{'\n'}
          {'}'}
        </code>
      </div>

      <h3>Step 1: Search</h3>

      <div className="code-block">
        <code>
          <span className="text-gray-500">// 1. Search for items across all BPPs</span>{'\n'}
          const searchPayload = {'{'}{'\n'}
          {'  '}context: buildContext(&apos;search&apos;, &apos;ONDC:NIC2004:52110&apos;),{'\n'}
          {'  '}message: {'{'}{'\n'}
          {'    '}intent: {'{'}{'\n'}
          {'      '}item: {'{'}{'\n'}
          {'        '}descriptor: {'{'} name: &apos;rice&apos; {'}'},{'\n'}
          {'      '}{'}'},{'\n'}
          {'      '}fulfillment: {'{'}{'\n'}
          {'        '}type: &apos;Delivery&apos;,{'\n'}
          {'        '}end: {'{'}{'\n'}
          {'          '}location: {'{'}{'\n'}
          {'            '}gps: &apos;28.6139,77.2090&apos;,{'\n'}
          {'            '}area_code: &apos;110001&apos;,{'\n'}
          {'          '}{'}'},{'\n'}
          {'        '}{'}'},{'\n'}
          {'      '}{'}'},{'\n'}
          {'    '}{'}'},{'\n'}
          {'  '}{'}'},{'\n'}
          {'}'};{'\n'}
          {'\n'}
          const ack = await becknRequest(&apos;search&apos;, searchPayload);{'\n'}
          console.log(&apos;Search ACK:&apos;, ack);{'\n'}
          <span className="text-gray-500">// Results arrive at your /on_search webhook</span>
        </code>
      </div>

      <h3>Step 2: Select</h3>

      <div className="code-block">
        <code>
          <span className="text-gray-500">// 2. Select specific items from a BPP&apos;s catalog</span>{'\n'}
          <span className="text-gray-500">// (Use data received from on_search callback)</span>{'\n'}
          const selectPayload = {'{'}{'\n'}
          {'  '}context: {'{'}{'\n'}
          {'    '}...buildContext(&apos;select&apos;, &apos;ONDC:NIC2004:52110&apos;),{'\n'}
          {'    '}bpp_id: onSearchData.context.bpp_id,{'\n'}
          {'    '}bpp_uri: onSearchData.context.bpp_uri,{'\n'}
          {'  '}{'}'},{'\n'}
          {'  '}message: {'{'}{'\n'}
          {'    '}order: {'{'}{'\n'}
          {'      '}provider: {'{'} id: &apos;provider-001&apos; {'}'},{'\n'}
          {'      '}items: [{'\n'}
          {'        '}{'{'} id: &apos;item-001&apos;, quantity: {'{'} selected: {'{'} count: 2 {'}'} {'}'} {'}'},{'\n'}
          {'      '}],{'\n'}
          {'      '}fulfillments: [{'{'} id: &apos;fulfillment-001&apos;, type: &apos;Delivery&apos; {'}'}],{'\n'}
          {'    '}{'}'},{'\n'}
          {'  '}{'}'},{'\n'}
          {'}'};{'\n'}
          {'\n'}
          await becknRequest(&apos;select&apos;, selectPayload);{'\n'}
          <span className="text-gray-500">// Quote arrives at your /on_select webhook</span>
        </code>
      </div>

      <h3>Step 3: Init</h3>

      <div className="code-block">
        <code>
          <span className="text-gray-500">// 3. Initialize order with billing and shipping</span>{'\n'}
          const initPayload = {'{'}{'\n'}
          {'  '}context: {'{'}{'\n'}
          {'    '}...buildContext(&apos;init&apos;, &apos;ONDC:NIC2004:52110&apos;),{'\n'}
          {'    '}bpp_id: onSelectData.context.bpp_id,{'\n'}
          {'    '}bpp_uri: onSelectData.context.bpp_uri,{'\n'}
          {'  '}{'}'},{'\n'}
          {'  '}message: {'{'}{'\n'}
          {'    '}order: {'{'}{'\n'}
          {'      '}provider: {'{'} id: &apos;provider-001&apos; {'}'},{'\n'}
          {'      '}items: [{'{'} id: &apos;item-001&apos;, quantity: {'{'} selected: {'{'} count: 2 {'}'} {'}'} {'}'}],{'\n'}
          {'      '}billing: {'{'}{'\n'}
          {'        '}name: &apos;John Doe&apos;,{'\n'}
          {'        '}phone: &apos;+91-9876543210&apos;,{'\n'}
          {'        '}email: &apos;john@example.com&apos;,{'\n'}
          {'        '}address: {'{'}{'\n'}
          {'          '}door: &apos;123&apos;,{'\n'}
          {'          '}building: &apos;Apt Complex&apos;,{'\n'}
          {'          '}street: &apos;Main Street&apos;,{'\n'}
          {'          '}city: &apos;New Delhi&apos;,{'\n'}
          {'          '}state: &apos;Delhi&apos;,{'\n'}
          {'          '}country: &apos;IND&apos;,{'\n'}
          {'          '}area_code: &apos;110001&apos;,{'\n'}
          {'        '}{'}'},{'\n'}
          {'      '}{'}'},{'\n'}
          {'      '}fulfillments: [{'{'}{'\n'}
          {'        '}id: &apos;fulfillment-001&apos;,{'\n'}
          {'        '}type: &apos;Delivery&apos;,{'\n'}
          {'        '}end: {'{'}{'\n'}
          {'          '}location: {'{'} gps: &apos;28.6139,77.2090&apos;, address: {'{'} area_code: &apos;110001&apos; {'}'} {'}'},{'\n'}
          {'          '}contact: {'{'} phone: &apos;+91-9876543210&apos; {'}'},{'\n'}
          {'        '}{'}'},{'\n'}
          {'      '}{'}'}],{'\n'}
          {'    '}{'}'},{'\n'}
          {'  '}{'}'},{'\n'}
          {'}'};{'\n'}
          {'\n'}
          await becknRequest(&apos;init&apos;, initPayload);{'\n'}
          <span className="text-gray-500">// Payment details arrive at your /on_init webhook</span>
        </code>
      </div>

      <h3>Step 4: Confirm</h3>

      <div className="code-block">
        <code>
          <span className="text-gray-500">// 4. Confirm the order</span>{'\n'}
          const confirmPayload = {'{'}{'\n'}
          {'  '}context: {'{'}{'\n'}
          {'    '}...buildContext(&apos;confirm&apos;, &apos;ONDC:NIC2004:52110&apos;),{'\n'}
          {'    '}bpp_id: onInitData.context.bpp_id,{'\n'}
          {'    '}bpp_uri: onInitData.context.bpp_uri,{'\n'}
          {'  '}{'}'},{'\n'}
          {'  '}message: {'{'}{'\n'}
          {'    '}order: {'{'}{'\n'}
          {'      '}...onInitData.message.order,{'\n'}
          {'      '}payment: {'{'}{'\n'}
          {'        '}params: {'{'}{'\n'}
          {'          '}amount: onInitData.message.order.quote.price.value,{'\n'}
          {'          '}currency: &apos;INR&apos;,{'\n'}
          {'        '}{'}'},{'\n'}
          {'        '}status: &apos;PAID&apos;,{'\n'}
          {'        '}type: &apos;ON-ORDER&apos;,{'\n'}
          {'      '}{'}'},{'\n'}
          {'    '}{'}'},{'\n'}
          {'  '}{'}'},{'\n'}
          {'}'};{'\n'}
          {'\n'}
          await becknRequest(&apos;confirm&apos;, confirmPayload);{'\n'}
          <span className="text-gray-500">// Order confirmation arrives at your /on_confirm webhook</span>
        </code>
      </div>

      {/* ── PYTHON SEARCH ──────────────────────────────────── */}
      <h2 id="python-search">Python: Basic Search Flow</h2>

      <p>
        Here is the equivalent search flow in Python using the{' '}
        <code className="code-inline">requests</code> library and{' '}
        <code className="code-inline">nacl</code> for Ed25519 signing.
      </p>

      <div className="code-block">
        <code>
          <span className="text-gray-500"># beckn_client.py</span>{'\n'}
          import json, uuid, hashlib{'\n'}
          from datetime import datetime{'\n'}
          import requests{'\n'}
          import nacl.signing{'\n'}
          import nacl.encoding{'\n'}
          import base64{'\n'}
          {'\n'}
          GATEWAY_URL = &quot;https://gateway.ondc.dmj.one&quot;{'\n'}
          BAP_ID = &quot;myapp.example.com&quot;{'\n'}
          BAP_URI = &quot;https://myapp.example.com/beckn&quot;{'\n'}
          SIGNING_PRIVATE_KEY = &quot;&lt;base64-ed25519-private-key&gt;&quot;{'\n'}
          UNIQUE_KEY_ID = &quot;key-001&quot;{'\n'}
          {'\n'}
          {'\n'}
          def build_auth_header(body: str) -&gt; str:{'\n'}
          {'    '}&quot;&quot;&quot;Build Beckn Authorization header with BLAKE-512 + Ed25519.&quot;&quot;&quot;{'\n'}
          {'    '}<span className="text-gray-500"># 1. Create BLAKE-512 digest of the body</span>{'\n'}
          {'    '}digest = hashlib.blake2b(body.encode(), digest_size=64).digest(){'\n'}
          {'    '}b64_digest = base64.b64encode(digest).decode(){'\n'}
          {'\n'}
          {'    '}<span className="text-gray-500"># 2. Build signing string</span>{'\n'}
          {'    '}created = int(datetime.now().timestamp()){'\n'}
          {'    '}expires = created + 30{'\n'}
          {'    '}signing_string = ({'\n'}
          {'        '}f&quot;(created): {'{'}created{'}'}\n&quot;{'\n'}
          {'        '}f&quot;(expires): {'{'}expires{'}'}\n&quot;{'\n'}
          {'        '}f&quot;digest: BLAKE-512={'{'}b64_digest{'}'}&quot;{'\n'}
          {'    '}){'\n'}
          {'\n'}
          {'    '}<span className="text-gray-500"># 3. Sign with Ed25519</span>{'\n'}
          {'    '}private_key_bytes = base64.b64decode(SIGNING_PRIVATE_KEY){'\n'}
          {'    '}signing_key = nacl.signing.SigningKey(private_key_bytes){'\n'}
          {'    '}signature = signing_key.sign(signing_string.encode()).signature{'\n'}
          {'    '}b64_signature = base64.b64encode(signature).decode(){'\n'}
          {'\n'}
          {'    '}<span className="text-gray-500"># 4. Build header</span>{'\n'}
          {'    '}return ({'\n'}
          {'        '}f&apos;Signature keyId=&quot;{'{'}BAP_ID{'}'}|{'{'}UNIQUE_KEY_ID{'}'}|ed25519&quot;,&apos;{'\n'}
          {'        '}f&apos;algorithm=&quot;ed25519&quot;,&apos;{'\n'}
          {'        '}f&apos;created=&quot;{'{'}created{'}'}&quot;,&apos;{'\n'}
          {'        '}f&apos;expires=&quot;{'{'}expires{'}'}&quot;,&apos;{'\n'}
          {'        '}f&apos;headers=&quot;(created) (expires) digest&quot;,&apos;{'\n'}
          {'        '}f&apos;signature=&quot;{'{'}b64_signature{'}'}&quot;&apos;{'\n'}
          {'    '}){'\n'}
          {'\n'}
          {'\n'}
          def search(query: str, domain: str = &quot;ONDC:NIC2004:52110&quot;):{'\n'}
          {'    '}&quot;&quot;&quot;Search for items on the network.&quot;&quot;&quot;{'\n'}
          {'    '}payload = {'{'}{'\n'}
          {'        '}&quot;context&quot;: {'{'}{'\n'}
          {'            '}&quot;domain&quot;: domain,{'\n'}
          {'            '}&quot;action&quot;: &quot;search&quot;,{'\n'}
          {'            '}&quot;bap_id&quot;: BAP_ID,{'\n'}
          {'            '}&quot;bap_uri&quot;: BAP_URI,{'\n'}
          {'            '}&quot;transaction_id&quot;: str(uuid.uuid4()),{'\n'}
          {'            '}&quot;message_id&quot;: str(uuid.uuid4()),{'\n'}
          {'            '}&quot;timestamp&quot;: datetime.utcnow().isoformat() + &quot;Z&quot;,{'\n'}
          {'            '}&quot;version&quot;: &quot;1.1.0&quot;,{'\n'}
          {'            '}&quot;ttl&quot;: &quot;PT30S&quot;,{'\n'}
          {'        '}{'}'},{'\n'}
          {'        '}&quot;message&quot;: {'{'}{'\n'}
          {'            '}&quot;intent&quot;: {'{'}{'\n'}
          {'                '}&quot;item&quot;: {'{'} &quot;descriptor&quot;: {'{'} &quot;name&quot;: query {'}'} {'}'},{'\n'}
          {'                '}&quot;fulfillment&quot;: {'{'} &quot;type&quot;: &quot;Delivery&quot; {'}'},{'\n'}
          {'            '}{'}'},{'\n'}
          {'        '}{'}'},{'\n'}
          {'    '}{'}'}{'\n'}
          {'\n'}
          {'    '}body = json.dumps(payload){'\n'}
          {'    '}auth_header = build_auth_header(body){'\n'}
          {'\n'}
          {'    '}response = requests.post({'\n'}
          {'        '}f&quot;{'{'}GATEWAY_URL{'}'}/search&quot;,{'\n'}
          {'        '}data=body,{'\n'}
          {'        '}headers={'{'}{'\n'}
          {'            '}&quot;Content-Type&quot;: &quot;application/json&quot;,{'\n'}
          {'            '}&quot;Authorization&quot;: auth_header,{'\n'}
          {'        '}{'}'},{'\n'}
          {'    '}){'\n'}
          {'\n'}
          {'    '}return response.json(){'\n'}
          {'\n'}
          {'\n'}
          <span className="text-gray-500"># Usage</span>{'\n'}
          result = search(&quot;rice&quot;){'\n'}
          print(json.dumps(result, indent=2))
        </code>
      </div>

      {/* ── SIMPLIFIED BAP API ─────────────────────────────── */}
      <h2 id="simplified-bap-api">Using the Simplified BAP Client API</h2>

      <p>
        The built-in BAP service exposes a simplified REST API that handles
        signing, context building, and callback management for you. This is the
        easiest way to integrate.
      </p>

      <div className="code-block">
        <code>
          <span className="text-gray-500"># The BAP exposes these simplified endpoints:</span>{'\n'}
          {'\n'}
          <span className="text-cyan-400">POST /api/search</span>    &mdash; Initiate a search{'\n'}
          <span className="text-cyan-400">POST /api/select</span>    &mdash; Select items from a BPP{'\n'}
          <span className="text-cyan-400">POST /api/init</span>      &mdash; Initialize an order{'\n'}
          <span className="text-cyan-400">POST /api/confirm</span>   &mdash; Confirm an order{'\n'}
          <span className="text-cyan-400">POST /api/status</span>    &mdash; Check order status{'\n'}
          <span className="text-cyan-400">POST /api/track</span>     &mdash; Track fulfillment{'\n'}
          <span className="text-cyan-400">POST /api/cancel</span>    &mdash; Cancel an order
        </code>
      </div>

      <h3>Example: Simplified Search</h3>

      <div className="code-block">
        <code>
          <span className="text-gray-500">// No signing needed — the BAP handles it</span>{'\n'}
          const response = await fetch(&apos;http://localhost:3003/api/search&apos;, {'{'}{'\n'}
          {'  '}method: &apos;POST&apos;,{'\n'}
          {'  '}headers: {'{'} &apos;Content-Type&apos;: &apos;application/json&apos; {'}'},{'\n'}
          {'  '}body: JSON.stringify({'{'}{'\n'}
          {'    '}query: &apos;rice&apos;,{'\n'}
          {'    '}domain: &apos;ONDC:NIC2004:52110&apos;,{'\n'}
          {'    '}fulfillment_type: &apos;Delivery&apos;,{'\n'}
          {'    '}location: {'{'}{'\n'}
          {'      '}gps: &apos;28.6139,77.2090&apos;,{'\n'}
          {'      '}area_code: &apos;110001&apos;,{'\n'}
          {'    '}{'}'},{'\n'}
          {'  '}{'}'})
          {'\n'}{'}'});{'\n'}
          {'\n'}
          const {'{'} transaction_id {'}'} = await response.json();{'\n'}
          <span className="text-gray-500">// Poll for results or listen on webhooks</span>
        </code>
      </div>

      {/* ── WEBHOOK SETUP ──────────────────────────────────── */}
      <h2 id="webhook-setup">Webhook Setup</h2>

      <p>
        All Beckn responses are asynchronous. When a BPP responds to your request,
        the response is delivered to your callback URL. Here is how to set up
        webhook handlers for all callback actions.
      </p>

      <div className="code-block">
        <code>
          <span className="text-gray-500">// Express.js webhook handlers</span>{'\n'}
          import express from &apos;express&apos;;{'\n'}
          import {'{'} verifySignature {'}'} from &apos;./signing&apos;;{'\n'}
          {'\n'}
          const app = express();{'\n'}
          app.use(express.json());{'\n'}
          {'\n'}
          <span className="text-gray-500">// Middleware: verify request signatures</span>{'\n'}
          app.use(&apos;/beckn/*&apos;, async (req, res, next) =&gt; {'{'}{'\n'}
          {'  '}const authHeader = req.headers[&apos;authorization&apos;];{'\n'}
          {'  '}const body = JSON.stringify(req.body);{'\n'}
          {'\n'}
          {'  '}const isValid = await verifySignature(authHeader, body);{'\n'}
          {'  '}if (!isValid) {'{'}{'\n'}
          {'    '}return res.status(401).json({'{'} error: &apos;Invalid signature&apos; {'}'});{'\n'}
          {'  '}{'}'}{'\n'}
          {'  '}next();{'\n'}
          {'}'});{'\n'}
          {'\n'}
          <span className="text-gray-500">// Callback handlers</span>{'\n'}
          app.post(&apos;/beckn/on_search&apos;, (req, res) =&gt; {'{'}{'\n'}
          {'  '}console.log(&apos;Search results:&apos;, req.body.message.catalog);{'\n'}
          {'  '}<span className="text-gray-500">// Store results, notify user, etc.</span>{'\n'}
          {'  '}res.json({'{'} message: {'{'} ack: {'{'} status: &apos;ACK&apos; {'}'} {'}'} {'}'});{'\n'}
          {'}'});{'\n'}
          {'\n'}
          app.post(&apos;/beckn/on_select&apos;, (req, res) =&gt; {'{'}{'\n'}
          {'  '}console.log(&apos;Quote:&apos;, req.body.message.order.quote);{'\n'}
          {'  '}res.json({'{'} message: {'{'} ack: {'{'} status: &apos;ACK&apos; {'}'} {'}'} {'}'});{'\n'}
          {'}'});{'\n'}
          {'\n'}
          app.post(&apos;/beckn/on_init&apos;, (req, res) =&gt; {'{'}{'\n'}
          {'  '}console.log(&apos;Payment details:&apos;, req.body.message.order.payment);{'\n'}
          {'  '}res.json({'{'} message: {'{'} ack: {'{'} status: &apos;ACK&apos; {'}'} {'}'} {'}'});{'\n'}
          {'}'});{'\n'}
          {'\n'}
          app.post(&apos;/beckn/on_confirm&apos;, (req, res) =&gt; {'{'}{'\n'}
          {'  '}console.log(&apos;Order confirmed:&apos;, req.body.message.order.id);{'\n'}
          {'  '}res.json({'{'} message: {'{'} ack: {'{'} status: &apos;ACK&apos; {'}'} {'}'} {'}'});{'\n'}
          {'}'});{'\n'}
          {'\n'}
          app.post(&apos;/beckn/on_status&apos;, (req, res) =&gt; {'{'}{'\n'}
          {'  '}console.log(&apos;Order status:&apos;, req.body.message.order.state);{'\n'}
          {'  '}res.json({'{'} message: {'{'} ack: {'{'} status: &apos;ACK&apos; {'}'} {'}'} {'}'});{'\n'}
          {'}'});{'\n'}
          {'\n'}
          app.post(&apos;/beckn/on_track&apos;, (req, res) =&gt; {'{'}{'\n'}
          {'  '}console.log(&apos;Tracking:&apos;, req.body.message.tracking);{'\n'}
          {'  '}res.json({'{'} message: {'{'} ack: {'{'} status: &apos;ACK&apos; {'}'} {'}'} {'}'});{'\n'}
          {'}'});{'\n'}
          {'\n'}
          app.post(&apos;/beckn/on_cancel&apos;, (req, res) =&gt; {'{'}{'\n'}
          {'  '}console.log(&apos;Cancellation:&apos;, req.body.message.order);{'\n'}
          {'  '}res.json({'{'} message: {'{'} ack: {'{'} status: &apos;ACK&apos; {'}'} {'}'} {'}'});{'\n'}
          {'}'});{'\n'}
          {'\n'}
          app.listen(8080, () =&gt; console.log(&apos;Webhook server on :8080&apos;));
        </code>
      </div>

      <div className="callout-info flex gap-3 items-start mt-4">
        <svg className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <div>
          <p className="text-sm text-blue-800 font-semibold mb-1">Always verify signatures</p>
          <p className="text-sm text-blue-700 mb-0">
            Every incoming callback should be verified against the sender&apos;s
            public key (fetched from the registry). See the{' '}
            <a href="/docs/signing" className="font-semibold underline">
              Signing Tutorial
            </a>{' '}
            for details.
          </p>
        </div>
      </div>

      {/* ── Next Steps ─────────────────────────────────────── */}
      <h2>Next Steps</h2>
      <ul>
        <li>
          <a href="/docs/signing">Signing Tutorial</a> &mdash; Understand the
          cryptographic signing process in detail
        </li>
        <li>
          <a href="/docs/api">API Reference</a> &mdash; Complete endpoint
          documentation for all services
        </li>
        <li>
          <a href="/docs/domains">Domains</a> &mdash; Available domain codes and
          their catalog schemas
        </li>
      </ul>
    </div>
  );
}
