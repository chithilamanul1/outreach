#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Oceanway Tours - Missing Hotel Email Resolver & Dispatcher
 * ─────────────────────────────────────────────────────────────────────────────
 * Finds official reservations/sales emails for hotels in hotels_db.json
 * that currently have no email, updates the database, and dispatches inquiries
 * with Hostinger-safe 25s pacing.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { sendRateSheetInquiry } from "./email.js";
import { notifyInquirySent } from "./discord_notifier.js";

const HOTELS_DB_PATH = "hotels_db.json";
const DELAY_BETWEEN_EMAILS_MS = 25_000; // 25s safe spacing

function loadHotelsDb() {
  if (!existsSync(HOTELS_DB_PATH)) return [];
  try { return JSON.parse(readFileSync(HOTELS_DB_PATH, "utf-8")); } catch { return []; }
}

function saveHotelsDb(hotels) {
  writeFileSync(HOTELS_DB_PATH, JSON.stringify(hotels, null, 2), "utf-8");
}

async function resolveBatchEmails(hotelsChunk) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  const list = hotelsChunk.map(h => ({
    place_id: h.place_id,
    name: h.name,
    region: h.region,
    website: h.website
  }));

  const prompt = `You are a Sri Lanka B2B inbound travel contracting desk manager.
For each of the following Sri Lankan hotels and resorts, provide their official reservations or sales contracting email address and phone number:

${JSON.stringify(list, null, 2)}

Only return genuine, working email addresses (e.g. reservations@..., info@..., sales@...). If completely unknown, use empty string "".
Return ONLY a valid JSON array in this exact format with no markdown:
[
  { "place_id": "...", "name": "...", "email": "...", "phone": "..." }
]`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://oceanwaytours.com",
        "X-Title": "Hotel Email Resolver",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const cleanJson = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.warn("  ⚠ Resolution error:", err.message);
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");
  const limitArg = args.find(a => a.startsWith("--limit="));
  const MAX_TO_PROCESS = limitArg ? parseInt(limitArg.split("=")[1]) : 50;

  console.log(`\n${"═".repeat(65)}`);
  console.log(`🔍 Resolving Missing Hotel Emails & Dispatching Inquiries ${DRY_RUN ? "[DRY-RUN]" : ""}`);
  console.log(`   Target limit: ${MAX_TO_PROCESS} hotels`);
  console.log(`${"═".repeat(65)}\n`);

  const hotels = loadHotelsDb();

  // Find hotels without an email, prioritize 4-star and 3-star
  const missing = hotels.filter(h => 
    (!h.email || !h.email.includes("@")) &&
    h.status !== "EMAIL_SENT" &&
    (h.star_category === "4-star" || h.star_category === "3-star")
  ).slice(0, MAX_TO_PROCESS);

  console.log(`Found ${missing.length} priority 4★/3★ hotels needing email addresses.\n`);

  if (missing.length === 0) {
    console.log("No missing emails to resolve!");
    return;
  }

  // Process in chunks of 15
  const CHUNK_SIZE = 15;
  let resolvedCount = 0;
  let sentCount = 0;

  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    const chunk = missing.slice(i, i + CHUNK_SIZE);
    console.log(`📦 Resolving chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} hotels)...`);

    const results = await resolveBatchEmails(chunk);

    for (const res of results) {
      if (!res.email || !res.email.includes("@")) continue;

      const target = hotels.find(h => h.place_id === res.place_id || h.name.toLowerCase() === res.name.toLowerCase());
      if (!target) continue;

      target.email = res.email.trim().toLowerCase();
      if (res.phone && !target.phone) target.phone = res.phone;
      resolvedCount++;

      console.log(`   ✓ ${target.name} [${target.region}] → ${target.email}`);

      // Dispatch inquiry if not already sent
      if (target.status !== "EMAIL_SENT") {
        if (DRY_RUN) {
          console.log(`     [DRY-RUN] Would send B2B inquiry to ${target.email}`);
        } else {
          console.log(`     🚀 Sending B2B Rate Sheet inquiry...`);
          const sendRes = await sendRateSheetInquiry(target.email, {
            name: target.name,
            starCategory: target.star_category || "Hotel",
            place_id: target.place_id
          });

          if (sendRes.success) {
            target.status = "EMAIL_SENT";
            target.email_sent_at = new Date().toISOString();
            sentCount++;
            notifyInquirySent(target, target.email).catch(() => {});
            console.log(`     ⏳ Safe pacing: waiting ${DELAY_BETWEEN_EMAILS_MS / 1000}s...`);
            await sleep(DELAY_BETWEEN_EMAILS_MS);
          }
        }
      }

      saveHotelsDb(hotels);
    }

    await sleep(2000);
  }

  console.log(`\n${"═".repeat(65)}`);
  console.log(`🎉 RESOLUTION COMPLETE!`);
  console.log(`   Emails Resolved: ${resolvedCount}`);
  console.log(`   Inquiries Sent:  ${sentCount}`);
  console.log(`   hotels_db.json updated successfully.`);
  console.log(`${"═".repeat(65)}\n`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
