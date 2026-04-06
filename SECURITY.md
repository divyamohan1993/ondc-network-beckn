# Security Policy

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Email [contact@dmj.one](mailto:contact@dmj.one) with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge within 48 hours and provide a fix timeline.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.0.x | Yes |
| 1.1.x | Yes |
| 1.0.x | Security fixes only |

---

## Security Architecture

### Cryptographic Signing (Ed25519)

- Ed25519 signatures on all Beckn protocol messages
- BLAKE-512 request body hashing
- Configurable signature TTL (default: 300 seconds)
- Automatic signing key rotation (default: 30 days)

### Post-Quantum Cryptography (Opt-in)

When `PQ_CRYPTO_ENABLED=true` with `@noble/post-quantum` installed:

- **ML-DSA-65** (FIPS 204) -- digital signatures, 192-bit security level. Every message gets both an Ed25519 and ML-DSA-65 signature. Both must verify.
- **ML-KEM-768** (FIPS 203) -- key encapsulation, 192-bit security level. Hybrid with X25519. Both layers must agree on the shared secret.
- **Graceful degradation** -- if the PQ library is unavailable or fails to load, the system falls back to classical-only and logs a warning. No service disruption.

Key sizes: ML-DSA-65 public key is 1952 bytes, signature is 3309 bytes. ML-KEM-768 public key is 1184 bytes, ciphertext is 1088 bytes.

### PII Field-Level Encryption

The PII guard encrypts personal data in Beckn messages before storage:

- **Encrypted fields**: billing name, phone, email, address; fulfillment contact phone/email; fulfillment location address
- **Algorithm**: AES-256-GCM with random IV per field
- **Format**: `PII:<base64(iv + authTag + ciphertext)>`
- **Key derivation**: PBKDF2 from configurable master key

Non-PII fields pass through unchanged. Decryption is transparent -- non-prefixed strings are returned as-is.

### Secret Management (Vault)

- AES-256-GCM authenticated encryption for stored secrets
- PBKDF2 key derivation from master key
- HMAC-SHA256 service authentication tokens
- Automatic password rotation (default: 24 hours)
- Automatic signing key rotation (default: 30 days)
- Zero static secrets -- all credentials generated at deploy time

### Key Transparency Log

The Registry maintains an append-only log of all public key changes:

- Records key registration, rotation, and revocation events
- Each entry is signed with the registry's Ed25519 private key
- Sequential numbering for tamper evidence
- Inspired by Certificate Transparency (CT) logs
- Allows network participants to verify that key responses are consistent over time

### Network Security

- **Rate limiting**: Nginx IP-based (30 req/s API, 10 req/s admin) + Redis subscriber-based application-layer limiting
- **Message deduplication**: 5-minute TTL, prevents replay attacks
- **Security headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy on all responses
- **Internal network**: services communicate via Docker bridge network, not exposed to public
- **Inter-service auth**: `x-internal-api-key` header with 64-byte random hex token

### Authentication

- **Admin panel**: NextAuth with bcrypt-hashed passwords, role-based access (SUPER_ADMIN, ADMIN, VIEWER)
- **Vault access**: HMAC-SHA256 scoped service tokens
- **Beckn protocol**: Ed25519 signature verification on every message

### DPDPA Compliance Features

The compliance module (`@ondc/shared/compliance/dpdpa`) provides:

- **Consent notice generation** per Section 5 -- structured notices in plain language
- **Data principal rights** tracking -- access, correction, erasure, nomination, grievance (Section 8)
- **Breach notification deadlines** -- 72-hour CERT-In notification calculation (Section 12)
- **Fiduciary obligation checker** -- gap analysis against Section 9 requirements
- **Cross-border transfer validation** -- checks against Central Government restricted country list (Section 11)
- **Legitimate use classification** -- Section 6 categories (voluntary provision, state function, legal obligation, medical emergency, employment)

### CERT-In Incident Reporting Framework

The IT Act compliance module (`@ondc/shared/compliance/it-act`) provides:

- **Incident severity classification**: CRITICAL (6h), HIGH (24h), MEDIUM (72h), LOW (log only)
- **Reportable incident types**: per CERT-In Directions of 28 April 2022 (targeted scanning, system compromise, malware, DDoS, etc.)
- **Incident tracking types**: structured interfaces for recording detection, investigation, mitigation, and resolution

Note: actual CERT-In reporting requires an established relationship with CERT-In. See [KNOWN_LIMITS.md](KNOWN_LIMITS.md).

---

## Best Practices for Operators

1. **Use `autoconfig.sh`** -- generates cryptographically random secrets
2. **Never commit `.env`** -- it contains all secrets
3. **Enable production mode** -- restart policies, memory limits, monitoring
4. **Set up SSL/TLS** -- see [DEPLOYMENT.md](DEPLOYMENT.md#ssltls-setup)
5. **Restrict Vault access** -- only expose internally
6. **Monitor alerts** -- review Health Monitor alerts in the Admin Dashboard
7. **Verify key rotation** -- the platform rotates credentials automatically; verify it's running
8. **Keep Docker updated** -- patch container vulnerabilities
9. **Deploy in India region** -- DPDPA requires Indian personal data processed in India
10. **Consider `PQ_CRYPTO_ENABLED`** -- enable post-quantum for forward secrecy against quantum threats
