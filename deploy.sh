#!/bin/bash
# ========================================
# Dompis VPS Deployment Script
# ========================================
# Usage: ./deploy.sh [domain]
# Example: ./deploy.sh dompis.ta-branchsby.co.id

set -e

DOMAIN=${1:-dompis.ta-branchsby.co.id}
PROJECT_DIR="/var/www/dompis"

echo "========================================"
echo "  Dompis VPS Deployment Script"
echo "========================================"
echo "Domain: $DOMAIN"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: sudo ./deploy.sh $DOMAIN"
  exit 1
fi

# 1. Create project directory
echo "[1/7] Creating project directory..."
mkdir -p $PROJECT_DIR

# 2. Copy files (assuming mounted from host)
# This script expects project files to be copied manually or via git
echo "[2/7] Project directory ready at $PROJECT_DIR"
echo "      Please copy project files to this directory first"

# 3. Create .env file if not exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "[3/7] Creating .env file..."
  if [ -f ".env.production" ]; then
    cp .env.production $PROJECT_DIR/.env
    echo "      Copied .env.production to .env"
    echo "      Please edit $PROJECT_DIR/.env and update:"
    echo "        - JWT_ACCESS_SECRET"
    echo "        - JWT_REFRESH_SECRET"
    echo "        - NEXTAUTH_SECRET"
    echo "        - CRON_SECRET"
    echo "        - TECH_EVENTS_WEBHOOK_SECRET"
  else
    echo "      ERROR: .env.production not found!"
    exit 1
  fi
else
  echo "[3/7] .env file already exists"
fi

# 4. Install Docker if not exists
echo "[4/7] Checking Docker..."
if ! command -v docker &> /dev/null; then
  echo "      Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl start docker
  systemctl enable docker
fi

# 5. Install Docker Compose if not exists
if ! command -v docker-compose &> /dev/null; then
  echo "      Installing Docker Compose..."
  curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

# 6. Build and start containers
echo "[5/7] Building and starting containers..."
cd $PROJECT_DIR
docker-compose -f docker-compose.prod.yml build app

echo "[6/7] Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# 7. Setup Nginx with SSL
echo "[7/7] Setting up Nginx + SSL..."
if ! command -v nginx &> /dev/null; then
  echo "      Installing Nginx..."
  apt update && apt install -y nginx
fi

# Create Nginx config
cat > /etc/nginx/sites-available/dompis <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/dompis /etc/nginx/sites-enabled/
nginx -t

# Get SSL certificate
echo ""
echo "========================================"
echo "  SSL Certificate Setup"
echo "========================================"
echo "Please run manually:"
echo "  certbot --nginx -d $DOMAIN"
echo ""
echo "Or if certbot is installed:"
echo "  certbot --nginx -d $DOMAIN --redirect"
echo ""

# Show status
echo "========================================"
echo "  Deployment Complete!"
echo "========================================"
echo ""
echo "Container Status:"
docker ps --filter "name=dompis" --format "  {{.Names}}: {{.Status}}"
echo ""
echo "Nginx Status:"
systemctl status nginx --no-pager | head -3
echo ""
echo "Next steps:"
echo "  1. Edit .env and update secret keys"
echo "  2. Run: certbot --nginx -d $DOMAIN --redirect"
echo "  3. Import database: docker exec -i dompis_mysql mysql -u dompis_user -pdompis_password dompis_db < dompis_db.sql"
echo "  4. Copy uploads: cp -r uploads/* $PROJECT_DIR/public/uploads/"
echo ""