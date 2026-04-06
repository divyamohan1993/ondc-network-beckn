#!/usr/bin/env bash
# =============================================================================
# ONDC Platform — VM Startup Script (called by Terraform)
# =============================================================================
# This script runs as root on first boot. It installs everything and starts
# the platform. Takes ~5-8 minutes on e2-standard-4.
# =============================================================================

set -euo pipefail
exec > /var/log/ondc-deploy.log 2>&1

DOMAIN="${domain}"
DATAGOVIN_KEY="${datagovin_key}"
REPO_URL="${repo_url}"
DEPLOY_USER="$(ls /home/ | head -1)"
DEPLOY_DIR="/home/$DEPLOY_USER/ondc-network-beckn"

echo "=== ONDC Deploy: Starting at $(date) ==="
echo "Domain: $DOMAIN"
echo "User: $DEPLOY_USER"

# ---------------------------------------------------------------------------
# 1. System packages
# ---------------------------------------------------------------------------
echo "=== Installing system packages ==="
apt-get update -qq
apt-get install -y -qq curl git nginx postgresql redis-server rabbitmq-server openssl

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs

# pnpm + PM2
npm install -g pnpm@10.30.1 pm2

echo "=== System packages installed ==="

# ---------------------------------------------------------------------------
# 2. Clone repository
# ---------------------------------------------------------------------------
echo "=== Cloning repository ==="
sudo -u "$DEPLOY_USER" git clone "$REPO_URL" "$DEPLOY_DIR"

# ---------------------------------------------------------------------------
# 3. Generate configuration
# ---------------------------------------------------------------------------
echo "=== Generating configuration ==="
cd "$DEPLOY_DIR"

generate_secret() { openssl rand -base64 "$1" | tr -d '=/+' | head -c "$1"; }
generate_hex()    { openssl rand -hex "$1"; }

POSTGRES_PASSWORD=$(generate_secret 30)
RABBITMQ_PASSWORD=$(generate_secret 30)

cat > .env << ENVFILE
DOMAIN=$DOMAIN
NODE_ENV=production
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=ondc
POSTGRES_USER=ondc_admin
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DATABASE_URL=postgresql://ondc_admin:$POSTGRES_PASSWORD@localhost:5432/ondc
REDIS_URL=redis://localhost:6379
RABBITMQ_PASSWORD=$RABBITMQ_PASSWORD
RABBITMQ_URL=amqp://ondc:$RABBITMQ_PASSWORD@localhost:5672
REGISTRY_PORT=3001
GATEWAY_PORT=3002
BAP_PORT=3003
BPP_PORT=3004
VAULT_PORT=3006
HEALTH_MONITOR_PORT=3007
REGISTRY_SUBSCRIBER_ID=registry.$DOMAIN
GATEWAY_SUBSCRIBER_ID=gateway.$DOMAIN
BAP_ID=bap.$DOMAIN
BAP_URI=https://$DOMAIN/api/bap
BPP_ID=bpp.$DOMAIN
BPP_URI=https://$DOMAIN/api/bpp
REGISTRY_SIGNING_PRIVATE_KEY=$(generate_secret 44)
REGISTRY_SIGNING_PUBLIC_KEY=$(generate_secret 44)
GATEWAY_SIGNING_PRIVATE_KEY=$(generate_secret 44)
GATEWAY_SIGNING_PUBLIC_KEY=$(generate_secret 44)
BAP_PRIVATE_KEY=$(generate_secret 44)
BAP_PUBLIC_KEY=$(generate_secret 44)
BAP_UNIQUE_KEY_ID=key-$(generate_hex 4)
BPP_PRIVATE_KEY=$(generate_secret 44)
BPP_PUBLIC_KEY=$(generate_secret 44)
BPP_UNIQUE_KEY_ID=key-$(generate_hex 4)
VAULT_MASTER_KEY=$(generate_hex 32)
VAULT_TOKEN_SECRET=$(generate_hex 32)
VAULT_API_KEY=$(generate_hex 32)
PII_ENCRYPTION_KEY=$(generate_hex 32)
ADMIN_EMAIL=admin@$DOMAIN
ADMIN_PASSWORD=$(generate_secret 20)
ADMIN_NAME=admin
ADMIN_TOKEN=$(generate_hex 32)
NEXTAUTH_SECRET=$(generate_hex 32)
NEXTAUTH_URL=https://$DOMAIN/admin
INTERNAL_API_KEY=$(generate_hex 32)
LOG_LEVEL=info
CORS_ALLOWED_ORIGINS=https://$DOMAIN
PAYMENT_GATEWAY=mock
SMS_PROVIDER=mock
HEALTH_CHECK_URLS=Registry=http://localhost:3001,Gateway=http://localhost:3002,BAP=http://localhost:3003,BPP=http://localhost:3004,Vault=http://localhost:3006
RESPONSE_THRESHOLD_MS=5000
CHECK_INTERVAL_MS=30000
DATAGOVIN=$DATAGOVIN_KEY
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=5000
ENVFILE

