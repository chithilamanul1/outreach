#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Oceanway Tours - Dispatch Inquiries to Uncontacted Hotels with Emails
 * ─────────────────────────────────────────────────────────────────────────────
 * Finds all hotels in hotels_db.json that already have a valid email address
 * but haven't received an inquiry yet. Sends with 25s Hostinger safe pacing.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { sendRateSheetInquiry } from "./email.js";
import { notifyInquirySent } from "./discord_notifier.js";

const HOTELS_DB_PATH = "hotels_db.json";
const DELAY_BETWEEN_EMAILS_MS = 25_000;

function loadHotelsDb() {
  if (!existsSync(HOTELS_DB_PATH)) return [];
  try { return JSON.parse(readFileSync(HOTELS_DB_PATH, "utf-8")); } catch { return []; }
}

function saveHotelsDb(hotels) {
  writeFileSync(HOTELS_DB_PATH, JSON.stringify(hotels, null, 2), "utf-8");
}

async function main() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");

  console.log(`\n${"═".repeat(65)}`);
  console.log(`📬 Dispatching Rate Inquiries to Uncontacted Hotels ${DRY_RUN ? "[DRY-RUN]" : ""}`);
  console.log(`${"═".repeat(65)}\n`);

  const hotels = loadHotelsDb();

  const queue = hotels.filter(h => 
    h.email && 
    h.email.includes("@") && 
    h.status !== "EMAIL_SENT" && 
    !h.email_sent_at
  );

  console.log(`Found ${queue.length} uncontacted hotels with valid email addresses.\n`);

  if (queue.length === 0) {
    console.log("All hotels with email addresses have already been contacted!");
    return;
  }

  let sentCount = 0;

  for (let i = 0; i < queue.length; i++) {
    const hotel = queue[i];
    const prefix = `[${i + 1}/${queue.length}]`;

    console.log(`${prefix} 🏨 ${hotel.name} [${hotel.star_category || "Hotel"}] (${hotel.region || "Sri Lanka"})`);
    console.log(`       ✉️  ${hotel.email}`);

    if (DRY_RUN) {
      console.log(`       ✅ [DRY-RUN] Would send inquiry to ${hotel.email}\n`);
      continue;
    }

    const sendRes = await sendRateSheetInquiry(hotel.email, {
      name: hotel.name,
      starCategory: hotel.star_category || "Hotel",
      place_id: hotel.place_id
    });

    if (sendRes.success) {
      hotel.status = "EMAIL_SENT";
      hotel.email_sent_at = new Date().toISOString();
      sentCount++;
      notifyInquirySent(hotel, hotel.email).catch(() => {});
      saveHotelsDb(hotels);
      console.log(`       ✅ Inquiry sent successfully!`);
    } else {
      console.log(`       ⚠ Send failed: ${sendRes.reason}`);
    }

    console.log();

    if (i < queue.length - 1) {
      console.log(`       ⏳ Hostinger rate safe delay: waiting ${DELAY_BETWEEN_EMAILS_MS / 1000}s...\n`);
      await sleep(DELAY_BETWEEN_EMAILS_MS);
    }
  }

  console.log(`\n${"═".repeat(65)}`);
  console.log(`🎉 BATCH DISPATCH COMPLETE!`);
  console.log(`   Inquiries Sent: ${sentCount} / ${queue.length}`);
  console.log(`   Database updated: hotels_db.json`);
  console.log(`${"═".repeat(65)}\n`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
