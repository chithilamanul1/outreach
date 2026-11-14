#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════════════════
// Seranex Lanka Solutions - Autonomous Outreach Business Maker & Client Acquisition CLI
// ─────────────────────────────────────────────────────────────────────────────
// Discovers businesses across target industries (Restaurants, Hotels, Healthcare,
// Real Estate, Retail, Services), audits digital gaps (No website, broken web,
// missing booking/CRM software, no video ads), crafts AI hyper-personalized pitches,
// and executes multi-channel cold outreach (Email & WhatsApp) to close sales.
// ═══════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { AGENCY_PROFILE, BUSINESS_VERTICALS, TARGET_REGIONS, CORE_SERVICES } from "./config/businessCategories.js";
import { auditBusiness, generateAIPitch } from "./classifier.js";
import { scrapeWebsiteEmails } from "./email_scraper.js";
import { sendSeranixOutreachEmail } from "./email.js";
import { sendWhatsAppOutreach } from "./whatsapp.js";
import { notifyLeadDiscovered, notifyOutreachDispatched } from "./discord_notifier.js";

// ─── CONFIG & PERSISTENCE PATHS ───────────────────────────────────────────────

const LEADS_DB_PATH = "leads_db.json";
const SEEN_LEADS_PATH = "seen_leads.json";
const API_DELAY_MS = 400;

