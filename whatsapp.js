// ═══════════════════════════════════════════════════════════════════════════════
// WhatsApp Module: Admin Notification & Rate Sheet Delivery
// Forwards downloaded rate sheet documents directly to the travel agent's WhatsApp
// ═══════════════════════════════════════════════════════════════════════════════

import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode-terminal";
import { existsSync } from "node:fs";

let waClient = null;
let isReady = false;
let initPromise = null;

/**
 * Format a Sri Lankan phone number for WhatsApp chat ID
 */
export function formatPhoneForWhatsApp(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    cleaned = "94" + cleaned.substring(1);
  }
  return cleaned + "@c.us";
}

/**
 * Initialize WhatsApp client (Single account for admin delivery)
 */
export async function initWhatsApp() {
  if (isReady && waClient) return waClient;
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    console.log("\n📱 Initializing WhatsApp Client for Rate Sheet Delivery...");

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
      puppeteerOptions.headless = false;
    }

    waClient = new Client({
      authStrategy: new LocalAuth({ clientId: "travel-admin", dataPath: "./.wwebjs_auth" }),
      puppeteer: puppeteerOptions,
      webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html",
      },
    });

    waClient.on("qr", (qr) => {
      console.log("\n📲 Scan this QR code with WhatsApp to connect your delivery number:\n");
      qrcode.generate(qr, { small: true });
      console.log("   Open WhatsApp on your phone -> Linked Devices -> Link a Device.\n");
    });

    waClient.on("ready", async () => {
      console.log("✅ WhatsApp Client connected and ready to send rate sheets!\n");
      isReady = true;
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
 * Forward a downloaded rate sheet attachment directly to user's WhatsApp
 */
export async function forwardRateSheetToWhatsApp(filePath, hotelName, starCategory = "Hotel") {
  const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!adminPhone) {
    console.warn("  ⚠ ADMIN_WHATSAPP_NUMBER not set in .env — skipping WhatsApp forward.");
    return false;
  }

  if (!existsSync(filePath)) {
    console.warn(`  ⚠ Cannot send to WhatsApp: file does not exist at ${filePath}`);
    return false;
  }

  const chatId = formatPhoneForWhatsApp(adminPhone);
  if (!chatId) {
    console.warn("  ⚠ Invalid ADMIN_WHATSAPP_NUMBER in .env");
    return false;
  }

  try {
    // Ensure client is ready
    if (!isReady || !waClient) {
      await initWhatsApp();
    }

    if (!waClient || !isReady) {
      console.warn("  ⚠ WhatsApp client is not connected — cannot forward rate sheet.");
      return false;
    }

    const fileName = filePath.split(/[\\/]/).pop();
    const media = MessageMedia.fromFilePath(filePath);

    const caption = `🏨 *NEW RATE SHEET RECEIVED!*\n\n*Hotel:* ${hotelName}\n*Category:* ${starCategory}\n*File:* ${fileName}\n\n📁 *Saved locally in:* \`${filePath}\`\nReady for travel package costing! 📊`;

    console.log(`  📲 Forwarding "${fileName}" to WhatsApp (${adminPhone})...`);
    try {
      await waClient.sendMessage(chatId, media, { caption, sendMediaAsDocument: true });
      console.log(`  ✅ Successfully sent rate sheet directly to WhatsApp!`);
      return true;
    } catch (mediaErr) {
      console.warn(`  ⚠ Media attachment send failed (${mediaErr.message}). Sending text notification fallback...`);
      await waClient.sendMessage(chatId, caption).catch(() => {});
      return false;
    }
  } catch (err) {
    console.warn(`  ⚠ Failed to forward rate sheet to WhatsApp: ${err.message}`);
    return false;
  }
}

/**
 * Send a plain WhatsApp text message
 */
export async function sendWhatsAppMessage(phone, message) {
  if (!isReady || !waClient) return false;
  const chatId = formatPhoneForWhatsApp(phone);
  if (!chatId) return false;

  try {
    await waClient.sendMessage(chatId, message);
    return true;
  } catch (err) {
    console.warn(`  ⚠ WhatsApp send error: ${err.message}`);
    return false;
  }
}
