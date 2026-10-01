/**
 * Inbox Harvester & Rate Sheet Ingestion Engine
 * Connects to IMAP inbox (custom domain webmail or Gmail), detects hotel replies,
 * extracts rate sheet attachments, saves them into categorized folders,
 * and automatically forwards them directly to the user's WhatsApp.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { forwardRateSheetToWhatsApp } from "./whatsapp.js";
import { analyzeRateSheetDocument } from "./rate_sheet_analyzer.js";
import { notifyRateSheetReceived } from "./discord_notifier.js";

const BASE_RATE_SHEET_DIR = process.env.RATE_SHEETS_DIR || "rate_sheets";
const HOTELS_DB_PATH = "hotels_db.json";

/**
 * Sanitize folder and file names for Windows filesystem
 */
export function sanitizeFilename(name) {
  if (!name) return "unnamed";
  return name.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 80);
}

/**
 * Determine folder category from star rating string
 */
export function getCategoryFolder(starCategory) {
  if (!starCategory) return "general";
  const cat = starCategory.toLowerCase();
  if (cat.includes("5")) return "5_star";
  if (cat.includes("4")) return "4_star";
  if (cat.includes("3")) return "3_star";
  return "general";
}

/**
 * Save an attachment buffer into the organized folder structure
 */
export function saveRateSheetAttachment(starCategory, hotelName, filename, contentBuffer) {
  const catFolder = getCategoryFolder(starCategory);
  const cleanHotel = sanitizeFilename(hotelName);
  const targetDir = join(BASE_RATE_SHEET_DIR, catFolder, cleanHotel);

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const cleanFile = sanitizeFilename(filename);
  const filePath = join(targetDir, cleanFile);

  writeFileSync(filePath, contentBuffer);
  console.log(`  💾 Rate Sheet Saved: ${filePath}`);
  return filePath;
}

/**
 * Load current hotels DB
 */
