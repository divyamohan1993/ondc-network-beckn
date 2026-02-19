# Security Policy

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

If you discover a security vulnerability, please report it responsibly:

1. **Email:** Send details to [contact@dmj.one](mailto:contact@dmj.one)
2. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge your report within 48 hours and provide a timeline for a fix.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x | Yes |

## Security Architecture

This project implements multiple layers of security:

### Cryptographic Signing
- **Ed25519** signatures on all Beckn protocol messages
- **BLAKE-512** request body hashing
- Configurable signature TTL (default: 300 seconds)
- Automatic signing key rotation (default: 30 days)

### Secret Management
- **AES-256-GCM** authenticated encryption for stored secrets
- **PBKDF2** key derivation from master key
- **HMAC-SHA256** service authentication tokens
- Automatic password rotation (default: 24 hours)
- Zero static secrets — all credentials generated at deploy time

### Network Security
- **Rate limiting** at Nginx (IP-based: 30 req/s API, 10 req/s admin)
- **Rate limiting** at application layer (per-subscriber via Redis)
- **Message deduplication** with 5-minute TTL (prevents replay attacks)
- **Security headers** on all responses (X-Frame-Options, X-Content-Type-Options, etc.)
- Internal services communicate via Docker bridge network (not exposed)

### Authentication
- **Inter-service:** `x-internal-api-key` header with 64-byte random hex token
- **Admin panel:** NextAuth with bcrypt-hashed passwords
- **Vault access:** HMAC-SHA256 scoped service tokens

### Data Protection
- Database credentials never stored in plain text
- `.env` file excluded from version control
- Docker secrets for sensitive configuration
- Audit logging for all administrative actions

## Best Practices for Operators

1. **Always use `autoconfig.sh`** — It generates cryptographically random secrets
2. **Never commit `.env`** — It contains all secrets
3. **Enable production mode** — Adds restart policies and disables simulation
4. **Set up SSL/TLS** — See [DEPLOYMENT.md](DEPLOYMENT.md#ssltls-setup)
5. **Restrict Vault access** — Only expose internally in production
6. **Monitor alerts** — Review Health Monitor alerts regularly
7. **Rotate keys** — The platform supports automatic rotation; verify it's enabled
8. **Keep Docker updated** — Patch container vulnerabilities promptly
