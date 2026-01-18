#!/bin/bash
# GoViralAds VPS Deployment Script
# Target: Hostinger VPS (Ubuntu 22.04+)
# Usage: chmod +x deploy.sh && ./deploy.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  GoViralAds Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Variables
APP_DIR="/var/www/goviralads"
REPO_URL="YOUR_GIT_REPO_URL"  # Replace with your repo

# Step 1: System Update
echo -e "${YELLOW}[1/10] Updating system...${NC}"
sudo apt update && sudo apt upgrade -y

# Step 2: Install Node.js 20.x
echo -e "${YELLOW}[2/10] Installing Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version

# Step 3: Install PM2
echo -e "${YELLOW}[3/10] Installing PM2...${NC}"
sudo npm install -g pm2

# Step 4: Install Nginx
echo -e "${YELLOW}[4/10] Installing Nginx...${NC}"
sudo apt install -y nginx
sudo systemctl enable nginx

# Step 5: Install MongoDB (optional - use Atlas for production)
echo -e "${YELLOW}[5/10] Installing MongoDB (skip if using Atlas)...${NC}"
# Uncomment if you want local MongoDB
# wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
# echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
# sudo apt update && sudo apt install -y mongodb-org
# sudo systemctl start mongod && sudo systemctl enable mongod

# Step 6: Create app directory
echo -e "${YELLOW}[6/10] Setting up directories...${NC}"
sudo mkdir -p $APP_DIR
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER $APP_DIR
sudo chown -R $USER:$USER /var/log/pm2

# Step 7: Clone/copy project
echo -e "${YELLOW}[7/10] Deploying code...${NC}"
if [ -d "$APP_DIR/.git" ]; then
    cd $APP_DIR && git pull origin main
else
    # If you're uploading manually, skip this
    echo "Copy your project files to $APP_DIR"
    # git clone $REPO_URL $APP_DIR
fi

# Step 8: Install dependencies
echo -e "${YELLOW}[8/10] Installing dependencies...${NC}"
cd $APP_DIR
npm install --production

# Build frontends
cd $APP_DIR/frontend/admin-panel
npm install && npm run build

cd $APP_DIR/frontend/client-app
npm install && npm run build

# Step 9: Configure environment
echo -e "${YELLOW}[9/10] Setting up environment...${NC}"
cd $APP_DIR
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${RED}IMPORTANT: Edit .env with production values!${NC}"
    echo "nano $APP_DIR/.env"
fi

# Step 10: Start with PM2
echo -e "${YELLOW}[10/10] Starting application...${NC}"
cd $APP_DIR
pm2 delete goviralads-api 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Edit .env: nano $APP_DIR/.env"
echo "2. Setup Nginx: sudo cp $APP_DIR/nginx/goviralads.conf /etc/nginx/sites-available/"
echo "3. Enable site: sudo ln -s /etc/nginx/sites-available/goviralads.conf /etc/nginx/sites-enabled/"
echo "4. Test Nginx: sudo nginx -t"
echo "5. Reload Nginx: sudo systemctl reload nginx"
echo "6. Setup SSL: ./ssl-setup.sh"
echo ""
pm2 status
