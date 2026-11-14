#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Oceanway Tours - Island-Wide Sri Lanka Hotel Rate Sheet Hunter
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers all Sri Lanka tourism regions: Jaffna, Ella, Anuradhapura, Kandy,
 * Nuwara Eliya, Sigiriya, Dambulla, Polonnaruwa, Trincomalee, Pasikuda,
 * Arugam Bay, Yala, Udawalawe, Wilpattu, Bentota, Galle, Colombo, etc.
 *
 * Rules:
 * - Focus: 4-star & 3-star hotels (inventory backbone)
 * - 5-star: strictly capped at 1-2 per destination
 * - Scrapes official reservation & contracting emails
 * - Sends formal B2B tariff inquiry from b2b@oceanwaytours.com
 * - 25s anti-ratelimit pacing between emails (Hostinger SMTP safe)
 * - Updates hotels_db.json and notifies Discord
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { scrapeHotelEmails } from "./email_scraper.js";
import { sendRateSheetInquiry } from "./email.js";
import { notifyHotelDiscovered, notifyInquirySent } from "./discord_notifier.js";

// ─── REGIONS TO COVER ────────────────────────────────────────────────────────
export const ALL_SRI_LANKA_REGIONS = [
  // User priority focus regions
  "Jaffna",
  "Ella",
  "Anuradhapura",
  "Kandy",
  "Nuwara Eliya",
  "Sigiriya",
  "Dambulla",
  "Habarana",
  "Polonnaruwa",
  
  // East Coast
  "Trincomalee",
  "Nilaveli",
  "Pasikuda",
  "Arugam Bay",

  // Wildlife & Nature
  "Yala",
  "Tissamaharama",
  "Udawalawe",
  "Wilpattu",
  "Sinharaja",
  "Kitulgala",

  // Central Highlands & Tea Trails
  "Bandarawela",
  "Hatton",

  // South & South-West Coast
  "Bentota",
  "Beruwala",
  "Hikkaduwa",
  "Galle",
  "Unawatuna",
  "Koggala",
  "Ahangama",
  "Weligama",
  "Mirissa",
  "Tangalle",
  "Hambantota",

  // Western & North-West Hubs
  "Colombo",
  "Negombo",
  "Mount Lavinia",
  "Wadduwa",
  "Kalutara",
  "Kalpitiya",
  "Mannar"
];

const HOTELS_DB_PATH = "hotels_db.json";
const SEEN_HOTELS_PATH = "seen_hotels.json";
const DELAY_BETWEEN_EMAILS_MS = 25_000; // 25s Hostinger safe delay

// ─── DATABASE HELPERS ────────────────────────────────────────────────────────
function loadHotelsDb() {
  if (!existsSync(HOTELS_DB_PATH)) return [];
  try { return JSON.parse(readFileSync(HOTELS_DB_PATH, "utf-8")); } catch { return []; }
}

function saveHotelsDb(hotels) {
  writeFileSync(HOTELS_DB_PATH, JSON.stringify(hotels, null, 2), "utf-8");
}

function loadSeenHotels() {
  if (!existsSync(SEEN_HOTELS_PATH)) return new Set();
  try { return new Set(JSON.parse(readFileSync(SEEN_HOTELS_PATH, "utf-8"))); } catch { return new Set(); }
}

function saveSeenHotels(seenSet) {
  writeFileSync(SEEN_HOTELS_PATH, JSON.stringify([...seenSet], null, 2), "utf-8");
}

// ─── AI REGIONAL HOTEL DISCOVERY ─────────────────────────────────────────────
async function discoverHotelsForRegion(region, starCategories = ["4-star", "3-star"]) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("✖ Missing OPENROUTER_API_KEY in .env");
    return [];
  }

  const prompt = `You are a professional Sri Lanka inbound travel DMC contracting specialist.
List well-established ${starCategories.join(" and ")} hotels and boutique resorts located in "${region}", Sri Lanka that work with B2B travel agents and tour operators.

Exclude budget homestays, private guesthouses, and backpacker dorms.
We need verified hotel properties suitable for tour operator contracting.

For each hotel, output:
- name: Official hotel name
- star_category: Exactly "4-star", "3-star", or "5-star"
- star_rating: 4 or 3 (or 5)
- website: The official, working website URL (e.g. https://...) or empty string if not known
- phone: Reservation / front desk phone number
- address: Street address or area in ${region}

Provide up to 8-12 established hotels for this region.
Return ONLY a valid JSON array of objects, with NO surrounding markdown or commentary.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://oceanwaytours.com",
        "X-Title": "Oceanway Islandwide Hotel Hunter",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      console.warn(`  ⚠ OpenRouter error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const cleanJson = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.warn(`  ⚠ Failed to query hotels for ${region}: ${err.message}`);
    return [];
  }
}

