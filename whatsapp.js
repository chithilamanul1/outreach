// ═══════════════════════════════════════════════════════════════════════════════
// Seranex Lanka Solutions - WhatsApp Outreach & Real-Time Sales Agent Dispatcher
// Manages WhatsApp connection (QR scan / 8-digit Pairing Code),
// dispatches direct cold outreach & missed-call hooks to prospective businesses,
// intercepts incoming voice calls, and alerts the sales team on hot leads.
// ═══════════════════════════════════════════════════════════════════════════════

import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode-terminal";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { AGENCY_PROFILE } from "./config/businessCategories.js";
import { attachSalesBotListeners } from "./salesbot.js";

let waClient = null;
let isReady = false;
let initPromise = null;
let currentQr = null;

const WA_SENT_PATH = "wa_sent.json";

function loadSentLeads() {
  if (!existsSync(WA_SENT_PATH)) return {};
  try {
    return JSON.parse(readFileSync(WA_SENT_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveSentLead(phone, businessName, message) {
  const sent = loadSentLeads();
  const clean = cleanPhoneNumber(phone);
  if (clean) {
    sent[clean] = {
      businessName,
      message,
      sentAt: new Date().toISOString()
    };
    writeFileSync(WA_SENT_PATH, JSON.stringify(sent, null, 2), "utf-8");
  }
}

export function getWhatsAppStatus() {
  return {
    isReady,
    hasClient: Boolean(waClient),
    hasQr: Boolean(currentQr),
    qr: currentQr
  };
}

/**
 * Clean phone number to international format (e.g. 07228382638 -> 947228382638)
 */
export function cleanPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "94" + cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Format phone number into WhatsApp chat ID (e.g. 947228382638@c.us)
 */
export function formatPhoneForWhatsApp(phone) {
  const cleaned = cleanPhoneNumber(phone);
  return cleaned ? `${cleaned}@c.us` : null;
}

/**
 * Generate 8-digit pairing code for linking WhatsApp without scanning QR
 */
export async function requestWhatsAppPairingCode(phone) {
  if (!waClient) {
    await initWhatsApp();
  }
  const target = phone || process.env.BOT_WHATSAPP_NUMBER || "94760602638";
  const cleanPhone = cleanPhoneNumber(target);
  if (!cleanPhone) throw new Error("No valid phone number provided for pairing");

  if (waClient && typeof waClient.requestPairingCode === "function") {
    const code = await waClient.requestPairingCode(cleanPhone);
    console.log(`\n🔑 WHATSAPP PAIRING CODE FOR SERANEX LANKA SOLUTIONS (${cleanPhone}): ${code}\n`);
    return code;
  }
  throw new Error("WhatsApp client is not ready or pairing code is not supported");
}

/**
 * Initialize WhatsApp client (Single session for Seranex Lanka Solutions)
 */
export async function initWhatsApp() {
  if (isReady && waClient) return waClient;
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    console.log("\n📱 Initializing WhatsApp Client for Seranex Lanka Solutions...");

    const isWindows = process.platform === "win32";
    const puppeteerOptions = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu"
      ]
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else if (isWindows && existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")) {
      puppeteerOptions.executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    }

    waClient = new Client({
      authStrategy: new LocalAuth({ clientId: "seranex-sales", dataPath: "./.wwebjs_auth" }),
      puppeteer: puppeteerOptions,
      webVersionCache: {
        type: "none",
      },
    });

    waClient.on("qr", async (qr) => {
      currentQr = qr;
      console.log("\n📲 Scan this QR code with WhatsApp to connect Seranex Lanka Solutions Outreach:\n");
      qrcode.generate(qr, { small: true });
      console.log("   Open WhatsApp -> Linked Devices -> Link a Device.\n");

      try {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qr)}`;
        const res = await fetch(qrUrl);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          writeFileSync("public/whatsapp_qr.png", buffer);
          writeFileSync("public/whatsapp_qr.html", `<!DOCTYPE html>
<html>
<head>
  <title>Connect WhatsApp - Seranex Lanka Solutions</title>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="15">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d16; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #11192e; padding: 36px 44px; border-radius: 16px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #263554; max-width: 420px; }
    h2 { color: #818cf8; margin-top: 0; font-size: 22px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
    .qr-box { background: white; padding: 14px; border-radius: 12px; display: inline-block; margin: 18px 0; }
    img { width: 280px; height: 280px; display: block; }
    .steps { text-align: left; background: #070b14; padding: 16px 20px; border-radius: 10px; margin-top: 14px; font-size: 13px; color: #cbd5e1; }
    .steps ol { margin: 0; padding-left: 20px; }
    .steps li { margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>📱 Connect Seranex Lanka WhatsApp</h2>
    <p>Scan with WhatsApp to enable autonomous outreach, missed-call handling & AI sales agent conversations.</p>
    <div class="qr-box">
      <img src="whatsapp_qr.png?t=${Date.now()}" alt="WhatsApp QR Code" />
    </div>
    <div class="steps">
      <ol>
        <li>Open WhatsApp on phone</li>
        <li>Tap <b>Menu (⋮)</b> or <b>Settings</b> &gt; <b>Linked Devices</b></li>
        <li>Tap <b>Link a Device</b> and point camera at QR code</li>
      </ol>
    </div>
    <p style="font-size: 12px; color: #64748b; margin-top: 16px;">This page refreshes automatically until connected.</p>
  </div>
</body>
</html>`);
        }
      } catch (_) {}
    });

    waClient.on("ready", async () => {
      console.log("✅ WhatsApp Client connected and ready for Seranex Lanka Solutions!\n");
      isReady = true;
      currentQr = null;

      try {
        if (waClient.pupPage) {
          await waClient.pupPage.evaluate(() => {
            if (window.WWebJS) {
              window.WWebJS.mediaDataFields = (mediaData) => {
                const internals = [
                  'revisionNumber',
                  'parent',
                  'collection',
                  '_uiObservers',
                  'mirror',
                ];
                return Object.fromEntries(
                  Object.entries(mediaData).filter(
                    ([key]) => !key.startsWith('__') && !internals.includes(key),
                  ),
                );
              };
            }
          });
        }
      } catch (_) {}

      // Attach sales closer and missed call listeners
      attachSalesBotListeners([waClient]);

      resolve(waClient);
    });

    waClient.on("authenticated", () => {
      console.log("🔐 WhatsApp authenticated successfully.");
    });

    waClient.on("auth_failure", (msg) => {
      console.error("✖ WhatsApp auth failed:", msg);
      resolve(null);
    });

    waClient.on("disconnected", (reason) => {
      console.warn("⚠ WhatsApp disconnected:", reason);
      isReady = false;
    });

    waClient.initialize().catch((err) => {
      console.error("✖ WhatsApp init error:", err.message);
      resolve(null);
    });
  });

  return initPromise;
}

/**
 * Send direct WhatsApp outreach message to a business prospect
 */
export async function sendWhatsAppOutreach(phone, message, businessName = "Business") {
  if (!phone) return { success: false, error: "No phone number provided" };

  if (!isReady || !waClient) {
    await initWhatsApp();
  }

  if (!isReady || !waClient) {
    return { success: false, error: "WhatsApp client is not connected" };
  }

  const chatId = formatPhoneForWhatsApp(phone);
  if (!chatId) {
    return { success: false, error: "Invalid phone number format" };
  }

  try {
    await waClient.sendMessage(chatId, message);
    saveSentLead(phone, businessName, message);
    console.log(`  📲 [WhatsApp Outreached] Sent pitch to ${businessName} (${phone})`);
    return { success: true, phone, chatId };
  } catch (err) {
    console.error(`  ✖ [WhatsApp Failed] Error sending to ${phone}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Send high-converting "Missed Call Hook" message on WhatsApp
 */
export async function sendMissedCallOutreach(phone, businessName = "Business") {
  const missedCallHook = `📞 *Missed Call from Seranex Lanka Solutions (Hotline: 07228382638)*

Hi ${businessName} Team! I just gave your phone a quick ring regarding your business growth & digital systems. 

I'm Kasun, Senior Client Solutions Director at Seranex Lanka Solutions (https://seranex.lk). 

We help businesses like yours launch:
1️⃣ Custom Software & Booking Engines (cuts 18-30% platform commissions)
2️⃣ High-Converting Websites (ready in 1-2 days, $100 / Rs. 28,000 with free domain & hosting)
3️⃣ Cinematic 4K Video Ads & Reels for Instagram/TikTok that bring paying customers

Are you open to a quick 2-minute chat today, or can I send over our live client portfolio? Hotline: 07228382638 🚀`;

  return sendWhatsAppOutreach(phone, missedCallHook, businessName);
}

/**
 * Send urgent notification to Admin WhatsApp (e.g. Hot Lead Alert)
 */
export async function notifyAdminWhatsApp(text) {
  const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER || AGENCY_PROFILE.adminWhatsApp;
  if (!adminPhone) return false;

  const chatId = formatPhoneForWhatsApp(adminPhone);
  if (!chatId || !isReady || !waClient) return false;

  try {
    await waClient.sendMessage(chatId, text);
    return true;
  } catch (err) {
    console.warn(`  ⚠ Failed to send WhatsApp alert to admin: ${err.message}`);
    return false;
  }
}
