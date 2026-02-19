import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Migration Guide — ONDC Network Platform',
  description:
    'How to migrate from the ONDC Network Platform to the government ONDC network with zero code changes.',
};

export default function MigrationPage() {
  return (
    <div className="doc-prose">
      <h1>Migration Guide</h1>

      <p className="text-lg text-gray-600">
        The ONDC Network Platform is protocol-identical to India&apos;s government
        ONDC network. When you are ready for production, switching networks
        requires <strong>zero code changes</strong> &mdash; only environment
        variables need to be updated.
      </p>

      <div className="callout-success flex gap-3 items-start my-6">
        <svg className="w-5 h-5 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm text-green-800 font-semibold mb-1">Zero code changes</p>
          <p className="text-sm text-green-700 mb-0">
            Because this platform uses the exact same Beckn protocol, signing
            algorithms, and API contracts as the government ONDC, your application
            code does not need any modifications. Only the network endpoint URLs
            change.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 my-6">
        <h3 className="text-sm font-semibold text-gray-900 mt-0 mb-3">On This Page</h3>
        <ul className="space-y-1 mb-0">
          <li><a href="#what-changes">What Changes</a></li>
          <li><a href="#side-by-side">Side-by-Side Comparison</a></li>
          <li><a href="#migration-steps">Migration Steps</a></li>
          <li><a href="#checklist">Pre-Migration Checklist</a></li>
          <li><a href="#what-stays-same">What Stays the Same</a></li>
        </ul>
      </div>

      {/* ── WHAT CHANGES ───────────────────────────────────── */}
      <h2 id="what-changes">What Changes</h2>

      <p>
        Only <strong>three environment variables</strong> need to change when
        migrating from this platform to the government ONDC network:
      </p>

      <ol>
        <li>
          <code className="code-inline">REGISTRY_URL</code> &mdash; Points to
          ONDC&apos;s official registry
        </li>
        <li>
          <code className="code-inline">GATEWAY_URL</code> &mdash; Points to
          ONDC&apos;s official gateway
        </li>
        <li>
          <code className="code-inline">SUBSCRIBER_URL</code> &mdash; Must be
          your publicly accessible URL registered with ONDC
        </li>
      </ol>

      <p>
        Your keys, subscriber ID, signing logic, API handlers, and business logic
        all remain identical.
      </p>

      {/* ── SIDE BY SIDE ───────────────────────────────────── */}
      <h2 id="side-by-side">Side-by-Side Comparison</h2>

      <p>
        Here is an exact comparison of the environment variables between the two
        networks:
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 not-prose my-6">
        {/* This Platform */}
        <div className="rounded-xl border-2 border-primary-200 overflow-hidden">
          <div className="bg-primary-50 px-4 py-3 border-b border-primary-200">
            <h3 className="text-sm font-semibold text-primary-800 m-0">
              This Platform (Development / Staging)
            </h3>
          </div>
          <div className="code-block rounded-none border-0 text-xs">
            <code>
              <span className="text-gray-500"># Network endpoints</span>{'\n'}
              <span className="text-cyan-400">REGISTRY_URL</span>=https://registry.ondc.dmj.one{'\n'}
              <span className="text-cyan-400">GATEWAY_URL</span>=https://gateway.ondc.dmj.one{'\n'}
              {'\n'}
              <span className="text-gray-500"># Your subscriber details</span>{'\n'}
              <span className="text-green-400">SUBSCRIBER_ID</span>=myapp.example.com{'\n'}
              <span className="text-yellow-400">SUBSCRIBER_URL</span>=https://myapp.example.com/beckn{'\n'}
              <span className="text-green-400">UNIQUE_KEY_ID</span>=key-001{'\n'}
              {'\n'}
              <span className="text-gray-500"># Your keys (unchanged)</span>{'\n'}
              <span className="text-green-400">SIGNING_PRIVATE_KEY</span>=MC4CAQAwBQYD...{'\n'}
              <span className="text-green-400">SIGNING_PUBLIC_KEY</span>=MCowBQYDK2Vw...{'\n'}
              <span className="text-green-400">ENCR_PRIVATE_KEY</span>=MC4CAQAwBQYD...{'\n'}
              <span className="text-green-400">ENCR_PUBLIC_KEY</span>=MCowBQYDK2Vu...
            </code>
          </div>
        </div>

        {/* Government ONDC */}
        <div className="rounded-xl border-2 border-amber-200 overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
            <h3 className="text-sm font-semibold text-amber-800 m-0">
              Government ONDC (Production)
            </h3>
          </div>
          <div className="code-block rounded-none border-0 text-xs">
            <code>
              <span className="text-gray-500"># Network endpoints (CHANGED)</span>{'\n'}
              <span className="text-red-400">REGISTRY_URL</span>=https://prod.registry.ondc.org{'\n'}
              <span className="text-red-400">GATEWAY_URL</span>=https://prod.gateway.ondc.org{'\n'}
              {'\n'}
              <span className="text-gray-500"># Your subscriber details</span>{'\n'}
              <span className="text-green-400">SUBSCRIBER_ID</span>=myapp.example.com{'\n'}
              <span className="text-yellow-400">SUBSCRIBER_URL</span>=https://myapp.example.com/beckn{'\n'}
              <span className="text-green-400">UNIQUE_KEY_ID</span>=key-001{'\n'}
              {'\n'}
              <span className="text-gray-500"># Your keys (unchanged)</span>{'\n'}
              <span className="text-green-400">SIGNING_PRIVATE_KEY</span>=MC4CAQAwBQYD...{'\n'}
              <span className="text-green-400">SIGNING_PUBLIC_KEY</span>=MCowBQYDK2Vw...{'\n'}
              <span className="text-green-400">ENCR_PRIVATE_KEY</span>=MC4CAQAwBQYD...{'\n'}
              <span className="text-green-400">ENCR_PUBLIC_KEY</span>=MCowBQYDK2Vu...
            </code>
          </div>
        </div>
      </div>

      <div className="my-6">
        <h3>Change Summary</h3>
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>This Platform</th>
              <th>Government ONDC</th>
              <th>Changed?</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code className="code-inline">REGISTRY_URL</code></td>
              <td><code className="code-inline text-xs">https://registry.ondc.dmj.one</code></td>
              <td><code className="code-inline text-xs">https://prod.registry.ondc.org</code></td>
              <td><span className="text-red-600 font-semibold">Yes</span></td>
            </tr>
            <tr>
              <td><code className="code-inline">GATEWAY_URL</code></td>
              <td><code className="code-inline text-xs">https://gateway.ondc.dmj.one</code></td>
              <td><code className="code-inline text-xs">https://prod.gateway.ondc.org</code></td>
              <td><span className="text-red-600 font-semibold">Yes</span></td>
            </tr>
            <tr>
              <td><code className="code-inline">SUBSCRIBER_URL</code></td>
              <td colSpan={2} className="text-center">Must be publicly accessible and registered with ONDC</td>
              <td><span className="text-amber-600 font-semibold">Maybe</span></td>
            </tr>
            <tr>
              <td><code className="code-inline">SUBSCRIBER_ID</code></td>
              <td colSpan={2} className="text-center">Same value on both networks</td>
              <td><span className="text-green-600 font-semibold">No</span></td>
            </tr>
            <tr>
              <td><code className="code-inline">UNIQUE_KEY_ID</code></td>
              <td colSpan={2} className="text-center">Same value on both networks</td>
              <td><span className="text-green-600 font-semibold">No</span></td>
            </tr>
            <tr>
              <td><code className="code-inline">SIGNING_*</code></td>
              <td colSpan={2} className="text-center">Same key pair on both networks</td>
              <td><span className="text-green-600 font-semibold">No</span></td>
            </tr>
            <tr>
              <td><code className="code-inline">ENCR_*</code></td>
              <td colSpan={2} className="text-center">Same key pair on both networks</td>
              <td><span className="text-green-600 font-semibold">No</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── MIGRATION STEPS ────────────────────────────────── */}
      <h2 id="migration-steps">Migration Steps</h2>

      <div className="mt-6 space-y-2">
        <div className="step-card">
          <div className="step-number">1</div>
          <h3 className="mt-0 pt-0 mb-2">Register with Government ONDC</h3>
          <p>
            Apply for network participant status on the official{' '}
            <a href="https://ondc.org" target="_blank" rel="noopener noreferrer">
              ONDC portal
            </a>
            . Complete their onboarding process, technical review, and compliance
            requirements. You can use the same key pair you used on this platform.
          </p>
        </div>

        <div className="step-card">
          <div className="step-number">2</div>
          <h3 className="mt-0 pt-0 mb-2">Ensure Public Accessibility</h3>
          <p>
            Your <code className="code-inline">SUBSCRIBER_URL</code> must be
            publicly accessible from the internet. The government ONDC registry
            will send a challenge to this URL during registration, and BPPs will
            send callbacks to it during transactions.
          </p>
          <div className="callout-warning flex gap-3 items-start mt-3">
            <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm text-amber-800 font-semibold mb-1">SSL required</p>
              <p className="text-sm text-amber-700 mb-0">
                The government ONDC network requires HTTPS. Ensure your subscriber
                URL uses a valid SSL certificate.
              </p>
            </div>
          </div>
        </div>

        <div className="step-card">
          <div className="step-number">3</div>
          <h3 className="mt-0 pt-0 mb-2">Update Environment Variables</h3>
          <p>Change exactly two (or three) environment variables:</p>
          <div className="code-block">
            <code>
              <span className="text-gray-500"># Before (this platform)</span>{'\n'}
              REGISTRY_URL=https://registry.ondc.dmj.one{'\n'}
              GATEWAY_URL=https://gateway.ondc.dmj.one{'\n'}
              {'\n'}
              <span className="text-gray-500"># After (government ONDC)</span>{'\n'}
              REGISTRY_URL=https://prod.registry.ondc.org{'\n'}
              GATEWAY_URL=https://prod.gateway.ondc.org
            </code>
          </div>
        </div>

        <div className="step-card">
          <div className="step-number">4</div>
          <h3 className="mt-0 pt-0 mb-2">Deploy and Verify</h3>
          <p>
            Deploy your application with the updated environment variables. Run
            your existing test suite to verify all API calls work correctly against
            the government network.
          </p>
          <div className="code-block">
            <code>
              <span className="text-gray-500"># Verify connectivity to the government registry</span>{'\n'}
              curl -X POST https://prod.registry.ondc.org/lookup \{'\n'}
              {'  '}-H &quot;Content-Type: application/json&quot; \{'\n'}
              {'  '}-d &apos;{'{'}&quot;subscriber_id&quot;: &quot;myapp.example.com&quot;{'}'}&apos;
            </code>
          </div>
        </div>

        <div className="step-card">
          <div className="step-number">5</div>
          <h3 className="mt-0 pt-0 mb-2">Run End-to-End Tests</h3>
          <p>
            Execute a complete transaction flow (search, select, init, confirm) on
            the government network to ensure everything works end to end. The same
            test scripts you used with this platform will work unchanged.
          </p>
        </div>
      </div>

      {/* ── CHECKLIST ──────────────────────────────────────── */}
      <h2 id="checklist">Pre-Migration Checklist</h2>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 my-6 not-prose">
        <ul className="space-y-3">
          {[
            'Application code tested end-to-end on this platform',
            'All Beckn callbacks (on_search, on_select, on_init, on_confirm, on_status) implemented',
            'Signature verification working for all incoming requests',
            'Subscriber URL is publicly accessible with valid SSL',
            'Key pair generated and securely stored',
            'Registered as a network participant on the official ONDC portal',
            'Completed ONDC technical review and compliance requirements',
            'Environment variables updated for production endpoints',
            'Error handling and retry logic tested',
            'Monitoring and logging configured for production',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="w-5 h-5 mt-0.5 rounded border-2 border-gray-300 shrink-0" />
              <span className="text-sm text-gray-700">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── WHAT STAYS SAME ────────────────────────────────── */}
      <h2 id="what-stays-same">What Stays the Same</h2>

      <p>
        Everything below remains identical between this platform and the government
        ONDC network:
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 not-prose my-6">
        <div className="p-4 rounded-xl border border-green-200 bg-green-50">
          <h4 className="text-sm font-semibold text-green-800 mb-2">
            Protocol &amp; Signing
          </h4>
          <ul className="space-y-1 text-sm text-green-700">
            <li>Ed25519 + BLAKE-512 signing</li>
            <li>Authorization header format</li>
            <li>Beckn protocol version (1.1.0)</li>
            <li>X25519 encryption for challenges</li>
          </ul>
        </div>

        <div className="p-4 rounded-xl border border-green-200 bg-green-50">
          <h4 className="text-sm font-semibold text-green-800 mb-2">
            API Contracts
          </h4>
          <ul className="space-y-1 text-sm text-green-700">
            <li>All Beckn API endpoints</li>
            <li>Request/response schemas</li>
            <li>Context object structure</li>
            <li>Callback URL patterns</li>
          </ul>
        </div>

        <div className="p-4 rounded-xl border border-green-200 bg-green-50">
          <h4 className="text-sm font-semibold text-green-800 mb-2">
            Domain Codes
          </h4>
          <ul className="space-y-1 text-sm text-green-700">
            <li>NIC2004 domain code format</li>
            <li>Category taxonomies</li>
            <li>Item schema per domain</li>
            <li>Fulfillment types</li>
          </ul>
        </div>

        <div className="p-4 rounded-xl border border-green-200 bg-green-50">
          <h4 className="text-sm font-semibold text-green-800 mb-2">
            Business Logic
          </h4>
          <ul className="space-y-1 text-sm text-green-700">
            <li>Order lifecycle flow</li>
            <li>Callback handling logic</li>
            <li>Error handling patterns</li>
            <li>Your application code</li>
          </ul>
        </div>
      </div>

      <div className="callout-info flex gap-3 items-start mt-6">
        <svg className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <div>
          <p className="text-sm text-blue-800 font-semibold mb-1">Staging environment</p>
          <p className="text-sm text-blue-700 mb-0">
            ONDC also provides a staging/pre-production environment at{' '}
            <code className="code-inline">staging.registry.ondc.org</code>. You
            can test against their staging network before going live on production.
            The same environment-variable-only migration approach applies.
          </p>
        </div>
      </div>
    </div>
  );
}
