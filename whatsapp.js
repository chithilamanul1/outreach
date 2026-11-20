// ═══════════════════════════════════════════════════════════════════════════════
// Seranex Lanka Solutions - WhatsApp Outreach & Real-Time Sales Agent Dispatcher
// Manages WhatsApp connection (QR scan / 8-digit Pairing Code),
// dispatches direct cold outreach & missed-call hooks to prospective businesses,
// intercepts incoming voice calls, and alerts the sales team on hot leads.
// ═══════════════════════════════════════════════════════════════════════════════

import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import { existsSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { AGENCY_PROFILE } from "./config/businessCategories.js";
import { attachSalesBotListeners } from "./salesbot.js";

let waClient = null;
let isReady = false;
let initPromise = null;
let currentQr = null;
let currentQrDataUrl = null;

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
    qr: currentQr,
    qrDataUrl: currentQrDataUrl
  };
}

/**
 * Clean phone number to international format (e.g. 0728382638 -> 94728382638)
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
 * Format phone number into WhatsApp chat ID (e.g. 94728382638@c.us)
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
  const target = phone || process.env.BOT_WHATSAPP_NUMBER || "0728382638";
  const cleanPhone = cleanPhoneNumber(target);
  if (!cleanPhone) throw new Error("No valid phone number provided for pairing");

  if (waClient && typeof waClient.requestPairingCode === "function") {
    try {
      const code = await waClient.requestPairingCode(cleanPhone);
      console.log(`\n🔑 WHATSAPP PAIRING CODE FOR SERANEX LANKA SOLUTIONS (${cleanPhone}): ${code}\n`);
      return code;
    } catch (pairErr) {
      console.warn(`  ⚠ WhatsApp Pairing Code error: ${pairErr.message}`);
      throw new Error("WhatsApp Web currently requires scanning the QR Code on screen to link your device.");
    }
  }
  throw new Error("WhatsApp client is not ready. Please scan the QR Code on screen.");
}

/**
 * Clean up orphaned Puppeteer Chrome processes and lockfiles on Windows
 */
function cleanupOrphanedChrome() {
  if (process.platform === "win32") {
    try {
      execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'chrome.exe\'\\" | Where-Object { $_.CommandLine -like \'*session-seranex-sales*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', { stdio: "ignore" });
    } catch (_) {}
  }
  const sessionDir = "./.wwebjs_auth/session-seranex-sales";
  ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"].forEach((f) => {
    try {
      const p = `${sessionDir}/${f}`;
      if (existsSync(p)) unlinkSync(p);
    } catch (_) {}
  });
}

/**
 * Reset WhatsApp session cleanly and generate a fresh live QR code
 */
export async function resetWhatsAppSession() {
  console.log("\n🔄 Force resetting WhatsApp session for clean connection...");
  isReady = false;
  currentQr = null;
  currentQrDataUrl = null;
  initPromise = null;

  if (waClient) {
    try {
      await waClient.destroy();
    } catch (_) {}
    waClient = null;
  }

  cleanupOrphanedChrome();

  await new Promise(r => setTimeout(r, 1500));
  return await initWhatsApp();
}

/**
 * Initialize WhatsApp client (Single session for Seranex Lanka Solutions)
 */
