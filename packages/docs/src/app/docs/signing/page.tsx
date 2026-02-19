import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Signing Tutorial — ONDC Network Platform',
  description:
    'Step-by-step walkthrough of Ed25519 + BLAKE-512 request signing for the Beckn protocol used by ONDC.',
};

export default function SigningPage() {
  return (
    <div className="doc-prose">
      <h1>Signing Tutorial</h1>

      <p className="text-lg text-gray-600">
        Every request on the Beckn/ONDC network must be cryptographically signed
        using <strong>Ed25519</strong> signatures over a{' '}
        <strong>BLAKE2b-512</strong> digest. This tutorial walks through the
        entire signing and verification process step by step.
      </p>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 my-6">
        <h3 className="text-sm font-semibold text-gray-900 mt-0 mb-3">On This Page</h3>
        <ul className="space-y-1 mb-0">
          <li><a href="#overview">Overview</a></li>
          <li><a href="#step-by-step">Step-by-Step Signing Process</a></li>
          <li><a href="#code-example">Code Example: Building the Authorization Header</a></li>
          <li><a href="#verification">Signature Verification</a></li>
          <li><a href="#test-vectors">Test Vectors</a></li>
          <li><a href="#common-pitfalls">Common Pitfalls</a></li>
        </ul>
      </div>

      {/* ── OVERVIEW ───────────────────────────────────────── */}
      <h2 id="overview">Overview</h2>

      <p>
        The Beckn protocol uses the{' '}
        <a href="https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures" target="_blank" rel="noopener noreferrer">
          HTTP Signatures
        </a>{' '}
        specification (draft-cavage) adapted for Ed25519 with BLAKE2b-512. The
        signing flow is:
      </p>

      <ol>
        <li>Compute a <strong>BLAKE2b-512</strong> digest of the request body</li>
        <li>
          Build a <strong>signing string</strong> from the created timestamp,
          expires timestamp, and digest
        </li>
        <li>
          <strong>Sign</strong> the signing string using your Ed25519 private key
        </li>
        <li>
          Construct the <strong>Authorization header</strong> with all required
          fields
        </li>
      </ol>

      <p>The resulting header looks like this:</p>

      <div className="code-block">
        <code>
          Signature keyId=&quot;subscriber_id|unique_key_id|ed25519&quot;,{'\n'}
          algorithm=&quot;ed25519&quot;,{'\n'}
          created=&quot;1706745600&quot;,{'\n'}
          expires=&quot;1706745630&quot;,{'\n'}
          headers=&quot;(created) (expires) digest&quot;,{'\n'}
          signature=&quot;base64_encoded_signature&quot;
        </code>
      </div>

      {/* ── STEP BY STEP ───────────────────────────────────── */}
      <h2 id="step-by-step">Step-by-Step Signing Process</h2>

      <div className="mt-6 space-y-2">
        {/* Step 1 */}
        <div className="step-card">
          <div className="step-number">1</div>
          <h3 className="mt-0 pt-0 mb-2">Compute the BLAKE2b-512 Digest</h3>
          <p>
            Hash the entire JSON request body using BLAKE2b with a 512-bit (64
            byte) output, then Base64-encode the result.
          </p>
          <div className="code-block">
            <code>
              <span className="text-gray-500">// Input: the JSON request body as a string</span>{'\n'}
              const body = JSON.stringify(requestPayload);{'\n'}
              {'\n'}
              <span className="text-gray-500">// Compute BLAKE2b-512 digest</span>{'\n'}
              const hash = blake2b(body, null, 64); <span className="text-gray-500">// 64 bytes = 512 bits</span>{'\n'}
              const digestB64 = Buffer.from(hash).toString(&apos;base64&apos;);{'\n'}
              {'\n'}
              <span className="text-gray-500">// Result: &quot;BLAKE-512=xxxx...xxxx&quot;</span>{'\n'}
              const digestHeader = `BLAKE-512=${'{'}{`digestB64`}{'}'}`;
            </code>
          </div>
        </div>

        {/* Step 2 */}
        <div className="step-card">
          <div className="step-number">2</div>
          <h3 className="mt-0 pt-0 mb-2">Build the Signing String</h3>
          <p>
            The signing string is constructed from three components, each on its
            own line, separated by newlines (not CRLF).
          </p>
          <div className="code-block">
            <code>
              const created = Math.floor(Date.now() / 1000);{'\n'}
              const expires = created + 30; <span className="text-gray-500">// 30-second validity</span>{'\n'}
              {'\n'}
              const signingString ={'\n'}
              {'  '}`(created): ${'{'}{`created`}{'}'}\n` +{'\n'}
              {'  '}`(expires): ${'{'}{`expires`}{'}'}\n` +{'\n'}
              {'  '}`digest: BLAKE-512=${'{'}{`digestB64`}{'}'}`;
            </code>
          </div>

          <div className="callout-warning flex gap-3 items-start mt-4">
            <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm text-amber-800 font-semibold mb-1">Important: exact format</p>
              <p className="text-sm text-amber-700 mb-0">
                The signing string must use <code className="code-inline">\n</code>{' '}
                (LF) line separators, not <code className="code-inline">\r\n</code>{' '}
                (CRLF). The parentheses around{' '}
                <code className="code-inline">(created)</code> and{' '}
                <code className="code-inline">(expires)</code> are part of the field
                names. There must be no trailing newline.
              </p>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="step-card">
          <div className="step-number">3</div>
          <h3 className="mt-0 pt-0 mb-2">Sign with Ed25519</h3>
          <p>
            Sign the UTF-8 encoded signing string using your Ed25519 private key,
            then Base64-encode the resulting 64-byte signature.
          </p>
          <div className="code-block">
            <code>
              import nacl from &apos;tweetnacl&apos;;{'\n'}
              {'\n'}
              <span className="text-gray-500">// Decode your private key from Base64</span>{'\n'}
              const privateKeyBytes = Buffer.from(signingPrivateKey, &apos;base64&apos;);{'\n'}
              {'\n'}
              <span className="text-gray-500">// Sign the signing string</span>{'\n'}
              const signatureBytes = nacl.sign.detached({'\n'}
              {'  '}Buffer.from(signingString, &apos;utf-8&apos;),{'\n'}
              {'  '}privateKeyBytes{'\n'}
              );{'\n'}
              {'\n'}
              const signatureB64 = Buffer.from(signatureBytes).toString(&apos;base64&apos;);
            </code>
          </div>
        </div>

        {/* Step 4 */}
        <div className="step-card">
          <div className="step-number">4</div>
          <h3 className="mt-0 pt-0 mb-2">Build the Authorization Header</h3>
          <p>
            Combine all components into the final Authorization header value.
          </p>
          <div className="code-block">
            <code>
              const subscriberId = process.env.SUBSCRIBER_ID;{'\n'}
              const uniqueKeyId = process.env.UNIQUE_KEY_ID;{'\n'}
              {'\n'}
              const authHeader = [{'\n'}
              {'  '}`Signature keyId=&quot;${'{'}{`subscriberId`}{'}'}|${'{'}{`uniqueKeyId`}{'}'}|ed25519&quot;`,{'\n'}
              {'  '}`algorithm=&quot;ed25519&quot;`,{'\n'}
              {'  '}`created=&quot;${'{'}{`created`}{'}'}&quot;`,{'\n'}
              {'  '}`expires=&quot;${'{'}{`expires`}{'}'}&quot;`,{'\n'}
              {'  '}`headers=&quot;(created) (expires) digest&quot;`,{'\n'}
              {'  '}`signature=&quot;${'{'}{`signatureB64`}{'}'}&quot;`,{'\n'}
              ].join(&apos;,&apos;);
            </code>
          </div>
        </div>
      </div>

      {/* ── FULL CODE EXAMPLE ──────────────────────────────── */}
      <h2 id="code-example">Complete Code Example</h2>

      <p>Here is a complete, ready-to-use signing module in TypeScript:</p>

      <div className="code-block">
        <code>
          <span className="text-gray-500">// signing.ts</span>{'\n'}
          import nacl from &apos;tweetnacl&apos;;{'\n'}
          import {'{'} blake2b {'}'} from &apos;blakejs&apos;;{'\n'}
          {'\n'}
          interface SigningConfig {'{'}{'\n'}
          {'  '}subscriberId: string;{'\n'}
          {'  '}uniqueKeyId: string;{'\n'}
          {'  '}privateKey: string; <span className="text-gray-500">// Base64-encoded Ed25519 private key</span>{'\n'}
          {'}'}{'\n'}
          {'\n'}
          export function createAuthHeader({'\n'}
          {'  '}body: string,{'\n'}
          {'  '}config: SigningConfig{'\n'}
          ): string {'{'}{'\n'}
          {'  '}<span className="text-gray-500">// 1. BLAKE2b-512 digest</span>{'\n'}
          {'  '}const hashBytes = blake2b(Buffer.from(body), undefined, 64);{'\n'}
          {'  '}const digestB64 = Buffer.from(hashBytes).toString(&apos;base64&apos;);{'\n'}
          {'\n'}
          {'  '}<span className="text-gray-500">// 2. Signing string</span>{'\n'}
          {'  '}const created = Math.floor(Date.now() / 1000);{'\n'}
          {'  '}const expires = created + 30;{'\n'}
          {'  '}const signingString ={'\n'}
          {'    '}`(created): ${'{'}{`created`}{'}'}\n` +{'\n'}
          {'    '}`(expires): ${'{'}{`expires`}{'}'}\n` +{'\n'}
          {'    '}`digest: BLAKE-512=${'{'}{`digestB64`}{'}'}`;{'\n'}
          {'\n'}
          {'  '}<span className="text-gray-500">// 3. Ed25519 signature</span>{'\n'}
          {'  '}const privateKeyBytes = Buffer.from(config.privateKey, &apos;base64&apos;);{'\n'}
          {'  '}const sig = nacl.sign.detached({'\n'}
          {'    '}Buffer.from(signingString, &apos;utf-8&apos;),{'\n'}
          {'    '}privateKeyBytes{'\n'}
          {'  '});{'\n'}
          {'  '}const sigB64 = Buffer.from(sig).toString(&apos;base64&apos;);{'\n'}
          {'\n'}
          {'  '}<span className="text-gray-500">// 4. Authorization header</span>{'\n'}
          {'  '}return [{'\n'}
          {'    '}`Signature keyId=&quot;${'{'}{`config.subscriberId`}{'}'}|${'{'}{`config.uniqueKeyId`}{'}'}|ed25519&quot;`,{'\n'}
          {'    '}`algorithm=&quot;ed25519&quot;`,{'\n'}
          {'    '}`created=&quot;${'{'}{`created`}{'}'}&quot;`,{'\n'}
          {'    '}`expires=&quot;${'{'}{`expires`}{'}'}&quot;`,{'\n'}
          {'    '}`headers=&quot;(created) (expires) digest&quot;`,{'\n'}
          {'    '}`signature=&quot;${'{'}{`sigB64`}{'}'}&quot;`,{'\n'}
          {'  '}].join(&apos;,&apos;);{'\n'}
          {'}'}
        </code>
      </div>

      {/* ── VERIFICATION ───────────────────────────────────── */}
      <h2 id="verification">Signature Verification</h2>

      <p>
        When you receive a request, you must verify the sender&apos;s signature.
        The process is the reverse of signing:
      </p>

      <ol>
        <li>
          Parse the Authorization header to extract{' '}
          <code className="code-inline">keyId</code>,{' '}
          <code className="code-inline">created</code>,{' '}
          <code className="code-inline">expires</code>, and{' '}
          <code className="code-inline">signature</code>
        </li>
        <li>
          Extract the <code className="code-inline">subscriber_id</code> and{' '}
          <code className="code-inline">unique_key_id</code> from the keyId
        </li>
        <li>
          Look up the sender&apos;s public key from the registry using{' '}
          <code className="code-inline">/lookup</code>
        </li>
        <li>Compute the BLAKE2b-512 digest of the received body</li>
        <li>Reconstruct the signing string</li>
        <li>
          Verify the signature against the signing string using the sender&apos;s
          public key
        </li>
        <li>
          Check that the current time is between{' '}
          <code className="code-inline">created</code> and{' '}
          <code className="code-inline">expires</code>
        </li>
      </ol>

      <div className="code-block">
        <code>
          <span className="text-gray-500">// verify.ts</span>{'\n'}
          export async function verifyRequest({'\n'}
          {'  '}authHeader: string,{'\n'}
          {'  '}body: string,{'\n'}
          {'  '}registryUrl: string{'\n'}
          ): Promise&lt;boolean&gt; {'{'}{'\n'}
          {'  '}<span className="text-gray-500">// 1. Parse the header</span>{'\n'}
          {'  '}const params = parseAuthHeader(authHeader);{'\n'}
          {'  '}const [subscriberId, uniqueKeyId] = params.keyId.split(&apos;|&apos;);{'\n'}
          {'\n'}
          {'  '}<span className="text-gray-500">// 2. Check expiry</span>{'\n'}
          {'  '}const now = Math.floor(Date.now() / 1000);{'\n'}
          {'  '}if (now &gt; parseInt(params.expires)) return false;{'\n'}
          {'\n'}
          {'  '}<span className="text-gray-500">// 3. Lookup sender&apos;s public key from registry</span>{'\n'}
          {'  '}const lookup = await fetch(`${'{'}{`registryUrl`}{'}'}/lookup`, {'{'}{'\n'}
          {'    '}method: &apos;POST&apos;,{'\n'}
          {'    '}headers: {'{'} &apos;Content-Type&apos;: &apos;application/json&apos; {'}'},{'\n'}
          {'    '}body: JSON.stringify({'{'}{'\n'}
          {'      '}subscriber_id: subscriberId,{'\n'}
          {'      '}unique_key_id: uniqueKeyId,{'\n'}
          {'    '}{'}'})
          {'\n'}{'  '}{'}'});{'\n'}
          {'  '}const [subscriber] = await lookup.json();{'\n'}
          {'  '}const publicKey = Buffer.from(subscriber.signing_public_key, &apos;base64&apos;);{'\n'}
          {'\n'}
          {'  '}<span className="text-gray-500">// 4. Reconstruct signing string</span>{'\n'}
          {'  '}const digestB64 = Buffer.from({'\n'}
          {'    '}blake2b(Buffer.from(body), undefined, 64){'\n'}
          {'  '}).toString(&apos;base64&apos;);{'\n'}
          {'\n'}
          {'  '}const signingString ={'\n'}
          {'    '}`(created): ${'{'}{`params.created`}{'}'}\n` +{'\n'}
          {'    '}`(expires): ${'{'}{`params.expires`}{'}'}\n` +{'\n'}
          {'    '}`digest: BLAKE-512=${'{'}{`digestB64`}{'}'}`;{'\n'}
          {'\n'}
          {'  '}<span className="text-gray-500">// 5. Verify</span>{'\n'}
          {'  '}const signatureBytes = Buffer.from(params.signature, &apos;base64&apos;);{'\n'}
          {'  '}return nacl.sign.detached.verify({'\n'}
          {'    '}Buffer.from(signingString, &apos;utf-8&apos;),{'\n'}
          {'    '}signatureBytes,{'\n'}
          {'    '}publicKey{'\n'}
          {'  '});{'\n'}
          {'}'}
        </code>
      </div>

      {/* ── TEST VECTORS ───────────────────────────────────── */}
      <h2 id="test-vectors">Test Vectors</h2>

      <p>
        Use these test vectors to verify your signing implementation is correct.
      </p>

      <div className="code-block">
        <code>
          <span className="text-cyan-400">--- Test Vector 1 ---</span>{'\n'}
          {'\n'}
          <span className="text-green-400">Private Key (Base64):</span>{'\n'}
          lP3sHA+6gGCp3LEjapMMNoWqrDhgAkBmZVFKgKME0kJBdrEryBJBYMHoa/JkYflu{'\n'}
          0JflbXEdslr92sdPVU3q7g=={'\n'}
          {'\n'}
          <span className="text-green-400">Public Key (Base64):</span>{'\n'}
          QXaxK8gSQWDB6GvyZGH5btCX5W1xHbJa/drHT1VN6u4={'\n'}
          {'\n'}
          <span className="text-green-400">Request Body:</span>{'\n'}
          {'{'}&#34;context&#34;:{'{'}&#34;action&#34;:&#34;search&#34;{'}'},&#34;message&#34;:{'{'}&#34;intent&#34;:{'{'}&#34;item&#34;:{'{'}&#34;descriptor&#34;:{'{'}&#34;name&#34;:&#34;test&#34;{'}'}{'}'}{'}'}{'}'}{'}'}
          {'\n'}
          {'\n'}
          <span className="text-green-400">Created:</span> 1706745600{'\n'}
          <span className="text-green-400">Expires:</span> 1706745630{'\n'}
          {'\n'}
          <span className="text-green-400">BLAKE-512 Digest (Base64):</span>{'\n'}
          FG0GBsQJLAJhI0cswWMmMO0VwaX2yGjCbNAcJqFhkB8FaPp+Nz/wDz0WPw5nN9xa{'\n'}
          eLlOxEDnQE3mF2o0l1GQCA=={'\n'}
          {'\n'}
          <span className="text-green-400">Signing String:</span>{'\n'}
          (created): 1706745600{'\n'}
          (expires): 1706745630{'\n'}
          digest: BLAKE-512=FG0GBsQJLAJhI0cswWMmMO0VwaX2yGjCbNAcJqFhkB8FaPp+{'\n'}
          Nz/wDz0WPw5nN9xaeLlOxEDnQE3mF2o0l1GQCA==
        </code>
      </div>

      <p>
        Verify that your implementation produces the same BLAKE-512 digest for the
        given body, and that the signing/verification round-trips successfully
        with the provided key pair.
      </p>

      {/* ── COMMON PITFALLS ────────────────────────────────── */}
      <h2 id="common-pitfalls">Common Pitfalls</h2>

      <div className="space-y-4">
        <div className="callout-danger flex gap-3 items-start">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm text-red-800 font-semibold mb-1">
              1. Wrong hash algorithm
            </p>
            <p className="text-sm text-red-700 mb-0">
              ONDC uses <strong>BLAKE2b-512</strong>, not SHA-256 or SHA-512. Many
              HTTP signature libraries default to SHA-256. Make sure you are using
              BLAKE2b with a 64-byte (512-bit) output.
            </p>
          </div>
        </div>

        <div className="callout-danger flex gap-3 items-start">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm text-red-800 font-semibold mb-1">
              2. Line ending mismatch
            </p>
            <p className="text-sm text-red-700 mb-0">
              The signing string must use <code className="code-inline">\n</code>{' '}
              (LF) line endings, not <code className="code-inline">\r\n</code>{' '}
              (CRLF). Windows environments may inadvertently add CR characters.
              Ensure your string builder uses explicit LF.
            </p>
          </div>
        </div>

        <div className="callout-danger flex gap-3 items-start">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm text-red-800 font-semibold mb-1">
              3. Trailing newline in signing string
            </p>
            <p className="text-sm text-red-700 mb-0">
              The signing string must <strong>not</strong> have a trailing newline
              after the digest line. If you add one, the signature will not match.
            </p>
          </div>
        </div>

        <div className="callout-danger flex gap-3 items-start">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm text-red-800 font-semibold mb-1">
              4. Key format confusion
            </p>
            <p className="text-sm text-red-700 mb-0">
              Ed25519 private keys are 64 bytes (seed + public key). Some libraries
              expect just the 32-byte seed. Make sure your key parsing matches your
              library&apos;s expectations. The keygen script outputs keys in PKCS8
              DER format encoded as Base64.
            </p>
          </div>
        </div>

        <div className="callout-danger flex gap-3 items-start">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm text-red-800 font-semibold mb-1">
              5. Body serialization mismatch
            </p>
            <p className="text-sm text-red-700 mb-0">
              The exact bytes that are hashed must match exactly what is sent over
              the wire. If you serialize JSON, sign it, then re-serialize with
              different formatting (e.g., added whitespace), the signature will fail.
              Always sign the exact string you send.
            </p>
          </div>
        </div>
      </div>

      {/* ── Next Steps ─────────────────────────────────────── */}
      <h2>Next Steps</h2>
      <ul>
        <li>
          <a href="/docs/integration">Integration Guide</a> &mdash; See signing
          in action within a complete transaction flow
        </li>
        <li>
          <a href="/docs/api">API Reference</a> &mdash; All endpoints that
          require signed requests
        </li>
      </ul>
    </div>
  );
}
