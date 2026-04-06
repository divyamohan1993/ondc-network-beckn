# Known Limits -- Regulatory & External Dependencies

These items require organizational/legal action and cannot be resolved through code changes alone.

## ONDC Network Participant Registration
- **DPIIT approval** -- register legal entity with Dept for Promotion of Industry & Internal Trade
- **NP Agreement** -- sign the ONDC Network Participant Agreement
- **Pramaan certification** -- pass ONDC's automated compliance test suite at pramaan.ondc.org
- **KYC verification** -- submit GST, PAN, authorized signatory details via ONDC portal
- **Domain whitelisting** -- subscriber_id domain must be approved by ONDC

## NBBL / NOCS Settlement
- **NBBL registration** -- register with NPCI Bharat BillPay Ltd for NOCS onboarding
- **Settlement bank account** -- dedicated ONDC settlement account required
- **Settlement Agency agreement** -- bilateral agreement with designated SA

## Payment Gateway
- **Merchant account** -- required with Razorpay/PayU/Paytm for payment collection
- **PCI-DSS compliance** -- if handling card data directly (avoided with hosted checkout)
- **UPI integration** -- NPCI approval for UPI collect/intent flows

## Legal Compliance (Operational)
- **GRO appointment** -- Grievance Redressal Officer required under Consumer Protection Act 2019
- **DPO appointment** -- Data Protection Officer required under DPDPA 2023 (if significant data fiduciary)
- **CERT-In reporting relationship** -- establish incident reporting channel with CERT-In
- **GST registration** -- GSTIN required for the operating entity
- **Consumer forum registration** -- prepare for consumer dispute resolution

## Infrastructure
- **SSL certificates** -- production Let's Encrypt or commercial CA certificate (self-signed won't pass ONDC OCSP validation)
- **Domain setup** -- DNS A/AAAA records, TXT records with signing public key
- **India region deployment** -- DPDPA requires Indian personal data to be processed in India (aws ap-south-1, gce asia-south1)
- **RabbitMQ** -- required for BAP action queue (reliable BPP delivery with retry/DLQ). Deploy with HA policy in production.
- **Redis** -- required for webhook registrations, rate limiting, catalog cache. Deploy with persistence (AOF/RDB) and Sentinel/Cluster for HA.

## Dependency Audit (Residual)
- **esbuild <=0.24.2** -- moderate severity, transitive via drizzle-kit (dev-only tool). Risk: dev server CORS bypass. No production impact. Will resolve when drizzle-kit updates its bundled esbuild-kit dependency.

## Rate Limiting
- **In-memory rate limiter** -- buyer-app and seller-app use Map-based in-memory rate limiting. Works for single-instance deployments. For horizontal scaling behind a load balancer, replace with Redis-backed rate limiting to share state across instances.