// ─── MAIN HARVESTING PIPELINE ────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");
  const specificRegion = args.find(a => a.startsWith("--region="))?.split("=")[1];

  console.log(`\n${"═".repeat(68)}`);
  console.log(`🌴 Oceanway Tours - Island-Wide Hotel Rate Hunter ${DRY_RUN ? "[DRY-RUN]" : ""}`);
  console.log(`   Inventory priority: 4-Star & 3-Star (5-Star capped at 1-2 per town)`);
  console.log(`${"═".repeat(68)}\n`);

  const regionsToScan = specificRegion ? [specificRegion] : ALL_SRI_LANKA_REGIONS;
  const hotelsDb = loadHotelsDb();
  const seen = loadSeenHotels();

  let totalInquiriesSent = 0;
  let totalHotelsDiscovered = 0;

  for (let rIdx = 0; rIdx < regionsToScan.length; rIdx++) {
    const region = regionsToScan[rIdx];
    console.log(`\n📍 [${rIdx + 1}/${regionsToScan.length}] Scanning Region: ${region.toUpperCase()}`);
    console.log(`─`.repeat(50));

    // Check existing count for this region
    const existing4Star = hotelsDb.filter(h => h.region === region && h.star_category === "4-star").length;
    const existing3Star = hotelsDb.filter(h => h.region === region && h.star_category === "3-star").length;
    const existing5Star = hotelsDb.filter(h => h.region === region && h.star_category === "5-star").length;

    console.log(`   Current in DB: 4★: ${existing4Star} | 3★: ${existing3Star} | 5★: ${existing5Star}`);

    // If 4-star and 3-star already have 10+ each, we can skip or do light check
    if (existing4Star >= 10 && existing3Star >= 10) {
      console.log(`   ✓ Sufficient inventory already contracted for ${region}. Skipping.`);
      continue;
    }

    // Determine what categories to ask for
    const categoriesToHunt = [];
    if (existing4Star < 12) categoriesToHunt.push("4-star");
    if (existing3Star < 12) categoriesToHunt.push("3-star");
    if (existing5Star < 2) categoriesToHunt.push("5-star");

    if (categoriesToHunt.length === 0) {
      console.log(`   ✓ Quota filled for all categories in ${region}.`);
      continue;
    }

    console.log(`   🤖 Querying AI hotel directory for: ${categoriesToHunt.join(", ")} in ${region}...`);
    const candidates = await discoverHotelsForRegion(region, categoriesToHunt);
    console.log(`   📋 Found ${candidates.length} hotel candidate(s) for ${region}`);

    for (const hotel of candidates) {
      const hotelKey = `${hotel.name.trim().toLowerCase()}__${region.toLowerCase()}`;
      if (seen.has(hotelKey)) {
        continue;
      }

      // 5-star cap check
      if (hotel.star_category === "5-star") {
        const current5s = hotelsDb.filter(h => h.region === region && h.star_category === "5-star").length;
        if (current5s >= 2) {
          seen.add(hotelKey);
          saveSeenHotels(seen);
          continue;
        }
      }

      console.log(`\n   🏨 ${hotel.name} [${hotel.star_category || "4-star"}]`);
      console.log(`      📍 ${hotel.address || region}`);
      console.log(`      🌐 ${hotel.website || "(no website)"}`);

      let primaryEmail = null;
      let allEmails = [];

      if (hotel.website && hotel.website.startsWith("http")) {
        process.stdout.write(`      🔎 Scraping website for reservation/contracting emails... `);
        try {
          const scrapeRes = await scrapeHotelEmails(hotel.website);
          primaryEmail = scrapeRes.primaryEmail;
          allEmails = scrapeRes.allEmails;
          if (primaryEmail) {
            console.log(`✓ Found: ${primaryEmail}`);
          } else {
            console.log(`✗ (none found)`);
          }
        } catch (err) {
          console.log(`⚠ Scrape failed: ${err.message}`);
        }
      }

      const hotelRecord = {
        place_id: `ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: hotel.name,
        star_category: hotel.star_category || "4-star",
        star_rating: hotel.star_rating || (hotel.star_category === "3-star" ? 3 : 4),
        region: region,
        address: hotel.address || `${region}, Sri Lanka`,
        phone: hotel.phone || null,
        intl_phone: hotel.phone || null,
        website: hotel.website || null,
        email: primaryEmail,
        all_emails: allEmails,
        status: "DISCOVERED",
        rate_sheets: [],
        created_at: new Date().toISOString()
      };

      totalHotelsDiscovered++;

      // Send inquiry email if email found
      if (primaryEmail) {
        if (DRY_RUN) {
          console.log(`      ✅ [DRY-RUN] Would send B2B inquiry to: ${primaryEmail}`);
        } else {
          console.log(`      🚀 Sending B2B Rate Sheet inquiry email → ${primaryEmail}...`);
          const sendRes = await sendRateSheetInquiry(primaryEmail, {
            name: hotel.name,
            starCategory: hotel.star_category || "4-star",
            place_id: hotelRecord.place_id
          });

          if (sendRes.success) {
            hotelRecord.status = "EMAIL_SENT";
            hotelRecord.email_sent_at = new Date().toISOString();
            totalInquiriesSent++;
            notifyInquirySent(hotelRecord, primaryEmail).catch(() => {});
            console.log(`      ⏳ Hostinger rate limit safe pacing: waiting ${DELAY_BETWEEN_EMAILS_MS / 1000}s...`);
            await sleep(DELAY_BETWEEN_EMAILS_MS);
          }
        }
      }

      hotelsDb.push(hotelRecord);
      saveHotelsDb(hotelsDb);

      seen.add(hotelKey);
      saveSeenHotels(seen);
      notifyHotelDiscovered(hotelRecord).catch(() => {});

      // Short breathing room between candidates
      await sleep(1500);
    }
  }

  console.log(`\n${"═".repeat(68)}`);
  console.log(`🎉 ISLAND-WIDE HOTEL RATE HARVEST COMPLETE!`);
  console.log(`   🏨 Total Hotels Discovered: ${totalHotelsDiscovered}`);
  console.log(`   📧 B2B Rate Inquiries Sent: ${totalInquiriesSent}`);
  console.log(`   💾 Updated Database: hotels_db.json`);
  console.log(`${"═".repeat(68)}\n`);
}

main().catch(err => {
  console.error("Fatal error in island-wide hunter:", err);
  process.exit(1);
});
