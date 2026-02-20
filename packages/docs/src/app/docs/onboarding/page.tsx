import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Getting Started — ONDC Network Platform',
  description:
    'Step-by-step guide to register with the ONDC Network Platform and make your first API call.',
};

export default function OnboardingPage() {
  return (
    <div className="doc-prose">
      <h1>Getting Started</h1>

      <p className="text-lg text-gray-600">
        This guide walks you through the complete onboarding process &mdash; from
        generating your cryptographic key pair to making your first API call on
        the network. You will be up and running in under 10 minutes.
      </p>

      <div className="callout-info flex gap-3 items-start">
        <svg className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <div>
          <p className="text-sm text-blue-800 font-semibold mb-1">Prerequisites</p>
          <p className="text-sm text-blue-700 mb-0">
            You need Node.js 22+ installed. The platform should already be running
            (via <code className="code-inline">sudo bash autoconfig.sh</code>).
          </p>
        </div>
      </div>

      {/* ── STEP 1 ─────────────────────────────────────────── */}
      <div className="mt-10 space-y-2">
        <div className="step-card">
          <div className="step-number">1</div>
          <h2 className="mt-0 pt-0 border-0 mb-3">Generate Your Key Pair</h2>
          <p>
            Every network participant needs an Ed25519 signing key pair and an
            X25519 encryption key pair. The included keygen script generates both
            and outputs them in the format required by the registry.
          </p>

          <div className="code-block">
            <code>
              <span className="text-gray-500"># Generate keys for your application</span>
              {'\n'}npx tsx scripts/src/keygen.ts \{'\n'}
              {'  '}--subscriber-id myapp.example.com \{'\n'}
              {'  '}--unique-key-id key-001
            </code>
          </div>

          <p className="mt-4">This outputs:</p>

          <div className="code-block">
            <code>
              <span className="text-green-400">Signing Key Pair</span>
              {'\n'}  Private Key : MC4CAQAwBQYDK2VwBCIEIL...{'\n'}
              {'  '}Public Key  : MCowBQYDK2VwAyEA...{'\n'}
              {'\n'}
              <span className="text-green-400">Encryption Key Pair</span>
              {'\n'}  Private Key : MC4CAQAwBQYDK2VuBCIEIJ...{'\n'}
              {'  '}Public Key  : MCowBQYDK2VuAyEA...{'\n'}
              {'\n'}
              <span className="text-green-400">Subscriber ID</span> : myapp.example.com{'\n'}
              <span className="text-green-400">Unique Key ID</span> : key-001
            </code>
          </div>

          <div className="callout-warning flex gap-3 items-start mt-4">
            <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm text-amber-800 font-semibold mb-1">Keep your private keys safe</p>
              <p className="text-sm text-amber-700 mb-0">
                Never share or commit your private keys. Store them in environment
                variables or a secrets manager.
              </p>
            </div>
          </div>
        </div>

        {/* ── STEP 2 ─────────────────────────────────────────── */}
        <div className="step-card">
          <div className="step-number">2</div>
          <h2 className="mt-0 pt-0 border-0 mb-3">Register with the Network</h2>
          <p>
            Submit a subscription request to the registry with your public keys
            and subscriber details. The registry will initiate a challenge to
            verify you control the subscriber URL.
          </p>

          <div className="code-block">
            <code>
              curl -X POST https://registry.ondc.dmj.one/subscribe \{'\n'}
              {'  '}-H &quot;Content-Type: application/json&quot; \{'\n'}
              {'  '}-d &apos;{'{'}{'\n'}
              {'    '}&quot;subscriber_id&quot;: &quot;myapp.example.com&quot;,{'\n'}
              {'    '}&quot;subscriber_url&quot;: &quot;https://myapp.example.com/beckn&quot;,{'\n'}
              {'    '}&quot;type&quot;: &quot;BAP&quot;,{'\n'}
              {'    '}&quot;domain&quot;: &quot;ONDC:NIC2004:49299&quot;,{'\n'}
              {'    '}&quot;city&quot;: &quot;std:011&quot;,{'\n'}
              {'    '}&quot;signing_public_key&quot;: &quot;&lt;your-signing-public-key&gt;&quot;,{'\n'}
              {'    '}&quot;encr_public_key&quot;: &quot;&lt;your-encr-public-key&gt;&quot;,{'\n'}
              {'    '}&quot;unique_key_id&quot;: &quot;key-001&quot;{'\n'}
              {'  '}{'}'}&apos;
            </code>
          </div>

          <p className="mt-4">
            <strong>Response:</strong>
          </p>

          <div className="code-block">
            <code>
              {'{'}{'\n'}
              {'  '}&quot;subscriber_id&quot;: &quot;myapp.example.com&quot;,{'\n'}
              {'  '}&quot;status&quot;: &quot;INITIATED&quot;,{'\n'}
              {'  '}&quot;challenge&quot;: &quot;eyJhbGciOiJFZERTQSIs...&quot;{'\n'}
              {'}'}
            </code>
          </div>

          <h3>Subscriber Fields</h3>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Description</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code className="code-inline">subscriber_id</code></td>
                <td>Your unique domain identifier</td>
                <td><code className="code-inline">myapp.example.com</code></td>
              </tr>
              <tr>
                <td><code className="code-inline">subscriber_url</code></td>
                <td>Your Beckn-compliant callback URL</td>
                <td><code className="code-inline">https://myapp.example.com/beckn</code></td>
              </tr>
              <tr>
                <td><code className="code-inline">type</code></td>
                <td>BAP, BPP, BG, or BREG</td>
                <td><code className="code-inline">BAP</code></td>
              </tr>
              <tr>
                <td><code className="code-inline">domain</code></td>
                <td>NIC2004 domain code</td>
                <td><code className="code-inline">ONDC:NIC2004:49299</code></td>
              </tr>
              <tr>
                <td><code className="code-inline">city</code></td>
                <td>STD code for the city</td>
                <td><code className="code-inline">std:011</code></td>
              </tr>
              <tr>
                <td><code className="code-inline">signing_public_key</code></td>
                <td>Base64 Ed25519 public key</td>
                <td><code className="code-inline">MCowBQYDK2Vw...</code></td>
              </tr>
              <tr>
                <td><code className="code-inline">encr_public_key</code></td>
                <td>Base64 X25519 public key</td>
                <td><code className="code-inline">MCowBQYDK2Vu...</code></td>
              </tr>
              <tr>
                <td><code className="code-inline">unique_key_id</code></td>
                <td>Your key identifier</td>
                <td><code className="code-inline">key-001</code></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── STEP 3 ─────────────────────────────────────────── */}
        <div className="step-card">
          <div className="step-number">3</div>
          <h2 className="mt-0 pt-0 border-0 mb-3">Complete the Challenge</h2>
          <p>
            The registry sends a challenge to your{' '}
            <code className="code-inline">subscriber_url</code> via a POST to{' '}
            <code className="code-inline">/on_subscribe</code>. Your application
            must:
          </p>

          <ol>
            <li>Receive the encrypted challenge at your callback endpoint</li>
            <li>Decrypt it using your encryption private key (X25519)</li>
            <li>Return the decrypted challenge string in the response</li>
          </ol>

          <div className="code-block">
            <code>
              <span className="text-gray-500">// Your /on_subscribe endpoint handler</span>
              {'\n'}app.post(&apos;/on_subscribe&apos;, async (req, res) =&gt; {'{'}{'\n'}
              {'  '}const {'{'} challenge {'}'} = req.body;{'\n'}
              {'\n'}
              {'  '}<span className="text-gray-500">// Decrypt the challenge using your encryption private key</span>{'\n'}
              {'  '}const decrypted = decryptChallenge(challenge, encrPrivateKey);{'\n'}
              {'\n'}
              {'  '}<span className="text-gray-500">// Return the decrypted answer</span>{'\n'}
              {'  '}res.json({'{'} answer: decrypted {'}'});{'\n'}
              {'}'});
            </code>
          </div>

          <p className="mt-4">
            Once the registry verifies your response, your subscriber status changes
            to <code className="code-inline">SUBSCRIBED</code>.
          </p>
        </div>

        {/* ── STEP 4 ─────────────────────────────────────────── */}
        <div className="step-card">
          <div className="step-number">4</div>
          <h2 className="mt-0 pt-0 border-0 mb-3">Set Environment Variables</h2>
          <p>
            Configure your application with the necessary environment variables.
            These are the same variables you would use with the government ONDC
            network &mdash; making migration seamless.
          </p>

          <div className="code-block">
            <code>
              <span className="text-gray-500"># Network endpoints</span>{'\n'}
              REGISTRY_URL=https://registry.ondc.dmj.one{'\n'}
              GATEWAY_URL=https://gateway.ondc.dmj.one{'\n'}
              {'\n'}
              <span className="text-gray-500"># Your subscriber details</span>{'\n'}
              SUBSCRIBER_ID=myapp.example.com{'\n'}
              SUBSCRIBER_URL=https://myapp.example.com/beckn{'\n'}
              UNIQUE_KEY_ID=key-001{'\n'}
              {'\n'}
              <span className="text-gray-500"># Your keys (keep these secret!)</span>{'\n'}
              SIGNING_PRIVATE_KEY=MC4CAQAwBQYDK2VwBCIEIL...{'\n'}
              SIGNING_PUBLIC_KEY=MCowBQYDK2VwAyEA...{'\n'}
              ENCR_PRIVATE_KEY=MC4CAQAwBQYDK2VuBCIEIJ...{'\n'}
              ENCR_PUBLIC_KEY=MCowBQYDK2VuAyEA...
            </code>
          </div>

          <div className="callout-success flex gap-3 items-start mt-4">
            <svg className="w-5 h-5 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-green-800 font-semibold mb-1">Migration-ready</p>
              <p className="text-sm text-green-700 mb-0">
                When you move to the government ONDC network, you only change{' '}
                <code className="code-inline">REGISTRY_URL</code> and{' '}
                <code className="code-inline">GATEWAY_URL</code>. See the{' '}
                <a href="/docs/migration" className="font-semibold underline">Migration Guide</a>.
              </p>
            </div>
          </div>
        </div>

        {/* ── STEP 5 ─────────────────────────────────────────── */}
        <div className="step-card">
          <div className="step-number">5</div>
          <h2 className="mt-0 pt-0 border-0 mb-3">Start Making API Calls</h2>
          <p>
            You are now registered and ready to transact on the network. Here is a
            quick example of a search request:
          </p>

          <div className="code-block">
            <code>
              <span className="text-gray-500">// Search for water delivery services in Delhi</span>{'\n'}
              const response = await fetch(&apos;https://gateway.ondc.dmj.one/search&apos;, {'{'}{'\n'}
              {'  '}method: &apos;POST&apos;,{'\n'}
              {'  '}headers: {'{'}{'\n'}
              {'    '}&apos;Content-Type&apos;: &apos;application/json&apos;,{'\n'}
              {'    '}&apos;Authorization&apos;: buildAuthHeader(requestBody, signingPrivateKey),{'\n'}
              {'  '}{'}'},{'\n'}
              {'  '}body: JSON.stringify({'{'}{'\n'}
              {'    '}context: {'{'}{'\n'}
              {'      '}domain: &apos;ONDC:NIC2004:36311&apos;,{'\n'}
              {'      '}action: &apos;search&apos;,{'\n'}
              {'      '}bap_id: &apos;myapp.example.com&apos;,{'\n'}
              {'      '}bap_uri: &apos;https://myapp.example.com/beckn&apos;,{'\n'}
              {'      '}transaction_id: crypto.randomUUID(),{'\n'}
              {'      '}message_id: crypto.randomUUID(),{'\n'}
              {'      '}timestamp: new Date().toISOString(),{'\n'}
              {'    '}{'}'},{'\n'}
              {'    '}message: {'{'}{'\n'}
              {'      '}intent: {'{'}{'\n'}
              {'        '}fulfillment: {'{'} type: &apos;Delivery&apos; {'}'},{'\n'}
              {'        '}item: {'{'} descriptor: {'{'} name: &apos;water&apos; {'}'} {'}'},{'\n'}
              {'      '}{'}'},{'\n'}
              {'    '}{'}'},{'\n'}
              {'  '}{'}'})
              {'\n'}{'}'});
            </code>
          </div>

          <p className="mt-4">
            The gateway broadcasts your search to all matching BPPs. Responses
            arrive asynchronously at your{' '}
            <code className="code-inline">/on_search</code> callback endpoint.
          </p>
        </div>
      </div>

      {/* ── Next Steps ─────────────────────────────────────── */}
      <h2>Next Steps</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 not-prose mt-4">
        <a
          href="/docs/integration"
          className="block p-4 rounded-xl border border-gray-200 hover:shadow-md hover:border-green-300 transition-all"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Integration Guide
          </h3>
          <p className="text-sm text-gray-600">
            Full code examples for the complete transaction lifecycle.
          </p>
        </a>
        <a
          href="/docs/signing"
          className="block p-4 rounded-xl border border-gray-200 hover:shadow-md hover:border-purple-300 transition-all"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Signing Tutorial
          </h3>
          <p className="text-sm text-gray-600">
            Deep dive into Ed25519 + BLAKE-512 request signing.
          </p>
        </a>
        <a
          href="/docs/api"
          className="block p-4 rounded-xl border border-gray-200 hover:shadow-md hover:border-amber-300 transition-all"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            API Reference
          </h3>
          <p className="text-sm text-gray-600">
            Complete endpoint documentation with examples.
          </p>
        </a>
        <a
          href="/docs/domains"
          className="block p-4 rounded-xl border border-gray-200 hover:shadow-md hover:border-rose-300 transition-all"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Domain Codes
          </h3>
          <p className="text-sm text-gray-600">
            All supported NIC2004 domain codes and schemas.
          </p>
        </a>
      </div>
    </div>
  );
}
