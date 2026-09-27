#!/usr/bin/env bash
# ==============================================================================
# SmartReach Oracle Cloud Always-Free Worker Setup Script
# Automatically provisions an Ubuntu 24.04/22.04 Ampere A1 instance to run the
# background email engine worker 24/7/365 with zero downtime.
# ==============================================================================

set -e

echo "=================================================="
echo "🚀 Setting up SmartReach Email Engine Worker..."
echo "=================================================="

# 1. Update OS packages
echo "📦 Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y curl git build-essential

# 2. Install Node.js 22 LTS
echo "📦 Installing Node.js 22 LTS..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

# 3. Install PM2 (Process Manager)
echo "📦 Installing PM2 globally..."
sudo npm install -g pm2

# 4. Clone or update repository
APP_DIR="$HOME/smart-reach"
if [ ! -d "$APP_DIR" ]; then
  echo "📥 Cloning repository..."
  read -p "Enter your GitHub Repository URL (or press Enter for default): " REPO_URL
  REPO_URL=${REPO_URL:-"https://github.com/krishcshah/smart-reach.git"}
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# 5. Install dependencies and build engine
echo "🔨 Installing workspace dependencies..."
npm install

echo "🔨 Building packages..."
npm run build --workspace=@smartreach/database
npm run build --workspace=@smartreach/email-engine

# 6. Configure environment
if [ ! -f "packages/email-engine/.env" ]; then
  echo "⚙️ Configuring environment variables..."
  read -p "Enter your DATABASE_URL (Neon PostgreSQL): " DB_URL
  read -p "Enter your BETTER_AUTH_SECRET: " AUTH_SECRET

  cat <<EOF > packages/email-engine/.env
DATABASE_URL=$DB_URL
BETTER_AUTH_SECRET=$AUTH_SECRET
APP_URL=https://smart-reach-staging.vercel.app
ENGINE_INTERVAL_MS=30000
ENGINE_SYNC_MS=120000
EOF
  echo "✅ packages/email-engine/.env created."
fi

# 7. Start worker under PM2
echo "🚀 Starting SmartReach engine worker under PM2..."
pm2 delete smartreach-worker 2>/dev/null || true
pm2 start npm --name "smartreach-worker" -- run worker --prefix packages/email-engine

# 8. Configure PM2 to start on system boot
echo "🔒 Enabling PM2 startup on system boot..."
pm2 save
pm2 startup systemd -u $USER --hp $HOME | tail -n 1 | sudo bash || true

echo "=================================================="
echo "🎉 SUCCESS! SmartReach engine worker is running 24/7."
echo "Check status anytime with:  pm2 status"
echo "View live logs anytime with: pm2 logs smartreach-worker"
echo "=================================================="
