/**
 * Seranex Lanka Solutions - Discord Notifications Module
 * Posts real-time alerts and embeds to your Discord channel for all sales activity:
 * - New business prospects discovered & audited
 * - Personalized outreach emails & WhatsApp messages dispatched
 * - Missed calls received or triggered
 * - Incoming client replies
 * - 🔥 HOT LEADS ready to close!
 */

import { AGENCY_PROFILE } from "./config/businessCategories.js";

function getWebhookUrl() {
  return process.env.DISCORD_HOT_LEADS_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;
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
 * 1. Alert when a new prospective business is discovered
 */
export async function notifyLeadDiscovered(lead) {
  const embed = {
    title: `🔍 Prospect Discovered: ${lead.name}`,
    color: 0x6366f1, // Indigo
    description: `Identified by Seranex Lanka Solutions Lead Engine (${lead.vertical_name || lead.vertical})`,
    fields: [
      { name: "Industry", value: lead.vertical_name || lead.vertical || "Business", inline: true },
      { name: "Location", value: lead.address || "Sri Lanka", inline: true },
      { name: "Opportunity Score", value: `🔥 ${lead.opportunity_score || 80}/100`, inline: true },
      { name: "Website Status", value: lead.website_status === "none" ? "🔴 No Website" : lead.website_status === "social_only" ? "🟠 Social Only" : `🟢 [Visit Site](${lead.website})`, inline: true },
      { name: "Phone", value: lead.phone || "N/A", inline: true },
      { name: "Email", value: lead.email ? `\`${lead.email}\`` : "Scraping / Missing", inline: true },
      { name: "Recommended Solution", value: `⭐ **${lead.service_details?.name || lead.recommended_service || "Web & Software"}**`, inline: false },
    ],
    footer: { text: "Seranex Lanka Solutions • Autonomous Lead Hunter" },
    timestamp: new Date().toISOString(),
  };
  return postEmbed(embed);
}

/**
 * 2. Alert when cold outreach is dispatched
 */
export async function notifyOutreachDispatched(lead, channel = "Email") {
  const embed = {
    title: `📤 Outreach Dispatched via ${channel}: ${lead.name}`,
    color: channel === "WhatsApp" ? 0x22c55e : channel === "Missed Call" ? 0xf59e0b : 0x3b82f6,
    fields: [
      { name: "Business", value: lead.name, inline: true },
      { name: "Channel", value: channel, inline: true },
      { name: "Target", value: channel === "Email" ? `\`${lead.email}\`` : `\`${lead.phone}\``, inline: true },
      { name: "Service Pitched", value: lead.service_details?.name || lead.recommended_service || "Digital Growth", inline: true },
      { name: "Hotline", value: "0728382638", inline: true },
      { name: "Status", value: "⏳ Awaiting Client Reply", inline: true },
    ],
    footer: { text: "Seranex Lanka Solutions • Sales Pipeline" },
    timestamp: new Date().toISOString(),
  };
  return postEmbed(embed);
}

/**
 * 3. Alert when a prospect replies, qualifies as HOT / WARM, or calls our hotline
 */
export async function notifyHotLead(phone, businessName, classification, conversationHistory) {
  const colorMap = { HOT: 0xef4444, WARM: 0xf59e0b, COLD: 0x94a3b8 };
  const emojiMap = { HOT: "🔥 HOT LEAD ALERT", WARM: "🟡 WARM LEAD REPLY", COLD: "❄️ Lead Feedback" };

  const recentMsgs = conversationHistory
    .slice(-4)
    .map((m) => `**${m.role === "user" ? "Client" : "Seranex AI"}:** ${m.content.slice(0, 180)}`)
    .join("\n") || "No message history";

  const embed = {
    title: `${emojiMap[classification] || "📱 Lead Update"}: ${businessName || phone}`,
    color: colorMap[classification] || 0x6366f1,
    description: `A prospect is actively conversing with the Seranex Lanka Solutions Sales Closer!`,
    fields: [
      { name: "Business Name", value: businessName || "Prospective Client", inline: true },
      { name: "Phone / Contact", value: phone ? `+${phone}` : "N/A", inline: true },
      { name: "Classification", value: `**${classification}**`, inline: true },
      { name: "Recent Interaction", value: recentMsgs, inline: false },
      { name: "Next Step", value: classification === "HOT" ? "🚨 **ACTION: Call client immediately from hotline 0728382638 to close deal!**" : "AI Agent is actively nurturing lead.", inline: false }
    ],
    footer: { text: "Seranex Lanka Solutions • Autonomous Sales Closer" },
    timestamp: new Date().toISOString(),
  };
  return postEmbed(embed);
}
