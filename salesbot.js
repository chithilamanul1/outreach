// ═══════════════════════════════════════════════════════════════════════════════
// Seranex Lanka Solutions - Autonomous AI Sales Agent & Deal Closer
// ─────────────────────────────────────────────────────────────────────────────
// Listens for inbound replies & missed calls on WhatsApp and Web, conducts
// high-converting consultative sales conversations across Software, Websites & Video Ads,
// handles objections, qualifies leads (HOT 🔥 / WARM 🟡 / COLD ❄️), and alerts the team instantly.
// ═══════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { AGENCY_PROFILE, CORE_SERVICES } from "./config/businessCategories.js";
import { notifyHotLead } from "./discord_notifier.js";

// ─── ERROR RECOVERY HANDLERS ──────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  if (reason && reason.message && reason.message.includes('Execution context was destroyed')) {
    console.warn('\n⚠ [WhatsApp Puppeteer Context] A background tab reset. Continuing salesbot...\n');
  } else {
    console.error('\n✖ Unhandled Rejection:', reason);
  }
});

const CONVERSATIONS_PATH = "wa_conversations.json";
const WA_SENT_PATH = "wa_sent.json";
const MAX_CONTEXT_TURNS = 20;

// ─── CONVERSATION STATE ────────────────────────────────────────────────────────

