#!/bin/bash
set -e
AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$AGENT_DIR"
echo "→ Pulling latest..."
git pull origin main
echo "→ Installing dependencies..."
npm install --omit=dev
echo "→ Restarting with PM2..."
if pm2 describe social-agent > /dev/null 2>&1; then
  pm2 restart social-agent
else
  pm2 start src/agent.js --name social-agent --restart-delay=5000
  pm2 save
fi
echo "✓ Done."
pm2 status social-agent