export async function initWhatsApp() {
  if (isReady && waClient) return waClient;
  if (initPromise) return initPromise;

  cleanupOrphanedChrome();

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
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1055414421-alpha.html",
      },
    });

    waClient.on("qr", async (qr) => {
      currentQr = qr;
      try {
        currentQrDataUrl = await QRCode.toDataURL(qr, {
          margin: 2,
          scale: 8,
          color: { dark: "#0f172a", light: "#ffffff" }
        });
        const base64Data = currentQrDataUrl.replace(/^data:image\/png;base64,/, "");
        writeFileSync("public/whatsapp_qr.png", Buffer.from(base64Data, "base64"));
      } catch (err) {
        console.warn("  ⚠ QR render error:", err.message);
      }

      console.log("\n📲 Scan this QR code with WhatsApp to connect Seranex Lanka Solutions Outreach:\n");
      qrcode.generate(qr, { small: true });
      console.log("   Open WhatsApp -> Linked Devices -> Link a Device.\n");
    });

    waClient.on("ready", async () => {
      console.log("✅ WhatsApp Client connected and ready for Seranex Lanka Solutions!\n");
      isReady = true;
      currentQr = null;
      currentQrDataUrl = null;

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

      // Instant WhatsApp notification to Seranex Admin
      try {
        await notifyAdminWhatsApp(
          `🚀 *Seranex Lanka Solutions — 24/7 Engine Started!*\n\n` +
          `Autonomous B2B Client Acquisition Engine is officially active and online.\n` +
          `• *Hotline:* 0728382638\n` +
          `• *Sales Email:* sales@seranex.lk\n` +
          `• *Website:* https://seranex.lk\n` +
          `• *Status:* Actively finding leads, dispatching cold pitches, and closing deals 24/7.`
        );
      } catch (notifyErr) {
        console.warn("  ⚠ Admin startup WhatsApp notification error:", notifyErr.message);
      }

      resolve(waClient);
    });

    waClient.on("authenticated", () => {
      console.log("🔐 WhatsApp authenticated successfully.");
      currentQr = null;
      currentQrDataUrl = null;
    });

    waClient.on("auth_failure", async (msg) => {
      console.error("✖ WhatsApp auth failed:", msg);
      isReady = false;
      currentQr = null;
      currentQrDataUrl = null;
      initPromise = null;
      try {
        await waClient.destroy();
      } catch (_) {}
      waClient = null;
      resolve(null);
    });

    waClient.on("disconnected", async (reason) => {
      console.warn("⚠ WhatsApp disconnected:", reason);
      isReady = false;
      currentQr = null;
      currentQrDataUrl = null;
      initPromise = null;
      try {
        await waClient.destroy();
      } catch (_) {}
      waClient = null;

      console.log("🔄 Auto re-initializing WhatsApp client in 4 seconds...");
      setTimeout(() => {
        initWhatsApp().catch(e => console.warn("  ⚠ Re-init error:", e.message));
      }, 4000);
    });

    waClient.initialize().catch((err) => {
      console.error("✖ WhatsApp init error:", err.message);
      initPromise = null;
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
  const missedCallHook = `📞 *Missed Call from Seranex Lanka Solutions (Hotline: 0728382638)*

Hi ${businessName} Team! I just gave your phone a quick ring regarding your business growth & digital systems. 

I'm Kasun, Senior Client Solutions Director at Seranex Lanka Solutions (https://seranex.lk). 

We help businesses like yours launch:
1️⃣ Custom Software & Booking Engines (cuts 18-30% platform commissions)
2️⃣ High-Converting Websites (ready in 1-2 days, $100 / Rs. 28,000 with free domain & hosting)
3️⃣ Cinematic 4K Video Ads & Reels for Instagram/TikTok that bring paying customers

Are you open to a quick 2-minute chat today, or can I send over our live client portfolio? Hotline: 0728382638 🚀`;

  return sendWhatsAppOutreach(phone, missedCallHook, businessName);
}

/**
 * Send urgent notification to Admin WhatsApp (e.g. Hot Lead Alert or Startup Confirmation)
 */
export async function notifyAdminWhatsApp(text) {
  if (!isReady || !waClient) return false;

  const targets = new Set();
  if (process.env.ADMIN_WHATSAPP_NUMBER) targets.add(cleanPhoneNumber(process.env.ADMIN_WHATSAPP_NUMBER));
  if (AGENCY_PROFILE.adminWhatsApp) targets.add(cleanPhoneNumber(AGENCY_PROFILE.adminWhatsApp));
  if (AGENCY_PROFILE.hotline) targets.add(cleanPhoneNumber(AGENCY_PROFILE.hotline));
  targets.add("94711770186");
  targets.add("94728382638");

  let sent = false;
  for (const phone of targets) {
    if (!phone) continue;
    const chatId = `${phone}@c.us`;
    try {
      await waClient.sendMessage(chatId, text);
      console.log(`  📱 Sent WhatsApp admin notification to ${phone}`);
      sent = true;
    } catch (err) {
      console.warn(`  ⚠ Failed to send WhatsApp notification to ${phone}: ${err.message}`);
    }
  }
  return sent;
}
