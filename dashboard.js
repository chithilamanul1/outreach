import express from 'express';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { exec } from 'node:child_process';
import { harvestHotelsForCategory, loadHotelsDb, saveHotelsDb } from './index.js';
import { syncRateSheetsFromInbox, saveRateSheetAttachment } from './inbox_harvester.js';
import { sendRateSheetInquiry } from './email.js';
import { initWhatsApp } from './whatsapp.js';
import { loadMasterCostingSheet, analyzeRateSheetDocument } from './rate_sheet_analyzer.js';
import { setTimeout as sleep } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
// Also serve rate_sheets directory statically so files can be opened directly
app.use('/rate_sheets', express.static(join(__dirname, 'rate_sheets')));

// Ensure rate_sheets directory structure exists
const BASE_RATE_SHEET_DIR = join(__dirname, 'rate_sheets');
['3_star', '4_star', '5_star'].forEach((dir) => {
  const p = join(BASE_RATE_SHEET_DIR, dir);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
});

// ─── API: GET HOTELS ────────────────────────────────────────────────────────────

app.get('/api/hotels', async (req, res) => {
  try {
    const category = req.query.category;
    let hotels = loadHotelsDb();

    if (category && category !== 'all') {
      hotels = hotels.filter((h) => h.star_category === category);
    }

    res.json(hotels);
  } catch (err) {
    console.error('Error fetching hotels:', err);
    res.status(500).json({ error: 'Failed to fetch hotels' });
  }
});

// ─── API: TRIGGER CATEGORY SCAN ───────────────────────────────────────────────

let isScanning = false;
let scanStatus = { running: false, category: null, region: null, log: '' };

app.get('/api/scan/status', (req, res) => {
  res.json(scanStatus);
});

app.post('/api/scan', async (req, res) => {
  if (isScanning) {
    return res.status(400).json({ error: 'A scan is already in progress.' });
  }

  const { category = '4-star', region = null, sendEmails = false } = req.body;

  isScanning = true;
  scanStatus = { running: true, category, region, log: `Started scan for ${category}...` };

  res.json({ success: true, message: `Scan initiated for ${category}` });

  // Run asynchronously
  (async () => {
    try {
      await harvestHotelsForCategory(category, region, { sendEmails });
      scanStatus = { running: false, category, region, log: `Scan finished for ${category}!` };
    } catch (err) {
      scanStatus = { running: false, category, region, log: `Scan error: ${err.message}` };
    } finally {
      isScanning = false;
    }
  })();
});

// ─── API: SYNC INBOX FOR RATE SHEETS ───────────────────────────────────────────

