import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

// Load environment variables

async function run() {
    console.log("Starting to re-message old leads...");

    const waModule = await import("./whatsapp.js");
    const activeClients = await waModule.initWhatsApp();

    if (activeClients.length === 0) {
        console.error("Failed to initialize WhatsApp.");
        return;
    }

    const salesModule = await import("./salesbot.js");
    salesModule.attachSalesBotListeners(activeClients);

    // Read wa_sent.json to get old leads
    let waSent = {};
    try {
        waSent = JSON.parse(readFileSync("wa_sent.json", "utf-8"));
    } catch (err) {
        console.error("Could not read wa_sent.json", err);
        return;
    }

    const phones = Object.keys(waSent);
    console.log(`Found ${phones.length} previously messaged leads.`);

    for (const phone of phones) {
        const lead = waSent[phone];
        console.log(`\n→ Re-messaging: ${lead.businessName} (${phone})`);

        // Generate new message with direct offer, pricing, and portfolio
        const prompt = `You are reaching out to "${lead.businessName}" on WhatsApp from Seranex.
Write a short, friendly, and very simple WhatsApp message (2-3 short sentences/lines).

Requirements:
- Greet them warmly and mention you build modern websites for local businesses.
- Clearly state that packages start from Rs. 25,000, which includes a 5-page website, 1 year free hosting, and a free domain.
- Include our portfolio link: https://seranex.lk/our-work
- Use simple, easy-to-understand English.
- End with a low-pressure question asking if they would like to see a demo or discuss.
- Keep it natural, human, and scannable (clean line breaks).
- No spammy buzzwords or robotic language.
- Output ONLY the message text, nothing else.`;

        try {
            const res = await fetch(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
                        messages: [{ role: "user", content: prompt }],
                        max_tokens: 300,
                        temperature: 0.5,
                    }),
                }
            );

            const data = await res.json();
            const newMessage = data.choices?.[0]?.message?.content?.trim();

            if (newMessage) {
                console.log(`Drafted:\n${newMessage}\n`);
                const success = await waModule.sendWhatsAppMessage(phone, newMessage);
                if (success) {
                    const delay = 20000 + Math.random() * 25000;
                    console.log(`⏳ Waiting ${Math.round(delay / 1000)}s before next message...`);
                    await sleep(delay);
                }
            } else {
                console.log("Failed to draft message.");
            }
        } catch (err) {
            console.error("Error drafting/sending message:", err.message);
        }
    }

    console.log("\n✅ Finished re-messaging old leads!");
    console.log("🤖 Bot is now listening for replies... Press Ctrl+C to exit.");
}

run().catch(console.error);