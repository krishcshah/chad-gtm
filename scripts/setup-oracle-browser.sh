#!/usr/bin/env bash
# Install a headless Chromium for the AutoGTM crawler fallback (Oracle Ubuntu).
# Idempotent: safe to run on every deploy or manually once.
set -e

if command -v chromium-browser >/dev/null 2>&1; then
  echo "Chromium already installed: $(command -v chromium-browser)"
  exit 0
fi
if command -v chromium >/dev/null 2>&1; then
  echo "Chromium already installed: $(command -v chromium)"
  exit 0
fi
if command -v google-chrome >/dev/null 2>&1; then
  echo "Google Chrome already installed: $(command -v google-chrome)"
  exit 0
fi

echo "Installing Google Chrome (stable) for puppeteer-core..."
sudo apt-get update -y
sudo apt-get install -y wget gnupg ca-certificates

wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
  | sudo gpg --dearmor --yes -o /usr/share/keyrings/google-chrome.gpg

echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
  | sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null

sudo apt-get update -y
sudo apt-get install -y google-chrome-stable

echo "Installed: $(command -v google-chrome)"
echo "Add this to apps/web/.env.local (or the PM2 env):"
echo "PUPPETEER_EXECUTABLE_PATH=$(command -v google-chrome)"
echo "Then: pm2 restart chadgtm-web --update-env"
