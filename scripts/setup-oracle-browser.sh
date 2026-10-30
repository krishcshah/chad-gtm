#!/usr/bin/env bash
# Install a headless Chromium for the AutoGTM crawler fallback.
# Idempotent. Supports both x86_64 (Google Chrome .deb) and ARM64 (Chromium snap).
set -e

find_browser() {
  for candidate in chromium-browser chromium google-chrome /snap/bin/chromium; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

if EXISTING="$(find_browser)"; then
  echo "Browser already installed: $EXISTING"
  echo "PUPPETEER_EXECUTABLE_PATH=$EXISTING"
  exit 0
fi

ARCH="$(uname -m)"
echo "No browser found. Architecture: $ARCH"

if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  echo "Installing Chromium for ARM64..."
  sudo apt-get update -y
  # Ubuntu ships chromium-browser as a snap transitional package.
  if sudo apt-get install -y chromium-browser; then
    :
  else
    echo "apt package failed; trying snap directly..."
    sudo snap install chromium
  fi
else
  echo "Installing Google Chrome (stable) for x86_64..."
  sudo apt-get update -y
  sudo apt-get install -y wget gnupg ca-certificates

  wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
    | sudo gpg --dearmor --yes -o /usr/share/keyrings/google-chrome.gpg

  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    | sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null

  sudo apt-get update -y
  sudo apt-get install -y google-chrome-stable
fi

BROWSER="$(find_browser || true)"
if [ -z "$BROWSER" ]; then
  echo "ERROR: browser installation did not produce a usable binary." >&2
  exit 1
fi

echo "Installed: $BROWSER"
echo "Add this to apps/web/.env.local (or the PM2 env):"
echo "PUPPETEER_EXECUTABLE_PATH=$BROWSER"
echo "Then: pm2 restart chadgtm-web --update-env"