app.post('/api/sync-inbox', async (req, res) => {
  try {
    const result = await syncRateSheetsFromInbox();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── API: MASTER COSTING BIG SHEET DATA ───────────────────────────────────────

app.get('/api/costing-sheet', (req, res) => {
  try {
    const { destination, category } = req.query;
    let rows = loadMasterCostingSheet();

    if (destination && destination !== 'all') {
      rows = rows.filter((r) => (r.destination || '').toLowerCase() === destination.toLowerCase());
    }

    if (category && category !== 'all') {
      rows = rows.filter((r) => (r.starCategory || '').toLowerCase().includes(category.toLowerCase()));
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load costing sheet' });
  }
});

// Download Excel file directly
app.get('/api/costing-sheet/download', (req, res) => {
  const filePath = resolve(__dirname, 'rate_sheets', 'Master_SriLanka_Hotel_Costing_Sheet.xlsx');
  if (existsSync(filePath)) {
    res.download(filePath, 'Master_SriLanka_Hotel_Costing_Sheet.xlsx');
  } else {
    res.status(404).json({ error: 'Excel file not generated yet. Analyze at least one rate sheet first.' });
  }
});

// Trigger AI analysis on a specific hotel's rate sheets
app.post('/api/analyze-rate-sheet/:id', async (req, res) => {
  const { id } = req.params;
  const hotels = loadHotelsDb();
  const hotel = hotels.find((h) => h.place_id === id);

  if (!hotel) return res.status(404).json({ error: 'Hotel not found' });
  if (!hotel.rate_sheets || hotel.rate_sheets.length === 0) {
    return res.status(400).json({ error: 'No rate sheet files available for this hotel yet.' });
  }

  try {
    const results = [];
    for (const filePath of hotel.rate_sheets) {
      const fullPath = resolve(__dirname, filePath);
      const resAnalysis = await analyzeRateSheetDocument(fullPath, {
        hotelName: hotel.name,
        destination: hotel.region || 'Sri Lanka',
        starCategory: hotel.star_category,
        placeId: hotel.place_id
      });
      results.push(resAnalysis);
    }
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: CONNECT WHATSAPP FOR RATE SHEET DELIVERY ────────────────────────────

app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    initWhatsApp();
    res.json({ success: true, message: 'WhatsApp client initializing. Check terminal if QR scan is needed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: SEND INQUIRY TO SINGLE HOTEL ─────────────────────────────────────────

app.post('/api/send-inquiry/:id', async (req, res) => {
  const { id } = req.params;
  const hotels = loadHotelsDb();
  const hotel = hotels.find((h) => h.place_id === id);

  if (!hotel) {
    return res.status(404).json({ error: 'Hotel not found' });
  }

  if (!hotel.email) {
    return res.status(400).json({ error: 'No email address registered for this hotel' });
  }

  const result = await sendRateSheetInquiry(hotel.email, {
    name: hotel.name,
    starCategory: hotel.star_category,
    place_id: hotel.place_id
  });

  if (result.success) {
    hotel.status = 'EMAIL_SENT';
    hotel.email_sent_at = new Date().toISOString();
    saveHotelsDb(hotels);
    res.json({ success: true, hotel });
  } else {
    res.status(500).json({ error: result.reason || 'Failed to send email' });
  }
});

// ─── API: BATCH SEND INQUIRIES ─────────────────────────────────────────────────

app.post('/api/send-batch', async (req, res) => {
  const { category } = req.body;
  const hotels = loadHotelsDb();
  const queue = hotels.filter((hotel) => {
    if (category && category !== 'all' && hotel.star_category !== category) return false;
    if (hotel.status === 'EMAIL_SENT' || hotel.status === 'RATE_SHEET_RECEIVED') return false;
    return Boolean(hotel.email);
  });

  if (queue.length === 0) {
    return res.json({ success: true, sentCount: 0, message: 'No uncontacted hotels found for this category.' });
  }

  // Acknowledge immediately to avoid HTTP timeouts
  res.json({
    success: true,
    sentCount: queue.length,
    message: `Batch send started for ${queue.length} hotels with 20s anti-spam pacing.`
  });

  // Background dispatch with safe Hostinger spacing
  (async () => {
    console.log(`\n📨 Starting batch dispatch for ${queue.length} hotels (20s spacing)...`);
    for (const hotel of queue) {
      const currentHotels = loadHotelsDb();
      const target = currentHotels.find((h) => h.place_id === hotel.place_id);
      if (!target || target.status === 'EMAIL_SENT' || target.status === 'RATE_SHEET_RECEIVED') continue;

      const result = await sendRateSheetInquiry(target.email, {
        name: target.name,
        starCategory: target.star_category,
        place_id: target.place_id
      });

      if (result.success) {
        target.status = 'EMAIL_SENT';
        target.email_sent_at = new Date().toISOString();
        saveHotelsDb(currentHotels);
      }

      console.log(`   ⏳ Hostinger safe pacing: waiting 20s before next email...`);
      await sleep(20000);
    }
    console.log(`✅ Batch dispatch complete.\n`);
  })().catch((err) => console.error('Batch send background error:', err));
});

// ─── API: OPEN RATE SHEETS FOLDER IN WINDOWS EXPLORER ─────────────────────────

app.get('/api/open-folder', (req, res) => {
  const folderPath = resolve(__dirname, 'rate_sheets');
  if (process.platform === 'win32') {
    exec(`explorer.exe "${folderPath}"`, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to open folder' });
      }
      res.json({ success: true, path: folderPath });
    });
  } else {
    res.json({ success: true, path: folderPath, note: 'Folder location on VPS' });
  }
});

// ─── PERIODIC BACKGROUND INBOX MONITOR (EVERY 5 MINUTES) ──────────────────────
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
setInterval(async () => {
  const user = process.env.IMAP_USER || process.env.SMTP_USER || process.env.EMAIL_USER;
  if (user) {
    console.log('⏰ Auto-polling inbox for newly replied rate sheets...');
    await syncRateSheetsFromInbox().catch(() => {});
  }
}, AUTO_SYNC_INTERVAL_MS);

// ─── START SERVER ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n================================================================`);
  console.log(`🏨 Travel Agency Hotel Rate Sheet Manager running at http://localhost:${PORT}`);
  console.log(`================================================================\n`);
});