function loadHotelsDb() {
  if (!existsSync(HOTELS_DB_PATH)) return [];
  try {
    return JSON.parse(readFileSync(HOTELS_DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Save updated hotels DB
 */
function saveHotelsDb(hotels) {
  writeFileSync(HOTELS_DB_PATH, JSON.stringify(hotels, null, 2), "utf-8");
}

/**
 * Match incoming email sender or subject to a hotel in hotels_db
 */
function findMatchingHotel(fromEmail, subject, hotels) {
  const cleanFrom = (fromEmail || "").toLowerCase().trim();
  const cleanSubject = (subject || "").toLowerCase().trim();

  // 1. Direct email match
  for (const hotel of hotels) {
    if (hotel.email && hotel.email.toLowerCase() === cleanFrom) {
      return hotel;
    }
    if (hotel.all_emails && hotel.all_emails.some((e) => e.toLowerCase() === cleanFrom)) {
      return hotel;
    }
  }

  // 2. Domain match
  const fromDomain = cleanFrom.split("@")[1];
  if (fromDomain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"].includes(fromDomain)) {
    for (const hotel of hotels) {
      if (hotel.website && hotel.website.toLowerCase().includes(fromDomain)) {
        return hotel;
      }
    }
  }

  // 3. Hotel name in subject
  for (const hotel of hotels) {
    if (hotel.name && cleanSubject.includes(hotel.name.toLowerCase())) {
      return hotel;
    }
  }

  return null;
}

/**
 * Connect to IMAP (Custom hosting or Gmail) and harvest rate sheet attachments
 */
export async function syncRateSheetsFromInbox() {
  // Support custom hosting IMAP (e.g. mail.ocean-tours.lk) or Gmail
  const user = process.env.IMAP_USER || process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER;
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD;
  const host = process.env.IMAP_HOST || process.env.SMTP_HOST || "mail.ocean-tours.lk";
  const port = parseInt(process.env.IMAP_PORT || "993", 10);
  const secure = process.env.IMAP_SECURE === "false" ? false : true;

  if (!user || !pass) {
    console.warn("  ⚠ Inbox Sync: Email credentials (IMAP_USER / IMAP_PASS) not set in .env");
    return { success: false, reason: "IMAP credentials missing in .env" };
  }

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass },
    logger: false,
    tls: {
      rejectUnauthorized: false
    }
  });

  const hotels = loadHotelsDb();
  let downloadedCount = 0;
  let updatedHotelsCount = 0;
  let whatsappSentCount = 0;

  try {
    console.log(`\n📬 Connecting to IMAP server ${host}:${port} (${user})...`);
    await client.connect();
    console.log("✅ IMAP Connected successfully.");

    const lock = await client.getMailboxLock("INBOX");
    try {
      // Search for messages from the last 14 days
      const searchCriteria = { since: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) };
      const messages = client.fetch(searchCriteria, { source: true, uid: true, flags: true });

      for await (const msg of messages) {
        try {
          const parsed = await simpleParser(msg.source);
          const fromEmail = parsed.from?.value?.[0]?.address || "";
          const subject = parsed.subject || "";

          // Check if email has attachments
          if (!parsed.attachments || parsed.attachments.length === 0) {
            continue;
          }

          // Filter for document extensions
          const rateSheetAttachments = parsed.attachments.filter((att) => {
            const ext = (att.filename || "").toLowerCase();
            return (
              ext.endsWith(".pdf") ||
              ext.endsWith(".xlsx") ||
              ext.endsWith(".xls") ||
              ext.endsWith(".docx") ||
              ext.endsWith(".doc") ||
              ext.endsWith(".csv") ||
              ext.endsWith(".zip")
            );
          });

          if (rateSheetAttachments.length === 0) continue;

          // Find matching hotel
          let matchedHotel = findMatchingHotel(fromEmail, subject, hotels);
          const hotelName = matchedHotel ? matchedHotel.name : (parsed.from?.value?.[0]?.name || "Unknown_Hotel");
          const category = matchedHotel ? matchedHotel.star_category : "3-star";

          console.log(`\n📥 Found rate sheet reply from: "${hotelName}" (${fromEmail})`);

          const savedPaths = [];
          for (const att of rateSheetAttachments) {
            const filename = att.filename || `RateSheet_${Date.now()}.pdf`;
            const savedPath = saveRateSheetAttachment(category, hotelName, filename, att.content);
            savedPaths.push(savedPath);
            downloadedCount++;

            // 🧠 AI RATE SHEET PARSER: Extract rooms, seasons, and prices into Master Costing Big Sheet
            try {
              console.log(`  🤖 Extracting prices from ${filename} for Master Costing Big Sheet...`);
              await analyzeRateSheetDocument(savedPath, {
                hotelName,
                destination: matchedHotel?.region || "Sri Lanka",
                starCategory: category,
                placeId: matchedHotel?.place_id || ""
              });
            } catch (aiErr) {
              console.warn(`  ⚠ Rate analysis failed: ${aiErr.message}`);
            }

            // 📲 DIRECT WHATSAPP DELIVERY: Forward file to user's WhatsApp
            try {
              const waOk = await forwardRateSheetToWhatsApp(savedPath, hotelName, category);
              if (waOk) whatsappSentCount++;
            } catch (waErr) {
              console.warn(`  ⚠ WhatsApp forward error: ${waErr.message}`);
            }
          }

          // Discord Notification for Rate Sheet Received
          notifyRateSheetReceived(hotelName, matchedHotel?.region, category, savedPaths).catch(() => {});

          // If matched in DB, update record
          if (matchedHotel) {
            if (!matchedHotel.rate_sheets) matchedHotel.rate_sheets = [];
            for (const sp of savedPaths) {
              if (!matchedHotel.rate_sheets.includes(sp)) {
                matchedHotel.rate_sheets.push(sp);
              }
            }
            matchedHotel.status = "RATE_SHEET_RECEIVED";
            matchedHotel.reply_received_at = new Date().toISOString();
            updatedHotelsCount++;
          }
        } catch (parseErr) {
          console.warn(`  ⚠ Error parsing email: ${parseErr.message}`);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    saveHotelsDb(hotels);

    console.log(`\n🎉 Inbox Sync Complete: ${downloadedCount} rate sheet files saved. Forwarded ${whatsappSentCount} to WhatsApp.`);
    return {
      success: true,
      downloadedCount,
      updatedHotelsCount,
      whatsappSentCount
    };
  } catch (err) {
    console.error(`✖ IMAP error: ${err.message}`);
    try {
      await client.logout();
    } catch {}
    return { success: false, reason: err.message };
  }
}
