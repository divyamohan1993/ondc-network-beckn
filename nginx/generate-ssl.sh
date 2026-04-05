#!/bin/sh
# Generate self-signed SSL certificate for development/staging.
# For production, replace with certs from a real CA (e.g. Let's Encrypt).

set -e

SSL_DIR="$(dirname "$0")/ssl"
mkdir -p "$SSL_DIR"

if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
  echo "SSL certificates already exist in $SSL_DIR. Skipping generation."
  echo "Delete them and re-run to regenerate."
  exit 0
fi

DOMAIN="${DOMAIN:-ondc.dmj.one}"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$SSL_DIR/key.pem" \
  -out "$SSL_DIR/cert.pem" \
  -subj "/CN=*.$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN,DNS:*.$DOMAIN,DNS:localhost"

echo "Self-signed SSL certificate generated in $SSL_DIR"
echo "  cert: $SSL_DIR/cert.pem"
echo "  key:  $SSL_DIR/key.pem"
