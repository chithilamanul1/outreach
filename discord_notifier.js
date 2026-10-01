/**
 * Discord Notifications Module
 * Posts real-time alerts and embeds to the user's Discord channel for all system activities:
 * - Hotels discovered in curated destinations
 * - Rate inquiry emails dispatched from b2b@oceanwaytours.com
 * - Rate sheets received from hotels
 * - AI pricing extraction into the Master Costing Big Sheet
 */

function getWebhookUrl() {
  return process.env.DISCORD_WEBHOOK_URL;
}

async function postEmbed(embed) {
  const url = getWebhookUrl();
  if (!url) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    return res.ok;
  } catch (err) {
    console.warn(`  ⚠ Discord webhook error: ${err.message}`);
    return false;
  }
}

/**
 * 1. Alert when a new hotel is discovered
 */
export async function notifyHotelDiscovered(hotel) {
  const embed = {
    title: `🏨 Hotel Discovered: ${hotel.name}`,
    color: 0x3b82f6, // Blue
    fields: [
      { name: "Destination", value: hotel.region || "Sri Lanka", inline: true },
      { name: "Star Category", value: `${hotel.star_category || "Hotel"} ⭐`, inline: true },
      { name: "Google Rating", value: `${hotel.rating || "N/A"} ⭐ (${hotel.review_count || 0} reviews)`, inline: true },
      { name: "Contact Email", value: hotel.email ? `\`${hotel.email}\`` : "Not found on site", inline: true },
      { name: "Phone", value: hotel.phone || "N/A", inline: true },
      { name: "Website", value: hotel.website ? `[Visit Site](${hotel.website})` : "None", inline: true },
    ],
    footer: { text: "Ocean Way Tours • Hotel Discovery" },
    timestamp: new Date().toISOString(),
  };
  return postEmbed(embed);
}

/**
 * 2. Alert when a rate inquiry email is sent
 */
export async function notifyInquirySent(hotel, recipientEmail) {
  const embed = {
    title: `📤 B2B Rate Sheet Request Sent: ${hotel.name}`,
    color: 0x8b5cf6, // Purple
    fields: [
      { name: "Hotel", value: hotel.name, inline: true },
      { name: "Destination", value: hotel.region || hotel.destination || "Sri Lanka", inline: true },
      { name: "Category", value: hotel.star_category || hotel.starCategory || "Hotel", inline: true },
      { name: "Recipient", value: `\`${recipientEmail}\``, inline: true },
      { name: "Sender", value: `\`${process.env.SMTP_USER || "b2b@oceanwaytours.com"}\``, inline: true },
      { name: "Status", value: "⏳ Awaiting Hotel Reply with Tariff", inline: true },
    ],
    footer: { text: "Ocean Way Tours • B2B Contracting" },
    timestamp: new Date().toISOString(),
  };
  return postEmbed(embed);
}

/**
 * 3. Alert when a hotel replies with a rate sheet
 */
export async function notifyRateSheetReceived(hotelName, destination, category, savedFiles = []) {
  const filesList = savedFiles.map(f => `• \`${f.split(/[\\/]/).pop()}\``).join("\n") || "Document attached";

  const embed = {
    title: `📥 RATE SHEET RECEIVED: ${hotelName}`,
    color: 0x10b981, // Emerald Green
    description: `A hotel replied to \`${process.env.SMTP_USER || "b2b@oceanwaytours.com"}\` with their contract rate sheet!`,
    fields: [
      { name: "Destination", value: destination || "Sri Lanka", inline: true },
      { name: "Star Category", value: category || "Hotel", inline: true },
      { name: "Saved Files", value: filesList, inline: false },
      { name: "Folder Path", value: `\`rate_sheets/${category}/${hotelName}/\``, inline: false },
    ],
    footer: { text: "Ocean Way Tours • Rate Ingestion" },
    timestamp: new Date().toISOString(),
  };
  return postEmbed(embed);
}

/**
 * 4. Alert when AI parses rate sheet into the Master Costing Big Sheet
 */
export async function notifyPricingParsedToBigSheet(hotelName, destination, category, rowsCount, sampleRates = []) {
  let sampleText = "No rates extracted";
  if (sampleRates && sampleRates.length > 0) {
    sampleText = sampleRates.map(r => {
      const bb = r.bbRate ? `$${r.bbRate}` : "-";
      const hb = r.hbRate ? `$${r.hbRate}` : "-";
      const fb = r.fbRate ? `$${r.fbRate}` : "-";
      return `• **${r.roomType}** (${r.season}): BB: **${bb}** | HB: **${hb}** | FB: **${fb}**`;
    }).join("\n");
  }

  const embed = {
    title: `📊 Big Sheet Updated: ${rowsCount} Rates Added for ${hotelName}`,
    color: 0xf59e0b, // Amber / Gold
    description: `AI successfully extracted room pricing into the **Master Costing Big Sheet**!`,
    fields: [
      { name: "Destination", value: destination || "Sri Lanka", inline: true },
      { name: "Category", value: category || "Hotel", inline: true },
      { name: "Total Pricing Lines", value: `${rowsCount} room/season options`, inline: true },
      { name: "Sample Contracted Rates", value: sampleText, inline: false },
      { name: "Excel Export", value: `[Download Updated Excel](http://localhost:3000/api/costing-sheet/download)`, inline: false },
    ],
    footer: { text: "Ocean Way Tours • Master Costing System" },
    timestamp: new Date().toISOString(),
  };
  return postEmbed(embed);
}