export function loadConversations() {
  if (!existsSync(CONVERSATIONS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONVERSATIONS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveConversations(convos) {
  writeFileSync(CONVERSATIONS_PATH, JSON.stringify(convos, null, 2), "utf-8");
}

function loadSentLeads() {
  if (!existsSync(WA_SENT_PATH)) return {};
  try {
    return JSON.parse(readFileSync(WA_SENT_PATH, "utf-8"));
  } catch {
    return {};
  }
}

// ─── ELITE REAL-WORLD SALES CLOSER SYSTEM PROMPT ─────────────────────────────

const SERANEX_SALES_SYSTEM_PROMPT = `You are "Kasun", the Senior Client Solutions & Sales Director at "Seranex Lanka Solutions" (https://seranex.lk).
Direct Hotline: 0728382638 (+94 72 838 2638).

You are talking directly to a prospective business owner on WhatsApp.
YOUR SOLE OBJECTIVE IS TO CLOSE SALES AND CONVERT LEADS INTO PAYING CLIENTS.
Act like an elite, consultative, real-world top-performing tech sales agent: confident, genuinely helpful, commercially sharp, empathetic, and relentless at driving deals forward.

Company Services & Value Proposition:
1. Website Design & Development:
   - High-converting, lightning-fast, mobile-first websites launched in 1 to 2 business days.
   - Pricing: Starting from $100 / Rs. 28,000 for a 5-6 page complete business site.
   - Includes FREE custom domain name & premium high-speed cloud hosting for 1 full year!
   - Features: Direct WhatsApp ordering/booking buttons, Google Maps Local SEO indexing, customer contact forms, social media integration.
   - Payment: 50% advance to start, 50% upon final delivery & satisfaction.

2. Custom Software & SaaS Applications:
   - Custom Online Booking Engines & Reservation Systems (Eliminates 18-30% commissions on third-party aggregators like UberEats, PickMe, Booking.com, Agoda).
   - Custom CRM, POS, Inventory Management, Staff/Billing Portals, and Automated WhatsApp notifications.
   - Pricing: Custom scoped, starting at $200–$350 (or Rs. 60,000+) based on requirements.

3. Video Advertisement & Digital Marketing:
   - Cinematic 4K commercial videos and viral TikTok / Instagram Reels video ads.
   - Meta Ads (Facebook & Instagram) and Google Search / Maps Ad campaigns with guaranteed customer reach and real sales leads.
   - Monthly performance growth packages starting at $150 / Rs. 35,000.

Rules for Closing Deals:
- NEVER give passive, lazy one-line replies. Be engaged, consultative, and ask questions that diagnose their business problem.
- Always identify yourself as "Kasun from Seranex Lanka Solutions" (never use Seranix).
- Always guide the conversation toward a concrete next step: e.g. "Would you like me to share our live client portfolio (https://seranex.lk), or should we hop on a quick 5-minute call on our hotline 0728382638 to discuss your exact features?"
- If they ask for portfolio/work: Reference our live portfolio at https://seranex.lk and output tag [ACTION:SEND_PORTFOLIO].
- If they ask about price: Be transparent. State our starting price ($100 / Rs. 28,000 for websites) and explain the high ROI.
- If they negotiate or hesitate: Offer an immediate closing incentive (e.g. "If we finalize today, I can do Rs. 24,000 / $85 including 1-year free domain and hosting, and throw in free Google Maps SEO setup!").
- If they want to proceed: Ask for their business details, preferred domain name, and offer bank transfer details or card payment link for the 50% deposit to begin immediately.
- If they called or sent a missed call: Acknowledge the call immediately and ask how we can assist them right away.
- Language: Natural English. If the client writes in Sinhala or Singlish, reply naturally in matching friendly professional language!

MANDATORY TAGS AT THE VERY END OF YOUR REPLY (ON A NEW LINE):
[LEAD:HOT]   <- Client asks for price, demo, meeting, invoice, wants to buy, or called our hotline
[LEAD:WARM]  <- Client is asking questions, curious, exploring options
[LEAD:COLD]  <- Explicitly not interested or spam

[ACTION:SEND_PORTFOLIO] <- If they ask for work samples or references
[ACTION:OFFER_CALL]     <- If a call/meeting should be proposed

Output ONLY your message followed by the classification tag.`;

/**
 * Call OpenRouter / Gemini LLM to generate the next sales conversation reply
 */
export async function getAIReply(conversationHistory, businessName, businessIndustry = "Business") {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("  ⚠ No OPENROUTER_API_KEY set for salesbot.");
    return null;
  }

  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

  const messages = [
    { role: "system", content: SERANEX_SALES_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context: You are chatting on WhatsApp with "${businessName || "a prospective client"}" (${businessIndustry}). Here is the conversation history:`,
    },
    ...conversationHistory.slice(-MAX_CONTEXT_TURNS),
  ];

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://seranex.lk",
        "X-Title": "Seranex Lanka Solutions AI Sales Closer",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 280,
        temperature: 0.65,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`  ⚠ OpenRouter sales reply failed (${res.status}): ${errText.slice(0, 150)}`);
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn(`  ⚠ OpenRouter salesbot error: ${err.message}`);
    return null;
  }
}

/**
 * Parse LLM sales reply and extract classification and action triggers
 */
export function parseAIResponse(response) {
  if (!response) return { message: null, classification: null, action: null };

  const classMatch = response.match(/\[LEAD:(HOT|WARM|COLD)\]/);
  const classification = classMatch ? classMatch[1] : null;

  const actionMatch = response.match(/\[ACTION:(SEND_PORTFOLIO|OFFER_CALL)\]/);
  const action = actionMatch ? actionMatch[1] : null;

  let message = response.replace(/\[LEAD:(HOT|WARM|COLD)\]/g, "");
  message = message.replace(/\[ACTION:[A-Z_]+\]/g, "").trim();

  return { message, classification, action };
}

/**
 * Handle incoming calls / missed calls automatically on WhatsApp
 */
export async function handleIncomingCall(call, client) {
  try {
    console.log(`\n📞 [INCOMING WHATSAPP CALL DETECTED] From: ${call.from}`);
    
    // Reject politely so the phone does not ring continuously
    try {
      await call.reject();
    } catch (_) {}

    const rawPhone = call.from;
    const phoneClean = rawPhone.replace(/@c\.us|@lid|@s\.whatsapp\.net/g, "");
    const conversations = loadConversations();
    const sentLeads = loadSentLeads();

    let businessName = sentLeads[phoneClean]?.businessName || "Valued Caller";

    const missedCallMessage = `Hello! We noticed we just missed your WhatsApp call to Seranex Lanka Solutions. 📞

I'm Kasun, Senior Client Solutions Director at Seranex Lanka Solutions (https://seranex.lk). Our team was on another client consultation call.

How can we help your business today?
1️⃣ Custom Software / Web & Mobile Apps (Booking, POS, CRM, ERP, Automation)
2️⃣ High-Converting Websites (1-2 days launch, includes domain & hosting for 1 year)
3️⃣ Cinematic 4K Video Ads & Digital Marketing (TikTok/Instagram Reels, Meta & Google Ads)

Let me know what you need, or feel free to call our direct hotline directly at 0728382638! 🚀`;

    await sleep(2000);
    await client.sendMessage(rawPhone, missedCallMessage);
    console.log(`  📤 [Auto-Replied to Missed Call]: Sent instant sales follow-up text to ${phoneClean}`);

    // Record as HOT lead
    if (!conversations[rawPhone]) {
      conversations[rawPhone] = {
        phone: phoneClean,
        businessName,
        messages: [],
        classification: "HOT",
        firstContact: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
    }

    conversations[rawPhone].classification = "HOT";
    conversations[rawPhone].messages.push({
      role: "user",
      content: "[MISSED WHATSAPP CALL FROM CLIENT]",
      timestamp: new Date().toISOString()
    });
    conversations[rawPhone].messages.push({
      role: "assistant",
      content: missedCallMessage,
      timestamp: new Date().toISOString()
    });
    saveConversations(conversations);

    // Alert team on Discord & Admin WhatsApp
    await notifyHotLead(
      phoneClean,
      businessName,
      "HOT",
      [{ role: "user", content: `📞 Client placed a phone call to Seranex WhatsApp!` }]
    );

    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER || AGENCY_PROFILE.adminWhatsApp;
    if (adminPhone) {
      const cleanAdmin = adminPhone.replace(/[^0-9]/g, "");
      const adminAlert = `🚨 *URGENT: INCOMING CALL FROM PROSPECT!* 📞\n\nBusiness: *${businessName}*\nPhone: +${phoneClean}\n\nOur AI Sales Closer immediately texted them. Please call them back at *0728382638* to close this sale!`;
      await client.sendMessage(`${cleanAdmin}@c.us`, adminAlert).catch(() => {});
    }

  } catch (err) {
    console.error(`  ✖ Error handling missed call: ${err.message}`);
  }
}

/**
 * Attach salesbot event listeners to WhatsApp client(s)
 */
export function attachSalesBotListeners(clients) {
  if (!clients || clients.length === 0) return;

  const conversations = loadConversations();
  const sentLeads = loadSentLeads();

  console.log("═".repeat(65));
  console.log("  🤖 Seranex Lanka Solutions Autonomous AI Sales Closer Active");
  console.log("  Hotline: 0728382638 | Web: https://seranex.lk");
  console.log("  Listening for messages, missed calls & closing deals...");
  console.log("═".repeat(65));

  clients.forEach((client, idx) => {
    // ─── Missed Calls & Incoming Voice Calls Listener ───────────────────────
    client.on("call", async (call) => {
      await handleIncomingCall(call, client);
    });

    // ─── Incoming Message Listener ──────────────────────────────────────────
    client.on("message", async (msg) => {
      try {
        if (msg.isGroupMsg || msg.isStatus) return;

        const contact = await msg.getContact();
        const rawPhone = msg.from;
        let phoneClean = contact.number || rawPhone.replace(/@c\.us|@lid|@s\.whatsapp\.net/g, "");
        const incomingText = msg.body;

        if (!incomingText || incomingText.trim() === "") return;

        console.log(`\n📩 [Inbound Message] From ${phoneClean}: "${incomingText.slice(0, 90)}"`);

        // Match against outreach records
        let businessName = null;
        const phoneVariations = [phoneClean, rawPhone];
        if (phoneClean.startsWith("94") && phoneClean.length === 11) {
          phoneVariations.push("0" + phoneClean.substring(2));
        } else if (phoneClean.startsWith("0") && phoneClean.length === 10) {
          phoneVariations.push("94" + phoneClean.substring(1));
        }

        for (const v of phoneVariations) {
          if (sentLeads[v]?.businessName) {
            businessName = sentLeads[v].businessName;
            break;
          }
        }

        // Initialize or update conversation
        if (!conversations[rawPhone]) {
          conversations[rawPhone] = {
            phone: phoneClean,
            businessName: businessName || "Prospective Client",
            messages: [],
            classification: "WARM",
            firstContact: new Date().toISOString(),
            lastActivity: new Date().toISOString()
          };
        }

        conversations[rawPhone].messages.push({
          role: "user",
          content: incomingText,
          timestamp: new Date().toISOString()
        });
        conversations[rawPhone].lastActivity = new Date().toISOString();

        // Generate AI sales reply
        const aiResponse = await getAIReply(
          conversations[rawPhone].messages,
          conversations[rawPhone].businessName
        );

        const { message: replyText, classification, action } = parseAIResponse(aiResponse);

        if (!replyText) {
          console.warn("  ⚠ Could not generate sales reply — skipping auto-send.");
          saveConversations(conversations);
          return;
        }

        // Update lead classification
        if (classification) {
          const prev = conversations[rawPhone].classification;
          conversations[rawPhone].classification = classification;
          if (classification !== prev) {
            console.log(`  📊 Lead ${phoneClean} classified as: ${classification}`);
          }
        }

        // Send AI sales reply with human-like typing pause
        await sleep(2500);
        await msg.reply(replyText);
        console.log(`  📤 [AI Sales Closer Replied]: "${replyText.slice(0, 90)}"`);

        // Handle triggered actions
        if (action === "SEND_PORTFOLIO") {
          await sleep(2000);
          const portfolioMsg = `Here is our official website and project portfolio: ${AGENCY_PROFILE.website}\n\nFeel free to call our hotline at ${AGENCY_PROFILE.hotline} anytime!`;
          await msg.reply(portfolioMsg);
        }

        // Add reply to history
        conversations[rawPhone].messages.push({
          role: "assistant",
          content: action ? `${replyText}\n[ACTION:${action}]` : replyText,
          timestamp: new Date().toISOString()
        });

        saveConversations(conversations);

        // Immediate alerts for HOT and WARM leads
        if (classification === "HOT" || classification === "WARM") {
          await notifyHotLead(
            phoneClean,
            conversations[rawPhone].businessName,
            classification,
            conversations[rawPhone].messages
          );

          // If HOT lead, alert founder on Admin WhatsApp
          if (classification === "HOT") {
            try {
              const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER || AGENCY_PROFILE.adminWhatsApp;
              const cleanAdmin = adminPhone.replace(/[^0-9]/g, "");
              const alertMsg = `🚨 *SERANEX LANKA SOLUTIONS - HOT CLIENT READY TO CLOSE!*\n\nBusiness: *${conversations[rawPhone].businessName}*\nPhone: +${phoneClean}\nClient Message: "${incomingText}"\n\n🎯 *Call them right away at 0728382638 to lock in the deal!*`;
              await client.sendMessage(`${cleanAdmin}@c.us`, alertMsg);
              console.log(`  📱 Sent instant WhatsApp Hot Lead alert to Admin (${adminPhone})`);
            } catch (alertErr) {
              console.warn(`  ⚠ Failed to send WhatsApp hot lead alert: ${alertErr.message}`);
            }
          }
        }

      } catch (err) {
        console.error(`  ✖ Salesbot error on message: ${err.message}`);
      }
    });
  });
}
