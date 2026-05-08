#!/bin/bash
# Server Setup Script for dompis_v2
# Run once on fresh VPS
# Usage: curl -sL https://raw.githubusercontent.com/user/dompis_v2/main/scripts/server-setup.sh | bash

set -e

echo "[setup] =========================================="
echo "[setup]  dompis_v2 Server Setup"
echo "[setup] =========================================="

# 1. Detect OS
if [ -f /etc/debian_version ]; then
    OS="debian"
    PKG_MANAGER="apt-get"
elif [ -f /etc/redhat-release ]; then
    OS="rhel"
    PKG_MANAGER="yum"
else
    echo "[setup] Unsupported OS. This script supports Debian/Ubuntu and RHEL/CentOS."
    exit 1
fi

echo "[setup] Detected: $OS"

# 2. Update package cache
echo "[setup] Updating package cache..."
if [ "$PKG_MANAGER" = "apt-get" ]; then
    sudo apt-get update -qq
elif [ "$PKG_MANAGER" = "yum" ]; then
    sudo yum check-update -qq || true
fi

# 3. Install prerequisites
echo "[setup] Installing prerequisites (curl, nginx, git, node, npm)..."
if [ "$PKG_MANAGER" = "apt-get" ]; then
    sudo apt-get install -y curl nginx git build-essential
elif [ "$PKG_MANAGER" = "yum" ]; then
    sudo yum install -y curl nginx git
fi

# 4. Install Node.js 20 (if not present)
if ! command -v node &> /dev/null; then
    echo "[setup] Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
    sudo apt-get install -y nodejs
fi

NODE_VERSION=$(node -v)
echo "[setup] Node version: $NODE_VERSION"

# 5. Install PM2 globally
echo "[setup] Installing PM2..."
sudo npm install -g pm2

PM2_VERSION=$(pm2 --version)
echo "[setup] PM2 version: $PM2_VERSION"

# 6. Create directories
echo "[setup] Creating directories..."
sudo mkdir -p /var/www/dompis_v2
sudo mkdir -p /var/log/dompis
sudo ln -sf /var/www/dompis_v2 /var/www/dompis 2>/dev/null || true

# Set permissions
sudo chown -R $(whoami):$(whoami) /var/www/dompis_v2
sudo chown -R $(whoami):$(whoami) /var/log/dompis

# 7. PM2 startup (auto-restart on reboot)
echo "[setup] Setting up PM2 startup..."
pm2 startup
pm2 save

# 8. Nginx configuration
NGINX_CONF="/etc/nginx/sites-available/dompis"
NGINX_ENABLED="/etc/nginx/sites-enabled/dompis"

if [ -f "$NGINX_CONF" ]; then
    echo "[setup] Backing up existing Nginx config..."
    sudo cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%s)"
fi

echo "[setup] =========================================="
echo "[setup]  Setup Complete!"
echo "[setup] =========================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. COPY nginx.conf TO SERVER:"
echo "   scp nginx.conf user@your-vps:/tmp/dompis-nginx.conf"
echo "   sudo cp /tmp/dompis-nginx.conf $NGINX_CONF"
echo "   sudo ln -sf $NGINX_CONF $NGINX_ENABLED"
echo "   sudo nginx -t"
echo "   sudo systemctl reload nginx"
echo ""
echo "2. STOP aaPanel Node Project:"
echo "   - Open aaPanel dashboard"
echo "   - Go to: Node Project Manager"
echo "   - Stop/disable the Node.js app for dompis"
echo ""
echo "3. CLONE OR LINK REPO:"
echo "   cd /var/www/dompis_v2"
echo "   git clone https://github.com/youruser/dompis_v2.git ."
echo ""
echo "4. CONFIGURE .env:"
echo "   cp .env.example .env"
echo "   # Edit .env with production values"
echo ""
echo "5. INITIAL DEPLOY:"
echo "   chmod +x deploy.sh"
echo "   ./deploy.sh"
echo ""
echo "6. VERIFY:"
echo "   pm2 status"
echo "   curl -I https://dompis.telkomakses-area3.id"
echo ""
echo "   Check logs:"
echo "   pm2 logs web --lines 20"
echo "   pm2 logs cron-worker --lines 20"
echo ""
echo "TROUBLESHOOTING:"
echo "  - Nginx 502: Check PM2 is running: pm2 status"
echo "  - Chunk failed: Purge Cloudflare cache"
echo "  - Cron not running: Verify CRON_ENABLED=true in .env"
echo ""