import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Domains — ONDC Network Platform',
  description:
    'All supported NIC2004 domain codes for the ONDC Network Platform, including schema expectations and example items per domain.',
};

export default function DomainsPage() {
  return (
    <div className="doc-prose">
      <h1>Domains</h1>

      <p className="text-lg text-gray-600">
        The ONDC Network Platform supports multiple commerce domains identified by
        NIC2004 codes. Each domain defines the type of goods or services traded,
        the expected catalog schema, and specific fulfillment requirements.
      </p>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 my-6">
        <h3 className="text-sm font-semibold text-gray-900 mt-0 mb-3">On This Page</h3>
        <ul className="space-y-1 mb-0">
          <li><a href="#domain-codes">Domain Code Reference</a></li>
          <li><a href="#schema-expectations">Schema Expectations per Domain</a></li>
          <li><a href="#example-items">Example Items per Domain</a></li>
          <li><a href="#using-domains">Using Domains in API Calls</a></li>
        </ul>
      </div>

      {/* ── DOMAIN CODE TABLE ──────────────────────────────── */}
      <h2 id="domain-codes">Domain Code Reference</h2>

      <p>
        Below is the complete list of supported domain codes. The{' '}
        <code className="code-inline">domain</code> field in your Beckn context
        must use the full code format (e.g.,{' '}
        <code className="code-inline">ONDC:NIC2004:52110</code>).
      </p>

      <table>
        <thead>
          <tr>
            <th>Domain Code</th>
            <th>Name</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code className="code-inline">ONDC:NIC2004:52110</code></td>
            <td>Grocery &amp; Retail</td>
            <td>Grocery stores, supermarkets, department stores, and general retail</td>
          </tr>
          <tr>
            <td><code className="code-inline">ONDC:NIC2004:52210</code></td>
            <td>Food &amp; Beverage</td>
            <td>Restaurants, cloud kitchens, food delivery, and catering services</td>
          </tr>
          <tr>
            <td><code className="code-inline">ONDC:NIC2004:36311</code></td>
            <td>Water</td>
            <td>Packaged drinking water, water delivery, and purification services</td>
          </tr>
          <tr>
            <td><code className="code-inline">ONDC:NIC2004:01100</code></td>
            <td>Agriculture</td>
            <td>Farm produce, seeds, fertilizers, agricultural equipment, and farm-to-consumer</td>
          </tr>
          <tr>
            <td><code className="code-inline">ONDC:NIC2004:49299</code></td>
            <td>Logistics</td>
            <td>Freight transport, courier services, last-mile delivery, and warehousing</td>
          </tr>
          <tr>
            <td><code className="code-inline">ONDC:NIC2004:85110</code></td>
            <td>Healthcare</td>
            <td>Hospital services, telemedicine, diagnostics, pharmacy, and health products</td>
          </tr>
          <tr>
            <td><code className="code-inline">ONDC:NIC2004:85210</code></td>
            <td>Pharmacy</td>
            <td>Pharmaceutical products, OTC medicines, and medical supplies</td>
          </tr>
          <tr>
            <td><code className="code-inline">ONDC:NIC2004:60232</code></td>
            <td>Mobility</td>
            <td>Ride-hailing, auto-rickshaw, cab services, and shared mobility</td>
          </tr>
          <tr>
            <td><code className="code-inline">ONDC:NIC2004:63034</code></td>
            <td>Travel &amp; Tourism</td>
            <td>Hotel bookings, tour packages, and travel services</td>
          </tr>
          <tr>
            <td><code className="code-inline">ONDC:NIC2004:80141</code></td>
            <td>Education</td>
            <td>Online courses, tutoring, skill development, and educational content</td>
          </tr>
        </tbody>
      </table>

      {/* ── SCHEMA EXPECTATIONS ────────────────────────────── */}
      <h2 id="schema-expectations">Schema Expectations per Domain</h2>

      <p>
        Each domain has specific requirements for item descriptors, fulfillment
        types, and catalog structure. Below are the key differences.
      </p>

      <h3>Grocery &amp; Retail (52110)</h3>
      <div className="code-block text-xs">
        <code>
          {'{'}{'\n'}
          {'  '}&quot;items&quot;: [{'{'}{'\n'}
          {'    '}&quot;descriptor&quot;: {'{'}{'\n'}
          {'      '}&quot;name&quot;: &quot;String (required)&quot;,{'\n'}
          {'      '}&quot;short_desc&quot;: &quot;String&quot;,{'\n'}
          {'      '}&quot;long_desc&quot;: &quot;String&quot;,{'\n'}
          {'      '}&quot;images&quot;: [&quot;URL&quot;]{'\n'}
          {'    '}{'}'},{'\n'}
          {'    '}&quot;price&quot;: {'{'} &quot;currency&quot;: &quot;INR&quot;, &quot;value&quot;: &quot;String&quot; {'}'},{'\n'}
          {'    '}&quot;quantity&quot;: {'{'} &quot;available&quot;: {'{'} &quot;count&quot;: &quot;Number&quot; {'}'} {'}'},{'\n'}
          {'    '}&quot;category_id&quot;: &quot;String&quot;,{'\n'}
          {'    '}&quot;@ondc/org/returnable&quot;: &quot;Boolean&quot;,{'\n'}
          {'    '}&quot;@ondc/org/cancellable&quot;: &quot;Boolean&quot;,{'\n'}
          {'    '}&quot;@ondc/org/time_to_ship&quot;: &quot;ISO8601 Duration&quot;{'\n'}
          {'  '}{'}'}]{'\n'}
          {'}'}
        </code>
      </div>

      <h3>Food &amp; Beverage (52210)</h3>
      <div className="code-block text-xs">
        <code>
          {'{'}{'\n'}
          {'  '}&quot;items&quot;: [{'{'}{'\n'}
          {'    '}&quot;descriptor&quot;: {'{'}{'\n'}
          {'      '}&quot;name&quot;: &quot;String (required)&quot;,{'\n'}
          {'      '}&quot;short_desc&quot;: &quot;String&quot;,{'\n'}
          {'      '}&quot;images&quot;: [&quot;URL&quot;]{'\n'}
          {'    '}{'}'},{'\n'}
          {'    '}&quot;price&quot;: {'{'} &quot;currency&quot;: &quot;INR&quot;, &quot;value&quot;: &quot;String&quot; {'}'},{'\n'}
          {'    '}&quot;tags&quot;: [{'\n'}
          {'      '}{'{'} &quot;code&quot;: &quot;veg_nonveg&quot;, &quot;list&quot;: [{'{'} &quot;code&quot;: &quot;veg&quot;, &quot;value&quot;: &quot;yes|no&quot; {'}'}] {'}'}{'\n'}
          {'    '}],{'\n'}
          {'    '}&quot;@ondc/org/time_to_ship&quot;: &quot;PT30M&quot;,{'\n'}
          {'    '}&quot;@ondc/org/returnable&quot;: false{'\n'}
          {'  '}{'}'}]{'\n'}
          {'}'}
        </code>
      </div>

      <h3>Logistics (49299)</h3>
      <div className="code-block text-xs">
        <code>
          {'{'}{'\n'}
          {'  '}&quot;items&quot;: [{'{'}{'\n'}
          {'    '}&quot;descriptor&quot;: {'{'} &quot;name&quot;: &quot;Express Delivery&quot;, &quot;code&quot;: &quot;P2P&quot; {'}'},{'\n'}
          {'    '}&quot;price&quot;: {'{'} &quot;currency&quot;: &quot;INR&quot;, &quot;value&quot;: &quot;String&quot; {'}'},{'\n'}
          {'    '}&quot;category_id&quot;: &quot;Immediate Delivery|Same Day|Next Day&quot;,{'\n'}
          {'    '}&quot;fulfillment_id&quot;: &quot;String&quot;{'\n'}
          {'  '}{'}'}],{'\n'}
          {'  '}&quot;fulfillments&quot;: [{'{'}{'\n'}
          {'    '}&quot;type&quot;: &quot;Delivery|RTO&quot;,{'\n'}
          {'    '}&quot;start&quot;: {'{'} &quot;location&quot;: {'{'} &quot;gps&quot;: &quot;lat,lng&quot; {'}'} {'}'},{'\n'}
          {'    '}&quot;end&quot;: {'{'} &quot;location&quot;: {'{'} &quot;gps&quot;: &quot;lat,lng&quot; {'}'} {'}'},{'\n'}
          {'    '}&quot;@ondc/org/awb_no&quot;: &quot;String&quot;{'\n'}
          {'  '}{'}'}]{'\n'}
          {'}'}
        </code>
      </div>

      <h3>Healthcare (85110)</h3>
      <div className="code-block text-xs">
        <code>
          {'{'}{'\n'}
          {'  '}&quot;items&quot;: [{'{'}{'\n'}
          {'    '}&quot;descriptor&quot;: {'{'}{'\n'}
          {'      '}&quot;name&quot;: &quot;General Consultation&quot;,{'\n'}
          {'      '}&quot;short_desc&quot;: &quot;30-minute consultation&quot;{'\n'}
          {'    '}{'}'},{'\n'}
          {'    '}&quot;price&quot;: {'{'} &quot;currency&quot;: &quot;INR&quot;, &quot;value&quot;: &quot;500.00&quot; {'}'},{'\n'}
          {'    '}&quot;category_id&quot;: &quot;Consultation|Diagnostics|Pharmacy&quot;,{'\n'}
          {'    '}&quot;fulfillment_id&quot;: &quot;String&quot;,{'\n'}
          {'    '}&quot;tags&quot;: [{'\n'}
          {'      '}{'{'} &quot;code&quot;: &quot;speciality&quot;, &quot;list&quot;: [{'{'} &quot;code&quot;: &quot;name&quot;, &quot;value&quot;: &quot;General Medicine&quot; {'}'}] {'}'}{'\n'}
          {'    '}]{'\n'}
          {'  '}{'}'}],{'\n'}
          {'  '}&quot;fulfillments&quot;: [{'{'}{'\n'}
          {'    '}&quot;type&quot;: &quot;Teleconsultation|Physical&quot;,{'\n'}
          {'    '}&quot;agent&quot;: {'{'}{'\n'}
          {'      '}&quot;name&quot;: &quot;Dr. Smith&quot;,{'\n'}
          {'      '}&quot;cred&quot;: [{'{'} &quot;type&quot;: &quot;License&quot;, &quot;id&quot;: &quot;MCI-12345&quot; {'}'}]{'\n'}
          {'    '}{'}'}{'\n'}
          {'  '}{'}'}]{'\n'}
          {'}'}
        </code>
      </div>

      {/* ── EXAMPLE ITEMS ──────────────────────────────────── */}
      <h2 id="example-items">Example Items per Domain</h2>

      <p>
        Below are example catalog items for each domain. These are representative
        of the simulated data generated by{' '}
        <code className="code-inline">simulate.sh</code>.
      </p>

      <table>
        <thead>
          <tr>
            <th>Domain</th>
            <th>Example Item</th>
            <th>Price (INR)</th>
            <th>Fulfillment</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Grocery</td>
            <td>Basmati Rice 5kg</td>
            <td>450.00</td>
            <td>Delivery</td>
          </tr>
          <tr>
            <td>Grocery</td>
            <td>Organic Toor Dal 1kg</td>
            <td>185.00</td>
            <td>Delivery</td>
          </tr>
          <tr>
            <td>Food &amp; Beverage</td>
            <td>Butter Chicken with Naan</td>
            <td>320.00</td>
            <td>Delivery</td>
          </tr>
          <tr>
            <td>Food &amp; Beverage</td>
            <td>Masala Dosa Combo</td>
            <td>150.00</td>
            <td>Delivery</td>
          </tr>
          <tr>
            <td>Water</td>
            <td>20L Packaged Water Can</td>
            <td>45.00</td>
            <td>Delivery</td>
          </tr>
          <tr>
            <td>Water</td>
            <td>1L Mineral Water (Pack of 12)</td>
            <td>180.00</td>
            <td>Delivery</td>
          </tr>
          <tr>
            <td>Agriculture</td>
            <td>Hybrid Tomato Seeds 100g</td>
            <td>250.00</td>
            <td>Delivery</td>
          </tr>
          <tr>
            <td>Agriculture</td>
            <td>Organic Compost 25kg</td>
            <td>400.00</td>
            <td>Delivery</td>
          </tr>
          <tr>
            <td>Logistics</td>
            <td>Same-day Intracity Delivery</td>
            <td>80.00</td>
            <td>P2P Delivery</td>
          </tr>
          <tr>
            <td>Logistics</td>
            <td>Next-day Intercity Parcel</td>
            <td>150.00</td>
            <td>P2P Delivery</td>
          </tr>
          <tr>
            <td>Healthcare</td>
            <td>General Physician Consultation</td>
            <td>500.00</td>
            <td>Teleconsultation</td>
          </tr>
          <tr>
            <td>Healthcare</td>
            <td>Complete Blood Count Test</td>
            <td>350.00</td>
            <td>Sample Pickup</td>
          </tr>
          <tr>
            <td>Pharmacy</td>
            <td>Paracetamol 500mg (Strip of 15)</td>
            <td>30.00</td>
            <td>Delivery</td>
          </tr>
          <tr>
            <td>Mobility</td>
            <td>Auto-rickshaw Ride (5km)</td>
            <td>45.00</td>
            <td>Ride</td>
          </tr>
          <tr>
            <td>Education</td>
            <td>Python Programming Basics (Online)</td>
            <td>999.00</td>
            <td>Online</td>
          </tr>
        </tbody>
      </table>

      {/* ── USING DOMAINS IN API ───────────────────────────── */}
      <h2 id="using-domains">Using Domains in API Calls</h2>

      <p>
        The domain code is specified in the Beckn context of every request. BAPs
        can search within a specific domain, and BPPs register for the domains
        they serve.
      </p>

      <div className="code-block">
        <code>
          <span className="text-gray-500">// Search within the Water domain</span>{'\n'}
          const context = {'{'}{'\n'}
          {'  '}domain: &apos;ONDC:NIC2004:36311&apos;,  <span className="text-gray-500">// Water</span>{'\n'}
          {'  '}action: &apos;search&apos;,{'\n'}
          {'  '}bap_id: &apos;myapp.example.com&apos;,{'\n'}
          {'  '}bap_uri: &apos;https://myapp.example.com/beckn&apos;,{'\n'}
          {'  '}transaction_id: crypto.randomUUID(),{'\n'}
          {'  '}message_id: crypto.randomUUID(),{'\n'}
          {'  '}timestamp: new Date().toISOString(),{'\n'}
          {'}'};
        </code>
      </div>

      <div className="callout-info flex gap-3 items-start mt-4">
        <svg className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <div>
          <p className="text-sm text-blue-800 font-semibold mb-1">Multi-domain BPPs</p>
          <p className="text-sm text-blue-700 mb-0">
            A single BPP can register for multiple domains. Each domain
            registration is a separate entry in the registry. A search in one
            domain only returns results from BPPs registered for that domain.
          </p>
        </div>
      </div>
    </div>
  );
}
