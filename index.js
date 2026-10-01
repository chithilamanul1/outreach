#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════════════════
// Sri Lanka Travel Agency - Hotel Rate Sheet Harvester
// Discovers 3-star, 4-star, and 5-star hotels category-by-category across Sri Lanka,
// scrapes reservation emails, dispatches B2B rate sheet requests,
// and organizes received rate sheets into folders.
// ═══════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { STAR_CATEGORIES, SRI_LANKA_REGIONS } from "./config/hotelCategories.js";
import { quickFilter, verifyStarRating } from "./classifier.js";
import { scrapeHotelEmails } from "./email_scraper.js";
import { sendRateSheetInquiry, generateRateInquiryText } from "./email.js";
import { syncRateSheetsFromInbox } from "./inbox_harvester.js";
import { notifyHotelDiscovered, notifyInquirySent } from "./discord_notifier.js";

// ─── CONFIG & PATHS ────────────────────────────────────────────────────────────

const API_DELAY_MS = 350;
const HOTELS_DB_PATH = "hotels_db.json";
const SEEN_HOTELS_PATH = "seen_hotels.json";

// ─── CLI ARGUMENTS ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SYNC_INBOX_ONLY = args.includes("--sync-inbox");
const SEND_EMAILS = !DRY_RUN && !args.includes("--no-email");

// Parse category: default to 5-star if not specified, or all
let targetCategoryArg = args.find((a) => a.startsWith("--category="));
let targetCategory = targetCategoryArg ? targetCategoryArg.split("=")[1].toLowerCase() : "5-star";

let targetRegionArg = args.find((a) => a.startsWith("--region="));
let targetRegion = targetRegionArg ? targetRegionArg.split("=")[1] : null;

// ─── DATABASE HELPERS ──────────────────────────────────────────────────────────

export function loadHotelsDb() {
  if (!existsSync(HOTELS_DB_PATH)) return [];
  try {
    return JSON.parse(readFileSync(HOTELS_DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function saveHotelsDb(hotels) {
  writeFileSync(HOTELS_DB_PATH, JSON.stringify(hotels, null, 2), "utf-8");
}

function loadSeenHotels() {
  if (!existsSync(SEEN_HOTELS_PATH)) return new Set();
  try {
    const data = JSON.parse(readFileSync(SEEN_HOTELS_PATH, "utf-8"));
    return new Set(data);
  } catch {
    return new Set();
  }
}

function saveSeenHotels(seenSet) {
  writeFileSync(SEEN_HOTELS_PATH, JSON.stringify([...seenSet], null, 2), "utf-8");
}

// ─── GOOGLE PLACES API ─────────────────────────────────────────────────────────

async function searchPlaces(query, apiKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn(`  ⚠ Places API status: ${data.status} for "${query}"`);
      return [];
    }
    return data.results || [];
  } catch (err) {
    console.warn(`  ⚠ Places Search error for "${query}": ${err.message}`);
    return [];
  }
}

async function getPlaceDetails(placeId, apiKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    "name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,place_id,types"
  );
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK") return null;
    return data.result || null;
  } catch {
    return null;
  }
}

// ─── HARVESTING ENGINE ─────────────────────────────────────────────────────────

