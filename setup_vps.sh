#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# VPS Quick Setup Script for Ocean Way Tours Hotel Rate Sheet Hunter
# Tested on Ubuntu 22.04 / 24.04 LTS & Debian 12
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "🚀 Updating package index..."
sudo apt update -y && sudo apt upgrade -y

echo "📦 Installing Node.js 20 LTS (if not installed)..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

echo "✔ Node version: $(node -v)"
echo "✔ NPM version: $(npm -v)"

echo "📦 Installing Chrome & Puppeteer dependencies for WhatsApp on VPS..."
sudo apt install -y \
  ca-certificates \
  fonts-liberation \
  libasound2t64 || sudo apt install -y libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils

echo "📦 Installing PM2 process manager..."
sudo npm install -g pm2

echo "📦 Installing project dependencies..."
npm install

echo "📂 Creating rate_sheets directory..."
mkdir -p rate_sheets/3_star rate_sheets/4_star rate_sheets/5_star

echo "🚀 Starting app with PM2..."
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

echo "════════════════════════════════════════════════════════════════"
echo "✅ Ocean Way Tours Rate Hunter is RUNNING on your VPS!"
echo "👉 Open http://YOUR_VPS_IP:3000 in your browser to access the dashboard."
echo "════════════════════════════════════════════════════════════════"
