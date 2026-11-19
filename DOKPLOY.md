# 🐳 Deploying Seranex Lanka Solutions on Dokploy (24/7 Hosting Guide)

This guide shows you how to deploy the entire **Seranex Lanka Solutions** Autonomous B2B Lead Hunter & Sales Closer on your **Dokploy Panel** for permanent 24/7 operation with automatic SSL, container monitoring, and WhatsApp session persistence.

---

## 🚀 Option 1: Deploy with Docker Compose (Recommended in Dokploy)

Dokploy has native support for Docker Compose projects with volume persistence.

### Step 1: Create a Compose Project in Dokploy
1. Log in to your **Dokploy Panel**.
2. Click **Create Project** (or open your existing Project).
3. Click **Add Service** &rarr; Select **Compose**.
4. Name the service: `seranex-lanka-solutions`.

### Step 2: Connect Git Repository
1. In the **Source** tab, choose **Git**.
2. Repository URL: `https://github.com/chithilamanul1/outreach.git`
3. Branch: `main`
4. Build Type: `docker-compose` (Dokploy will automatically read [`docker-compose.yml`](file:///d:/desktop/Outreach%20-%20sera/docker-compose.yml)).

### Step 3: Set Environment Variables in Dokploy
Under the **Environment** tab in Dokploy, paste:

```env
NODE_ENV=production
PORT=3000
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Agency Identity
AGENCY_NAME="Seranex Lanka Solutions"
AGENCY_PHONE="0728382638"
AGENCY_WEBSITE="https://seranex.lk"
ADMIN_WHATSAPP_NUMBER="94728382638"
BOT_WHATSAPP_NUMBER="94760602638"
WHATSAPP_AUTO_SEND="true"
RESEND_API_KEY="your_resend_api_key_here"
EMAIL_FROM="sales@seranex.lk"

# APIs & Models
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=google/gemini-2.5-flash

# Discord Real-Time Alerts
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_HOT_LEADS_WEBHOOK=https://discord.com/api/webhooks/...

# SMTP Email Dispatcher (Hostinger / cPanel / Titan)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=hello@seranex.lk
SMTP_PASS=your_mailbox_password_here
```

### Step 4: Add Domain & SSL
1. Under **Domains** tab in Dokploy:
   - Add your domain or subdomain (e.g., `outreach.seranex.lk` or `crm.seranex.lk`).
   - Set Container Port: `3000`.
   - Enable **HTTPS / Let's Encrypt** SSL (Dokploy generates free SSL automatically).

### Step 5: Deploy!
Click **Deploy**. Dokploy will:
1. Pull the repository.
2. Build the Docker container with headless Chromium, Node 20, and all dependencies.
3. Start the 24/7 Command Center with automatic health monitoring on `/api/health`.

---

## 📱 Option 2: Deploy as a Standalone Application (Dockerfile)

If you prefer deploying as a single Dokploy Application rather than Compose:

1. Click **Add Service** &rarr; Select **Application**.
2. Choose **Git Provider** (`https://github.com/chithilamanul1/outreach.git`, branch `main`).
3. Build Type: **Dockerfile**.
4. Port: `3000`.
5. Under **Mounts / Volumes**, add a persistent volume:
   - Host path: `/var/lib/dokploy/seranex_data` (or named volume)
   - Container path: `/app/.wwebjs_auth`
6. Click **Deploy**.

---

## 📲 How to Connect WhatsApp on Dokploy

1. Once deployed, open your Dokploy domain in your browser: `https://outreach.seranex.lk` (or `http://YOUR_SERVER_IP:3000`).
2. Click **"WhatsApp: Disconnected"** in the top navigation bar.
3. Either:
   - **Scan the QR Code** with your phone (WhatsApp &gt; Linked Devices &gt; Link a Device).
   - Or click **"Get 8-Digit Pairing Code"** to link your phone number directly without camera scanning!
4. Once linked, the session is stored in the persistent volume. It will **stay connected 24/7** even across server reboots.

---

## 📞 Missed Call & Real Sales Agent Feature

* **Missed Call Interceptor:** If any client places a WhatsApp call or missed call to the bot, the AI agent catches it within 2 seconds, sends a warm sales consultation message highlighting your 3 services, gives them your hotline `0728382638` and `https://seranex.lk`, and alerts you on Discord + WhatsApp immediately!
* **Trigger Missed Call Hook:** In the dashboard CRM table, click the **📞 icon** on any lead to send a personalized missed-call hook message and trigger a 1-tap phone dialer on your device.