export async function harvestHotelsForCategory(categoryKey, regionFilter = null, options = {}) {
  const catConfig = STAR_CATEGORIES[categoryKey];
  if (!catConfig) {
    console.error(`✖ Unknown star category: ${categoryKey}. Use: 3-star, 4-star, or 5-star.`);
    return [];
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("✖ Missing GOOGLE_PLACES_API_KEY in .env");
    return [];
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`🏨 Searching ${catConfig.badge} ${catConfig.name} in Sri Lanka`);
  if (regionFilter) console.log(`📍 Filtered to Region: ${regionFilter}`);
  console.log(`════════════════════════════════════════════════════════════════\n`);

  const hotelsDb = loadHotelsDb();
  const seen = loadSeenHotels();
  const regionsToSearch = regionFilter ? [regionFilter] : SRI_LANKA_REGIONS;

  let discoveredCount = 0;
  let emailsFoundCount = 0;
  let emailsSentCount = 0;

  const maxQuota = catConfig.maxPerLocation || (categoryKey === "5-star" ? 2 : 15);

  for (const queryTerm of catConfig.searchQueries) {
    for (const region of regionsToSearch) {
      // Check if quota for this category in this region is already filled
      const existingInRegion = hotelsDb.filter(
        (h) => h.region === region && h.star_category === categoryKey
      ).length;

      if (existingInRegion >= maxQuota) {
        if (categoryKey === "5-star") {
          console.log(`  ⏹ 5-Star quota satisfied for ${region} (${existingInRegion}/${maxQuota} hotels).`);
        }
        continue;
      }

      const query = `${queryTerm} in ${region}, Sri Lanka`;
      console.log(`🔍 Query: "${query}"`);

      const results = await searchPlaces(query, apiKey);
      await sleep(API_DELAY_MS);

      for (const place of results) {
        // Enforce quota before processing each place
        const currentCount = hotelsDb.filter(
          (h) => h.region === region && h.star_category === categoryKey
        ).length;
        if (currentCount >= maxQuota) {
          console.log(`  ✅ Quota reached for ${catConfig.name} in ${region} (${currentCount}/${maxQuota}).`);
          break;
        }

        const placeId = place.place_id;

        // Skip if already in DB
        if (seen.has(placeId)) continue;

        // Pre-filter out budget homestays / hostels if searching 4 or 5 star
        const filterCheck = quickFilter(place, categoryKey);
        if (!filterCheck.valid) {
          seen.add(placeId);
          saveSeenHotels(seen);
          continue;
        }

        // Fetch deep details
        const details = await getPlaceDetails(placeId, apiKey);
        await sleep(API_DELAY_MS);
        if (!details) continue;

        // Verify Star Rating classification strictly
        const verification = await verifyStarRating(details, categoryKey, openRouterKey, openRouterModel);
        if (!verification.verified) {
          console.log(`  🚫 Skipped: "${details.name}" does not match ${catConfig.name} criteria.`);
          seen.add(placeId);
          saveSeenHotels(seen);
          continue;
        }

        console.log(`\n✨ Matched Hotel: ${details.name} [${catConfig.name}]`);
        console.log(`   📍 Address: ${details.formatted_address || "N/A"}`);
        console.log(`   📞 Phone:   ${details.formatted_phone_number || "N/A"}`);
        console.log(`   🌐 Website: ${details.website || "None"}`);

        // Scrape official reservation & sales emails from website
        let primaryEmail = null;
        let allEmails = [];

        if (details.website) {
          console.log(`   🔎 Scraping website for reservation/sales emails...`);
          const scrapeRes = await scrapeHotelEmails(details.website);
          primaryEmail = scrapeRes.primaryEmail;
          allEmails = scrapeRes.allEmails;

          if (primaryEmail) {
            console.log(`   ✉ Found Email: ${primaryEmail}`);
            emailsFoundCount++;
          } else {
            console.log(`   ⚠ No email found on website`);
          }
        }

        const newHotel = {
          place_id: placeId,
          name: details.name,
          star_category: categoryKey,
          star_rating: catConfig.starRating,
          region: region,
          address: details.formatted_address || null,
          phone: details.formatted_phone_number || null,
          intl_phone: details.international_phone_number || null,
          website: details.website || null,
          rating: details.rating || null,
          review_count: details.user_ratings_total || 0,
          email: primaryEmail,
          all_emails: allEmails,
          status: "DISCOVERED",
          rate_sheets: [],
          created_at: new Date().toISOString()
        };

        // Send rate sheet request if email exists and emailing is enabled
        if (options.sendEmails && primaryEmail) {
          console.log(`   🚀 Dispatching B2B Rate Sheet inquiry email...`);
          const sendRes = await sendRateSheetInquiry(primaryEmail, {
            name: details.name,
            starCategory: catConfig.name,
            place_id: placeId
          });

          if (sendRes.success) {
            newHotel.status = "EMAIL_SENT";
            newHotel.email_sent_at = new Date().toISOString();
            emailsSentCount++;
            notifyInquirySent(newHotel, primaryEmail).catch(() => {});
            console.log(`   ⏳ Hostinger rate limit protection: waiting 20s before next email...`);
            await sleep(20000);
          }
        }

        hotelsDb.push(newHotel);
        saveHotelsDb(hotelsDb);

        // Discord Notification for hotel discovery
        notifyHotelDiscovered(newHotel).catch(() => {});

        seen.add(placeId);
        saveSeenHotels(seen);
        discoveredCount++;
      }
    }
  }

  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`✅ Scan finished for ${catConfig.name}!`);
  console.log(`   Total Hotels Discovered: ${discoveredCount}`);
  console.log(`   Emails Found:           ${emailsFoundCount}`);
  console.log(`   Inquiry Emails Sent:    ${emailsSentCount}`);
  console.log(`────────────────────────────────────────────────────────\n`);

  return hotelsDb;
}

// ─── MAIN RUNNER ──────────────────────────────────────────────────────────────

async function main() {
  if (SYNC_INBOX_ONLY) {
    console.log("📬 Running Inbox Sync to harvest rate sheet replies...");
    await syncRateSheetsFromInbox();
    return;
  }

  const categoriesToRun =
    targetCategory === "all" ? ["4-star", "3-star", "5-star"] : [targetCategory];

  for (const cat of categoriesToRun) {
    await harvestHotelsForCategory(cat, targetRegion, {
      sendEmails: SEND_EMAILS
    });
  }

  // Check if we should sync inbox afterwards
  if (!DRY_RUN && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    console.log("\nChecking for any rate sheet replies in inbox...");
    await syncRateSheetsFromInbox();
  }
}

import { fileURLToPath } from "node:url";

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith("index.js") ||
  fileURLToPath(import.meta.url) === process.argv[1]
);

if (isDirectRun) {
  main().catch((err) => {
    console.error("✖ Fatal Error:", err);
    process.exit(1);
  });
}
