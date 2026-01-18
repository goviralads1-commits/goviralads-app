#!/bin/bash
# GoViralAds SSL Setup Script (Let's Encrypt + Certbot)
# Usage: chmod +x ssl-setup.sh && sudo ./ssl-setup.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOMAIN="goviralads.com"
EMAIL="admin@goviralads.com"  # Change this to your email

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SSL Setup (Let's Encrypt)${NC}"
echo -e "${GREEN}========================================${NC}"

# Step 1: Install Certbot
echo -e "${YELLOW}[1/4] Installing Certbot...${NC}"
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Step 2: Stop Nginx temporarily (for standalone mode)
echo -e "${YELLOW}[2/4] Obtaining certificates...${NC}"
sudo systemctl stop nginx

# Step 3: Get certificate for all domains
sudo certbot certonly --standalone \
    -d $DOMAIN \
    -d www.$DOMAIN \
    -d admin.$DOMAIN \
    -d app.$DOMAIN \
    -d api.$DOMAIN \
    --email $EMAIL \
    --agree-tos \
    --non-interactive

# Step 4: Restart Nginx
echo -e "${YELLOW}[3/4] Restarting Nginx...${NC}"
sudo systemctl start nginx
sudo systemctl reload nginx

# Step 5: Setup auto-renewal
echo -e "${YELLOW}[4/4] Setting up auto-renewal...${NC}"
sudo certbot renew --dry-run

# Add cron job for auto-renewal
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SSL Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Certificates location: /etc/letsencrypt/live/$DOMAIN/"
echo "Auto-renewal: Enabled (daily at 3 AM)"
echo ""
echo "Test HTTPS:"
echo "  https://admin.$DOMAIN"
echo "  https://app.$DOMAIN"
echo "  https://api.$DOMAIN"