export function loadLeadsDb() {
  if (!existsSync(LEADS_DB_PATH)) return [];
  try {
    return JSON.parse(readFileSync(LEADS_DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function saveLeadsDb(leads) {
  writeFileSync(LEADS_DB_PATH, JSON.stringify(leads, null, 2), "utf-8");
}

export function loadSeenLeads() {
  if (!existsSync(SEEN_LEADS_PATH)) return new Set();
  try {
    const data = JSON.parse(readFileSync(SEEN_LEADS_PATH, "utf-8"));
    return new Set(data);
  } catch {
    return new Set();
  }
}

export function saveSeenLeads(seenSet) {
  writeFileSync(SEEN_LEADS_PATH, JSON.stringify([...seenSet], null, 2), "utf-8");
}

// ─── GOOGLE PLACES API CLIENT ─────────────────────────────────────────────────

export async function searchPlaces(query, apiKey) {
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

export async function getPlaceDetails(placeId, apiKey) {
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
    return data.result || null;
  } catch (err) {
    console.warn(`  ⚠ Place Details error: ${err.message}`);
    return null;
  }
}

// ─── CORE DISCOVERY & OUTREACH PIPELINE ───────────────────────────────────────

export async function discoverLeadsForCategory(verticalKey = "restaurants", targetRegion = null, options = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY is not set in environment.");
  }

  const vertical = BUSINESS_VERTICALS[verticalKey] || BUSINESS_VERTICALS.restaurants;
  const regionsToScan = targetRegion ? [targetRegion] : TARGET_REGIONS.sri_lanka.cities.slice(0, 5);

  const leads = loadLeadsDb();
  const seenLeads = loadSeenLeads();

  console.log(`\n═════════════════════════════════════════════════════════════════`);
  console.log(`🚀 SERANEX LANKA SOLUTIONS - AUTONOMOUS LEAD HUNTER`);
  console.log(`Hotline: 07228382638 | Web: https://seranex.lk`);
  console.log(`Target Industry: ${vertical.name}`);
  console.log(`Regions: ${regionsToScan.join(", ")}`);
  console.log(`═════════════════════════════════════════════════════════════════\n`);

  let discoveredCount = 0;

  for (const region of regionsToScan) {
    console.log(`\n📍 Scanning Region: ${region}...`);

    for (const queryPattern of vertical.searchKeywords.slice(0, 3)) {
      const fullQuery = `${queryPattern} ${region}`;
      console.log(`  🔎 Querying: "${fullQuery}"`);

      const results = await searchPlaces(fullQuery, apiKey);
      await sleep(API_DELAY_MS);

      for (const placeSummary of results) {
        const placeId = placeSummary.place_id;
        if (!placeId || seenLeads.has(placeId)) continue;

        seenLeads.add(placeId);
        saveSeenLeads(seenLeads);

        // Fetch detailed business info
        const details = await getPlaceDetails(placeId, apiKey);
        await sleep(API_DELAY_MS);

        if (!details) continue;

        // Perform business digital audit
        const audit = auditBusiness(details, verticalKey);

        // If business has a website, scrape contact email
        let scrapedEmail = null;
        if (audit.website && audit.website_status === "has_website") {
          try {
            console.log(`    🌐 Inspecting website for contact email: ${audit.website}`);
            const scrapeResult = await scrapeWebsiteEmails(audit.website);
            scrapedEmail = scrapeResult.primaryEmail || null;
            if (scrapedEmail) {
              console.log(`    ✉ Found contact email: ${scrapedEmail}`);
            }
          } catch (e) {
            // non-fatal
          }
        }

        // Generate tailored AI pitch
        console.log(`    ⚡ Generating bespoke AI Pitch for "${audit.name}"...`);
        const pitch = await generateAIPitch(audit, openRouterKey, model);

        const newLead = {
          place_id: placeId,
          name: audit.name,
          vertical: verticalKey,
          vertical_name: vertical.name,
          address: audit.address,
          region,
          phone: audit.phone,
          email: scrapedEmail,
          website: audit.website,
          website_status: audit.website_status,
          rating: audit.rating,
          review_count: audit.review_count,
          opportunity_score: audit.opportunity_score,
          recommended_service: audit.recommended_service,
          service_details: audit.service_details,
          detected_needs: audit.detected_needs,
          email_subject: pitch.email_subject,
          email_body: pitch.email_body,
          whatsapp_pitch: pitch.whatsapp_pitch,
          key_hook: pitch.key_hook,
          status: "DISCOVERED",
          discovered_at: new Date().toISOString(),
          outreach_history: []
        };

        // Automatic Outreach if requested
        if (options.sendEmails && scrapedEmail && !options.dryRun) {
          console.log(`    📨 Sending cold outreach email to ${scrapedEmail}...`);
          const emailRes = await sendSeranixOutreachEmail(scrapedEmail, newLead, pitch);
          if (emailRes.success) {
            newLead.status = "EMAIL_SENT";
            newLead.outreach_history.push({
              channel: "Email",
              target: scrapedEmail,
              sent_at: new Date().toISOString()
            });
            await notifyOutreachDispatched(newLead, "Email");
          }
          await sleep(20000); // 20s safe pacing
        }

        if (options.sendWhatsApp && audit.phone && !options.dryRun) {
          console.log(`    💬 Sending WhatsApp outreach to ${audit.phone}...`);
          const waRes = await sendWhatsAppOutreach(audit.phone, pitch.whatsapp_pitch, audit.name);
          if (waRes.success) {
            newLead.status = "WHATSAPP_SENT";
            newLead.outreach_history.push({
              channel: "WhatsApp",
              target: audit.phone,
              sent_at: new Date().toISOString()
            });
            await notifyOutreachDispatched(newLead, "WhatsApp");
          }
          await sleep(25000); // 25s safe pacing
        }

        // Notify Discord
        await notifyLeadDiscovered(newLead);

        // Save to DB
        leads.unshift(newLead);
        saveLeadsDb(leads);
        discoveredCount++;

        console.log(`    ✅ Stored lead: ${audit.name} (Opportunity: ${audit.opportunity_score}/100)`);
      }
    }
  }

  console.log(`\n🎉 Discovery scan complete! Added ${discoveredCount} new qualified business leads for Seranex Lanka Solutions.\n`);
  return { success: true, count: discoveredCount };
}

// ─── CLI RUNNER ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDirectRun = process.argv[1]?.endsWith("index.js");

if (isDirectRun) {
  const DRY_RUN = args.includes("--dry-run");
  const SEND_EMAILS = !DRY_RUN && args.includes("--email");
  const SEND_WHATSAPP = !DRY_RUN && args.includes("--whatsapp");

  let catArg = args.find((a) => a.startsWith("--category="));
  let category = catArg ? catArg.split("=")[1].toLowerCase() : "restaurants";

  let regArg = args.find((a) => a.startsWith("--region="));
  let region = regArg ? regArg.split("=")[1] : null;

  discoverLeadsForCategory(category, region, {
    dryRun: DRY_RUN,
    sendEmails: SEND_EMAILS,
    sendWhatsApp: SEND_WHATSAPP
  }).catch((err) => {
    console.error(`✖ Fatal Error: ${err.message}`);
    process.exit(1);
  });
}
