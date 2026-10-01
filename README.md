# Sri Lanka Tourism Lead Finder

A Node.js CLI tool that finds Sri Lankan tourism businesses with **no website** or a **broken website**, drafts a personalized outreach message using an LLM, posts each lead to Discord, **auto-sends via WhatsApp**, and **handles reply conversations with an AI sales bot** to close deals.

## How It Works

### Lead Finding Pipeline (`npm start`)

1. **Search** — Loops over configurable search terms × tourist towns via Google Places API.
2. **Detail Fetch** — Pulls website URL, phone, address, rating for each result.
3. **Website Check** — Fetches the website with 8s timeout. `broken` or `none` = lead. `ok` = skip.
4. **Draft Outreach** — LLM drafts a warm 3-4 sentence outreach message.
5. **Post to Discord** — Rich embed with all lead details. 🔴 red = no website, 🟠 orange = broken.
6. **Send via WhatsApp** *(optional)* — Auto-sends the outreach message to the business's phone number with human-like delays.
7. **Dedupe** — Tracks `place_id`s in `seen_leads.json`. Re-runs only surface new leads.

### Sales Bot (`npm run salesbot`)

Runs separately in a second terminal. Listens for WhatsApp replies and:

- Uses LLM to generate contextual sales responses
- Classifies leads as **HOT** 🔥 / **WARM** 🟡 / **COLD** ❄️
- Notifies Discord about hot and warm leads
- Persists conversation history in `wa_conversations.json`

## Setup

### Prerequisites

- **Node.js 20+**
- API keys (see below)

### Install

```bash
cd Outreach
npm install
```

### Configure

```bash
cp .env.example .env
```

| Variable                   | Required | Description                                          |
| -------------------------- | -------- | ---------------------------------------------------- |
| `GOOGLE_PLACES_API_KEY`    | ✅       | Google Cloud API key with Places API enabled          |
| `OPENROUTER_API_KEY`       | ✅       | API key from [openrouter.ai](https://openrouter.ai)  |
| `DISCORD_WEBHOOK_URL`      | ✅       | Discord channel webhook URL                           |
| `OPENROUTER_MODEL`         | ❌       | LLM model (default: `anthropic/claude-3-haiku`)       |
| `WHATSAPP_AUTO_SEND`       | ❌       | Set to `true` to enable WhatsApp auto-send            |
| `DISCORD_HOT_LEADS_WEBHOOK`| ❌       | Separate webhook for hot lead alerts (falls back to main) |

> **Older Node versions (< 20.6):** `--env-file` won't work. Install `dotenv`, add `import "dotenv/config";` as the first line of `index.js` and `salesbot.js`, and change scripts to just `node index.js`.

### Run

```bash
# Find leads → Discord + WhatsApp
npm start

# Find leads → console only (no Discord, no WhatsApp)
npm run dry-run

# Find leads on a schedule (every 6 hours)
npm run schedule

# Start the WhatsApp sales bot (run in a second terminal)
npm run salesbot
```

### WhatsApp First-Time Setup

1. Set `WHATSAPP_AUTO_SEND=true` in `.env`
2. Run `npm start` — a QR code appears in your terminal
3. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → Scan the QR
4. Done! Session is saved in `.wwebjs_auth/` — no QR needed on future runs

> [!WARNING]
> **Use a secondary SIM/WhatsApp number**, not your main one. WhatsApp can ban numbers that send too many unsolicited messages. The script has safety caps (15 messages/run, 20-45s random delays), but the risk isn't zero.

## Customizing

Edit the arrays at the top of `index.js`:

```js
const SEARCH_TERMS = ["villa", "boutique hotel", "guesthouse", "beach resort"];
const TOWNS = ["Mirissa", "Weligama", "Bentota", "Ella", "Galle", "Unawatuna", "Arugam Bay"];
```

Pricing in outreach: search for `Rs. 20,000-25,000` in the `draftOutreach()` function.

Sales bot personality: edit `SALES_SYSTEM_PROMPT` in `salesbot.js`.

## Cost Notes

> [!CAUTION]
> Google Places and OpenRouter are **paid APIs** beyond free tiers. Start with 1 term × 1-2 towns.

- **Google Places**: ~28 search calls + ~560 detail calls at full config
- **OpenRouter**: ~$0.001/message with Claude 3 Haiku
- **Discord & WhatsApp**: Free

## How Dedupe Works

- Every `place_id` is saved to `seen_leads.json` after processing
- Progress saves after **every single lead** (crash-safe)
- Delete `seen_leads.json` to start fresh

## Project Structure

```
Outreach/
├── index.js          # Main lead-finding pipeline
├── whatsapp.js       # WhatsApp sender module (QR login, message sending)
├── salesbot.js       # WhatsApp sales bot (LLM reply handling)
├── package.json      # Project config & scripts
├── .env.example      # Env var template
├── .env              # Your actual keys (gitignored)
├── seen_leads.json   # Auto-generated: processed place_ids
├── wa_sent.json      # Auto-generated: WhatsApp sent message tracking
├── wa_conversations.json  # Auto-generated: sales bot conversation history
├── .wwebjs_auth/     # Auto-generated: WhatsApp session data
└── README.md
```
