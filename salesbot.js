// ═══════════════════════════════════════════════════════════════════════════════
// WhatsApp Sales Bot
// Listens for replies to outreach messages, uses LLM to handle conversations,
// and logs hot leads to Discord
// ═══════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode-terminal";

// ─── GLOBAL ERROR HANDLERS ────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message && reason.message.includes('Execution context was destroyed')) {
    console.warn('\n⚠ [Puppeteer Error Caught] A WhatsApp background tab had a context error. The bot will try to continue with the remaining accounts.\n');
  } else {
    console.error('\n✖ Unhandled Rejection:', reason);
  }
});

process.on('uncaughtException', (err) => {
  if (err && err.message && err.message.includes('Execution context was destroyed')) {
    console.warn('\n⚠ [Puppeteer Error Caught] A WhatsApp background tab had a context error. Continuing...\n');
  } else {
    console.error('\n✖ Uncaught Exception:', err);
  }
});

// ─── CONFIG ─────────────────────────────────────────────────────────────────────

// Path to conversation history (persisted between restarts)
const CONVERSATIONS_PATH = "wa_conversations.json";

// Max conversation turns to keep in LLM context per lead
const MAX_CONTEXT_TURNS = 20;

// Discord webhook for hot leads (uses same env var or a separate one)
const DISCORD_HOT_LEADS_WEBHOOK = process.env.DISCORD_HOT_LEADS_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;

// ─── ENV VALIDATION ─────────────────────────────────────────────────────────────

const REQUIRED_ENV = ["OPENROUTER_API_KEY"];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `\n✖ Missing required environment variables:\n  ${missing.join("\n  ")}\n`
    );
    console.error("  Make sure your .env file has OPENROUTER_API_KEY set.\n");
    process.exit(1);
  }
}

// ─── CONVERSATION STATE ─────────────────────────────────────────────────────────

function loadConversations() {
  if (!existsSync(CONVERSATIONS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONVERSATIONS_PATH, "utf-8"));
  } catch {
    console.warn("⚠ Could not parse wa_conversations.json — starting fresh.");
    return {};
  }
}

function saveConversations(convos) {
  writeFileSync(CONVERSATIONS_PATH, JSON.stringify(convos, null, 2), "utf-8");
}

// ─── LEAD DATA LOOKUP ───────────────────────────────────────────────────────────

function loadSeenLeads() {
  // Load the wa_sent.json to match phone numbers to business names
  if (!existsSync("wa_sent.json")) return {};
  try {
    return JSON.parse(readFileSync("wa_sent.json", "utf-8"));
  } catch {
    return {};
  }
}

// ─── LLM SALES AGENT ───────────────────────────────────────────────────────────

const SALES_SYSTEM_PROMPT = `You are a friendly, professional representative from Seranex Digital, a global web design company. You're following up on outreach messages you sent to businesses.

Your goal is to convert interested leads into paying clients for website design services.

Key facts about your service:
- Company Website: https://seranex.lk
- You build and launch full websites in 1-2 days
- Pricing: $100 for a 6-page static website
- The price INCLUDES domain and hosting for a year
- Extra charges apply for a cooler or more complex design
- Mobile-friendly, fast-loading, SEO-optimized
- You can include online booking, photo galleries, Google Maps, contact forms
- Payment: 50% upfront, 50% on delivery

Conversation rules:
- Be warm, professional, and genuinely helpful — never pushy
- If they ask for examples, say you'll send portfolio links shortly, and output the tag [ACTION:SEND_PORTFOLIO]
- If they negotiate price, you can go as low as $80 for a basic site
- If they say yes or want to proceed, ask for: their business name, what features they want, and any reference websites they like
- If they say no or not interested, thank them politely and say you're available if they change their mind
- Keep responses SHORT (2-3 sentences max) — this is WhatsApp, not email
- Write in English but be natural — use simple language
- No emojis unless they use them first
- If the conversation seems to be going well (they're asking questions, showing interest), classify the lead as HOT
- If they only ask about price or want a discount, classify as WARM
- If they're not interested, classify as COLD
- If they ask about payment methods, say you accept:
  Bank transfer, or Online Payment (Credit/Debit Card)

IMPORTANT: After your message, on a NEW LINE, add a classification tag exactly like this:
[LEAD:HOT] or [LEAD:WARM] or [LEAD:COLD]

Also add action tags if applicable on a new line:
[ACTION:SEND_PORTFOLIO]

Output ONLY your reply message followed by the classification tag. Nothing else.`;