chown "$DEPLOY_USER":"$DEPLOY_USER" .env

# ---------------------------------------------------------------------------
# 4. PostgreSQL
# ---------------------------------------------------------------------------
echo "=== Setting up PostgreSQL ==="
sudo -u postgres psql -c "CREATE USER ondc_admin WITH PASSWORD '$POSTGRES_PASSWORD';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE ondc OWNER ondc_admin;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ondc TO ondc_admin;" 2>/dev/null || true
sudo -u postgres psql -d ondc -f db/init.sql 2>&1 | tail -5
sudo -u postgres psql -d ondc -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO ondc_admin;"
sudo -u postgres psql -d ondc -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ondc_admin;"

# ---------------------------------------------------------------------------
# 5. RabbitMQ
# ---------------------------------------------------------------------------
echo "=== Setting up RabbitMQ ==="
rabbitmqctl add_user ondc "$RABBITMQ_PASSWORD" 2>/dev/null || true
rabbitmqctl set_permissions ondc ".*" ".*" ".*" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 6. Build
# ---------------------------------------------------------------------------
echo "=== Installing dependencies and building ==="
sudo -u "$DEPLOY_USER" bash -c "cd $DEPLOY_DIR && pnpm install 2>&1 | tail -3"
sudo -u "$DEPLOY_USER" bash -c "cd $DEPLOY_DIR && pnpm turbo build 2>&1 | tail -5"

# ---------------------------------------------------------------------------
# 7. nginx
# ---------------------------------------------------------------------------
echo "=== Configuring nginx ==="
cat > /etc/nginx/sites-available/ondc << 'NGINX'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER _;
    client_max_body_size 20m;

    # Landing page (docs app serves /)
    location / {
        proxy_pass http://127.0.0.1:3015;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Buyer app at /shop (basePath: /shop)
    location /shop {
        proxy_pass http://127.0.0.1:3012;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Seller dashboard (basePath: /seller)
    location /seller {
        proxy_pass http://127.0.0.1:3013;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Admin panel (basePath: /admin)
    location /admin {
        proxy_pass http://127.0.0.1:3014;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Docs + Pitch (served by docs app, already handled by / catch-all, but explicit for _next)
    location /pitch { proxy_pass http://127.0.0.1:3015/pitch; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
    location /docs  { proxy_pass http://127.0.0.1:3015/docs;  proxy_set_header Host $host; }

    location /auth/     { proxy_pass http://127.0.0.1:3003/auth/;     proxy_set_header Host $host; }
    location /registry/ { proxy_pass http://127.0.0.1:3001/;          proxy_set_header Host $host; }
    location /gateway/  { proxy_pass http://127.0.0.1:3002/;          proxy_set_header Host $host; }
    location /api/bap/  { proxy_pass http://127.0.0.1:3003/;          proxy_set_header Host $host; }
    location /api/bpp/  { proxy_pass http://127.0.0.1:3004/;          proxy_set_header Host $host; }
}
NGINX

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/ondc
ln -sf /etc/nginx/sites-available/ondc /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ---------------------------------------------------------------------------
# 8. Start with PM2
# ---------------------------------------------------------------------------
echo "=== Starting services ==="

# Source env
set -a
source "$DEPLOY_DIR/.env"
set +a

# Start as deploy user
sudo -u "$DEPLOY_USER" bash -c "
  cd $DEPLOY_DIR
  set -a && source .env && set +a

  pm2 kill 2>/dev/null || true

  pm2 start dist/server.js --name registry       --cwd packages/registry
  pm2 start dist/server.js --name gateway        --cwd packages/gateway
  pm2 start dist/server.js --name bap            --cwd packages/bap
  pm2 start dist/server.js --name bpp            --cwd packages/bpp
  pm2 start dist/server.js --name vault          --cwd packages/vault
  pm2 start dist/server.js --name health-monitor --cwd packages/health-monitor

  pm2 start 'npx next start -p 3012' --name buyer-app  --cwd packages/buyer-app
  pm2 start 'npx next start -p 3013' --name seller-app --cwd packages/seller-app
  pm2 start 'npx next start -p 3014' --name admin      --cwd packages/admin
  pm2 start 'npx next start -p 3015' --name docs       --cwd packages/docs

  pm2 save
"

# Enable PM2 auto-start
env PATH=\$PATH:/usr/bin pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 9. Seed pincodes
# ---------------------------------------------------------------------------
if [ -n "$DATAGOVIN_KEY" ]; then
  echo "=== Seeding pincode database ==="
  sudo -u "$DEPLOY_USER" bash -c "cd $DEPLOY_DIR && set -a && source .env && set +a && npx tsx scripts/src/seed-pincodes.ts 2>&1 | tail -3"
fi

echo "=== ONDC Deploy: Complete at $(date) ==="
echo "=== Platform URL: https://$DOMAIN/ ==="
echo "=== Admin: https://$DOMAIN/admin/ ==="
echo "=== Check logs: cat /var/log/ondc-deploy.log ==="