async function getAIReply(conversationHistory, businessName) {
  const model = process.env.OPENROUTER_MODEL || "anthropic/claude-3-haiku";

  const messages = [
    { role: "system", content: SALES_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context: You're chatting with someone from "${businessName || "a tourism business"}" in Sri Lanka. Here's the conversation so far:`,
    },
    ...conversationHistory.slice(-MAX_CONTEXT_TURNS),
  ];

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/lead-finder",
        "X-Title": "Sri Lanka Tourism Lead Finder - Sales Bot",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(`  ⚠ OpenRouter failed (${res.status}): ${body.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn(`  ⚠ OpenRouter error: ${err.message}`);
    return null;
  }
}

/**
 * Parse the LLM response to extract the message and lead classification.
 */
function parseAIResponse(response) {
  if (!response) return { message: null, classification: null, action: null };

  const classMatch = response.match(/\[LEAD:(HOT|WARM|COLD)\]/);
  const classification = classMatch ? classMatch[1] : null;

  const actionMatch = response.match(/\[ACTION:SEND_PORTFOLIO\]/);
  const action = actionMatch ? actionMatch[1] : null;

  let message = response.replace(/\[LEAD:(HOT|WARM|COLD)\]/, "");
  message = message.replace(/\[ACTION:SEND_PORTFOLIO\]/, "").trim();

  return { message, classification, action };
}

// ─── DISCORD NOTIFICATION ───────────────────────────────────────────────────────

async function notifyDiscordHotLead(phone, businessName, classification, lastMessages) {
  if (!DISCORD_HOT_LEADS_WEBHOOK) return;

  const colorMap = { HOT: 0x00ff00, WARM: 0xffaa00, COLD: 0xff0000 };
  const emojiMap = { HOT: "🔥", WARM: "🟡", COLD: "❄️" };

  const embed = {
    title: `${emojiMap[classification] || "📱"} ${classification} Lead: ${businessName || phone}`,
    color: colorMap[classification] || 0x5865f2,
    fields: [
      { name: "Phone", value: phone, inline: true },
      { name: "Classification", value: classification, inline: true },
      {
        name: "Recent Messages",
        value: lastMessages
          .slice(-6)
          .map((m) => `**${m.role === "user" ? "Them" : "You"}:** ${m.content.slice(0, 200)}`)
          .join("\n")
          .slice(0, 1024) || "No messages",
        inline: false,
      },
    ],
    footer: { text: "WhatsApp Sales Bot" },
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(DISCORD_HOT_LEADS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.warn(`  ⚠ Discord notification failed: ${err.message}`);
  }
}

// ─── MAIN BOT ───────────────────────────────────────────────────────────────────

// ─── MAIN BOT EXPORT ─────────────────────────────────────────────────────────────

export function attachSalesBotListeners(clients) {
  if (!clients || clients.length === 0) return;

  validateEnv();

  const conversations = loadConversations();
  const sentLeads = loadSeenLeads();

  console.log("═".repeat(60));
  console.log("  🤖 WhatsApp Sales Bot Attached");
  console.log("  Listening for replies on all active accounts...");
  console.log("═".repeat(60));

  clients.forEach((client, idx) => {
    // Start the follow-up scheduler for this client
    startFollowUpScheduler(client, conversations, sentLeads);

    // ─── Handle incoming messages ─────────────────────────────────────────────
    client.on("message", async (msg) => {
      try {
        // Only handle direct messages (not groups, status updates, etc.)
        if (msg.isGroupMsg || msg.isStatus) return;

        const contact = await msg.getContact();
        const phone = msg.from;
        // Use contact.number if available (resolves @lid to actual number), otherwise clean the from string
        let phoneClean = contact.number || phone.replace(/@c\.us|@lid|@s\.whatsapp\.net/g, "");
        const incomingText = msg.body;

        // Skip media-only messages
        if (!incomingText || incomingText.trim() === "") return;

        console.log(`\n📩 Message from ${phoneClean} (${phone}): "${incomingText.slice(0, 100)}"`);

        // Generate variations of the phone number to match against wa_sent.json
        const phoneVariations = [phoneClean, phone];
        if (phoneClean.startsWith("94") && phoneClean.length === 11) {
          phoneVariations.push("0" + phoneClean.substring(2)); // 9477... -> 077...
        } else if (phoneClean.startsWith("0") && phoneClean.length === 10) {
          phoneVariations.push("94" + phoneClean.substring(1)); // 077... -> 9477...
        }

        // Look up business name from sent leads
        let businessName = null;
        for (const v of phoneVariations) {
          if (sentLeads[v]?.businessName) {
            businessName = sentLeads[v].businessName;
            break;
          }
        }

        // RESTRICT AUTO-REPLIES: Only reply to numbers we have outreached to, or the test number
        const TEST_NUMBER = "94764320410";
        if (!businessName && !phoneVariations.includes(TEST_NUMBER)) {
          console.log(`  🚫 Ignoring message from ${phoneClean} (not an outreached lead).`);
          return;
        }

        // Initialize or load conversation history for this contact
        if (!conversations[phone]) {
          conversations[phone] = {
            businessName,
            messages: [],
            classification: null,
            firstContact: new Date().toISOString(),
          };
        }

        // Add their message to history
        conversations[phone].messages.push({
          role: "user",
          content: incomingText,
          timestamp: new Date().toISOString(),
        });

        // Get AI reply
        const aiResponse = await getAIReply(
          conversations[phone].messages,
          conversations[phone].businessName || businessName
        );

        const { message: replyText, classification, action } = parseAIResponse(aiResponse);

        if (!replyText) {
          console.warn("  ⚠ Could not generate reply — skipping.");
          saveConversations(conversations);
          return;
        }

        // Update classification
        if (classification) {
          const prevClass = conversations[phone].classification;
          conversations[phone].classification = classification;

          if (classification !== prevClass) {
            console.log(`  📊 Lead classified as: ${classification}`);
          }
        }

        // Send the reply
        await msg.reply(replyText);
        console.log(`  📤 Replied: "${replyText.slice(0, 100)}"`);

        // Handle Actions
        if (action === "SEND_PORTFOLIO") {
          console.log(`  🖼 Sending Portfolio Link`);
          await sleep(2000);
          const portfolioLink = process.env.PORTFOLIO_LINK || "https://seranex.lk/our-work";
          await msg.reply(`Here are some examples of our recent work:\n${portfolioLink}`);
        }

        // Add our reply to history
        conversations[phone].messages.push({
          role: "assistant",
          content: action ? `${replyText}\n[ACTION:${action}]` : replyText,
          timestamp: new Date().toISOString(),
        });

        // Save immediately
        saveConversations(conversations);

        // Notify Discord for HOT and WARM leads
        if (classification === "HOT" || classification === "WARM") {
          await notifyDiscordHotLead(
            phoneClean,
            conversations[phone].businessName,
            classification,
            conversations[phone].messages
          );

          // Send WhatsApp alert to admin for HOT leads
          if (classification === "HOT") {
            try {
              const adminPhone = "94728382638@c.us";
              const alertMsg = `🔥 *HOT LEAD ALERT*\n\nBusiness: ${conversations[phone].businessName || "Unknown"}\nPhone: +${phoneClean}\n\nThey are interested in a website! Please follow up with them.`;
              await client.sendMessage(adminPhone, alertMsg);
              console.log(`  📱 Sent WhatsApp alert to admin for HOT lead.`);
            } catch (err) {
              console.warn(`  ⚠ Failed to send WhatsApp alert to admin: ${err.message}`);
            }
          }
        }
      } catch (err) {
        console.error(`  ✖ Error handling message on Account ${idx + 1}: ${err.message}`);
      }
    });
  });

  // ─── Graceful shutdown hooks for saving conversation state ───
  // Note: clients are destroyed by index.js now, so we only need to save conversations
  process.on("SIGINT", () => {
    saveConversations(conversations);
  });
  process.on("SIGTERM", () => {
    saveConversations(conversations);
  });
}

// ─── FOLLOW-UP SCHEDULER ────────────────────────────────────────────────────────
function startFollowUpScheduler(client, conversations, sentLeads) {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  const FOLLOW_UP_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours

  setInterval(async () => {
    console.log("🕒 Running Follow-Up Scheduler Check...");
    const now = new Date().getTime();

    for (const [phone, convo] of Object.entries(conversations)) {
      if (convo.classification === "COLD") continue; // Don't follow up cold leads

      const lastMsg = convo.messages[convo.messages.length - 1];
      if (!lastMsg) continue;

      const lastTime = new Date(lastMsg.timestamp).getTime();
      const timeDiff = now - lastTime;

      // If we are the last person who messaged and 48 hours have passed
      if (lastMsg.role === "assistant" && timeDiff > FOLLOW_UP_COOLDOWN_MS && !convo.followedUp) {
        console.log(`  ⏰ Sending 48h Follow-up to ${phone}...`);

        const followUpResponse = await getAIReply(
          convo.messages,
          convo.businessName
        );
        const { message: replyText } = parseAIResponse(followUpResponse);

        const safeReply = replyText || "Hi again! Just checking if you saw my last message about upgrading your website?";

        try {
          await client.sendMessage(phone, safeReply);
          convo.followedUp = true;
          convo.messages.push({
            role: "assistant",
            content: safeReply,
            timestamp: new Date().toISOString()
          });
          saveConversations(conversations);
        } catch (err) {
          console.warn(`  ⚠ Follow-up failed for ${phone}`);
        }
      }
    }
  }, CHECK_INTERVAL_MS);
}

