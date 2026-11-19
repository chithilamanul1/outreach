import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import cron from 'node-cron';
import {
  discoverLeadsForCategory,
  loadLeadsDb,
  saveLeadsDb,
  loadSeenLeads,
  saveSeenLeads
} from './index.js';
import { sendSeranexOutreachEmail, getTransporter } from './email.js';
import {
  initWhatsApp,
  getWhatsAppStatus,
  requestWhatsAppPairingCode,
  resetWhatsAppSession,
  sendWhatsAppOutreach,
  sendMissedCallOutreach
} from './whatsapp.js';
import {
  loadConversations,
  saveConversations,
  getAIReply,
  parseAIResponse
} from './salesbot.js';
import {
  AGENCY_PROFILE,
  BUSINESS_VERTICALS,
  TARGET_REGIONS,
  CORE_SERVICES
} from './config/businessCategories.js';
import { auditBusiness, generateAIPitch } from './classifier.js';
import { notifyOutreachDispatched, notifyHotLead } from './discord_notifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ─── 24/7 AUTOMATION CONFIGURATION & STATE ────────────────────────────────────

const AUTOMATION_FILE = 'automation_config.json';
let activeCronTask = null;

function loadAutomationConfig() {
  if (!existsSync(AUTOMATION_FILE)) {
    return {
      enabled: false,
      intervalHours: 6,
      verticals: ['restaurants', 'hospitality', 'healthcare'],
      regions: ['Colombo', 'Negombo', 'Kandy'],
      autoSendEmail: false,
      autoSendWhatsApp: false,
      lastRun: null,
      totalRuns: 0
    };
  }
  try {
    return JSON.parse(readFileSync(AUTOMATION_FILE, 'utf-8'));
  } catch {
    return { enabled: false, intervalHours: 6, verticals: ['restaurants'], regions: ['Colombo'] };
  }
}

function saveAutomationConfig(cfg) {
  writeFileSync(AUTOMATION_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

function setup24x7Scheduler(cfg) {
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
  }

  if (!cfg.enabled) {
    console.log('⏸ 24/7 Background Lead Hunter is currently paused.');
    return;
  }

  const hours = Math.max(1, Math.min(24, parseInt(cfg.intervalHours || 6, 10)));
  const cronExpr = `0 */${hours} * * *`;

  console.log(`⏰ Setting up 24/7 Autonomous Lead Hunter (Runs every ${hours} hours: "${cronExpr}")...`);

  activeCronTask = cron.schedule(cronExpr, async () => {
    console.log(`\n⏰ [24/7 AUTONOMOUS CYCLE TRIGGERED] Starting background lead discovery...`);
    const currentConfig = loadAutomationConfig();
    if (!currentConfig.enabled) return;

    for (const vertical of currentConfig.verticals || ['restaurants']) {
      for (const region of currentConfig.regions || ['Colombo']) {
        try {
          console.log(`   🚀 Auto-Hunting: ${vertical} in ${region}...`);
          await discoverLeadsForCategory(vertical, region, {
            sendEmails: currentConfig.autoSendEmail,
            sendWhatsApp: currentConfig.autoSendWhatsApp
          });
        } catch (cycleErr) {
          console.warn(`   ⚠ Auto-hunting cycle error for ${vertical}/${region}: ${cycleErr.message}`);
        }
        await sleep(10000);
      }
    }

    currentConfig.lastRun = new Date().toISOString();
    currentConfig.totalRuns = (currentConfig.totalRuns || 0) + 1;
    saveAutomationConfig(currentConfig);
    console.log(`✅ [24/7 AUTONOMOUS CYCLE COMPLETE] Next cycle in ${hours} hours.\n`);
  });
}

// ─── API: DOKPLOY & CONTAINER HEALTHCHECK ──────────────────────────────────────

app.get('/api/health', (req, res) => {
  const leads = loadLeadsDb();
  const wa = getWhatsAppStatus();
  res.json({
    status: 'ok',
    app: 'Seranex Lanka Solutions Autonomous Engine',
    uptime: Math.round(process.uptime()),
    uptimeFormatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    totalLeads: leads.length,
    whatsappConnected: wa.isReady,
    automationActive: Boolean(activeCronTask),
    timestamp: new Date().toISOString()
  });
});

// ─── API: SYSTEM CONFIG & CATEGORIES ──────────────────────────────────────────

app.get('/api/config', (req, res) => {
  res.json({
    agency: AGENCY_PROFILE,
    verticals: BUSINESS_VERTICALS,
    regions: TARGET_REGIONS,
    services: CORE_SERVICES
  });
});

// ─── API: OVERVIEW STATS ───────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  try {
    const leads = loadLeadsDb();
    const convos = loadConversations();
    const waStatus = getWhatsAppStatus();
    const hasSmtp = Boolean(getTransporter());
    const autoCfg = loadAutomationConfig();

    const stats = {
      totalLeads: leads.length,
      highOpportunity: leads.filter(l => (l.opportunity_score || 0) >= 80).length,
      noWebsite: leads.filter(l => l.website_status === 'none' || l.website_status === 'social_only').length,
      emailSent: leads.filter(l => l.status === 'EMAIL_SENT').length,
      whatsappSent: leads.filter(l => l.status === 'WHATSAPP_SENT').length,
      replied: leads.filter(l => l.status === 'REPLIED').length,
      hotLeads: leads.filter(l => l.status === 'HOT' || l.classification === 'HOT').length,
      closedWon: leads.filter(l => l.status === 'CLOSED').length,
      activeChats: Object.keys(convos).length,
      whatsappConnected: waStatus.isReady,
      smtpConfigured: hasSmtp,
      automationActive: autoCfg.enabled
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: GET LEADS WITH FILTERS ──────────────────────────────────────────────

app.get('/api/leads', (req, res) => {
  try {
    const { vertical, region, status, service, search } = req.query;
    let leads = loadLeadsDb();

    if (vertical && vertical !== 'all') {
      leads = leads.filter(l => l.vertical === vertical);
    }

    if (region && region !== 'all') {
      leads = leads.filter(l => (l.region || '').toLowerCase().includes(region.toLowerCase()));
    }

    if (status && status !== 'all') {
      leads = leads.filter(l => l.status === status);
    }

    if (service && service !== 'all') {
      leads = leads.filter(l => l.recommended_service === service);
    }

    if (search && search.trim()) {
      const q = search.toLowerCase();
      leads = leads.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.address || '').toLowerCase().includes(q)
      );
    }

    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// ─── API: ADD CUSTOM LEAD MANUALLY ───────────────────────────────────────────

app.post('/api/leads/custom', async (req, res) => {
  try {
    const { name, vertical = 'restaurants', phone, email, website, address = 'Sri Lanka' } = req.body;
    if (!name) return res.status(400).json({ error: 'Business name is required' });

    const audit = auditBusiness({
      name,
      website,
      formatted_address: address,
      formatted_phone_number: phone,
      rating: 5.0,
      user_ratings_total: 1
    }, vertical);

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
    const pitch = await generateAIPitch(audit, openRouterKey, model);

    const place_id = `custom_${Date.now()}`;
    const newLead = {
      place_id,
      name,
      vertical,
      vertical_name: audit.vertical_name,
      address,
      region: address,
      phone: phone || null,
      email: email || null,
      website: website || null,
      website_status: audit.website_status,
      rating: 5.0,
      review_count: 1,
      opportunity_score: audit.opportunity_score,
      recommended_service: audit.recommended_service,
      service_details: audit.service_details,
      detected_needs: audit.detected_needs,
      email_subject: pitch.email_subject,
      email_body: pitch.email_body,
      whatsapp_pitch: pitch.whatsapp_pitch,
      key_hook: pitch.key_hook,
      status: 'DISCOVERED',
      discovered_at: new Date().toISOString(),
      outreach_history: []
    };

    const leads = loadLeadsDb();
    leads.unshift(newLead);
    saveLeadsDb(leads);

    res.json({ success: true, lead: newLead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: DELETE LEAD ─────────────────────────────────────────────────────────

app.delete('/api/leads/:id', (req, res) => {
  try {
    const { id } = req.params;
    let leads = loadLeadsDb();
    const beforeCount = leads.length;
    leads = leads.filter(l => l.place_id !== id);

    if (leads.length === beforeCount) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    saveLeadsDb(leads);
    res.json({ success: true, message: 'Lead removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: REAL-TIME LEAD SCAN & DISCOVERY ─────────────────────────────────────

let isScanning = false;
let scanStatus = { running: false, vertical: null, region: null, log: '', count: 0 };

app.get('/api/scan/status', (req, res) => {
  res.json(scanStatus);
});

app.post('/api/scan', async (req, res) => {
  if (isScanning) {
    return res.status(400).json({ error: 'A lead discovery scan is already running.' });
  }

  const { vertical = 'restaurants', region = 'Colombo', sendEmails = false, sendWhatsApp = false } = req.body;

  isScanning = true;
  scanStatus = {
    running: true,
    vertical,
    region,
    log: `Launching Seranex Lead Hunter for ${vertical} in ${region}...`,
    count: 0
  };

  res.json({ success: true, message: `Scan initiated for ${vertical} in ${region}` });

  (async () => {
    try {
      const result = await discoverLeadsForCategory(vertical, region, {
        sendEmails,
        sendWhatsApp
      });
      scanStatus = {
        running: false,
        vertical,
        region,
        log: `Scan complete! Discovered & audited ${result.count} new business leads.`,
        count: result.count
      };
    } catch (err) {
      scanStatus = {
        running: false,
        vertical,
        region,
        log: `Discovery scan error: ${err.message}`,
        count: 0
      };
    } finally {
      isScanning = false;
    }
  })();
});

// ─── API: REGENERATE AI PITCH FOR LEAD ────────────────────────────────────────

app.post('/api/leads/pitch/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leads = loadLeadsDb();
    const lead = leads.find(l => l.place_id === id);

    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

    const audit = auditBusiness({
      name: lead.name,
      website: lead.website,
      formatted_address: lead.address,
      formatted_phone_number: lead.phone,
      rating: lead.rating,
      user_ratings_total: lead.review_count
    }, lead.vertical || 'restaurants');

    const newPitch = await generateAIPitch(audit, openRouterKey, model);

    lead.email_subject = newPitch.email_subject;
    lead.email_body = newPitch.email_body;
    lead.whatsapp_pitch = newPitch.whatsapp_pitch;
    lead.key_hook = newPitch.key_hook;

    saveLeadsDb(leads);
    res.json({ success: true, pitch: newPitch, lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: SEND OUTREACH EMAIL TO SINGLE LEAD ──────────────────────────────────

app.post('/api/outreach/email/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leads = loadLeadsDb();
    const lead = leads.find(l => l.place_id === id);

    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.email) return res.status(400).json({ error: 'No contact email registered for this business' });

    const customPitch = req.body.pitch || null;
    const result = await sendSeranexOutreachEmail(lead.email, lead, customPitch);

    if (result.success) {
      lead.status = 'EMAIL_SENT';
      lead.email_sent_at = new Date().toISOString();
      lead.outreach_history = lead.outreach_history || [];
      lead.outreach_history.push({
        channel: 'Email',
        target: lead.email,
        sent_at: new Date().toISOString()
      });
      saveLeadsDb(leads);
      await notifyOutreachDispatched(lead, 'Email');
      res.json({ success: true, lead });
    } else {
      res.status(500).json({ error: result.reason || 'Failed to dispatch email' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: SEND OUTREACH WHATSAPP TO SINGLE LEAD ───────────────────────────────

app.post('/api/outreach/whatsapp/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leads = loadLeadsDb();
    const lead = leads.find(l => l.place_id === id);

    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.phone) return res.status(400).json({ error: 'No phone number registered for this business' });

    const message = req.body.message || lead.whatsapp_pitch;
    const result = await sendWhatsAppOutreach(lead.phone, message, lead.name);

    if (result.success) {
      lead.status = 'WHATSAPP_SENT';
      lead.whatsapp_sent_at = new Date().toISOString();
      lead.outreach_history = lead.outreach_history || [];
      lead.outreach_history.push({
        channel: 'WhatsApp',
        target: lead.phone,
        sent_at: new Date().toISOString()
      });
      saveLeadsDb(leads);
      await notifyOutreachDispatched(lead, 'WhatsApp');
      res.json({ success: true, lead });
    } else {
      res.status(500).json({ error: result.error || 'Failed to send WhatsApp message' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: TRIGGER MISSED CALL OUTREACH HOOK ──────────────────────────────────

app.post('/api/outreach/missed-call/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leads = loadLeadsDb();
    const lead = leads.find(l => l.place_id === id);

    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.phone) return res.status(400).json({ error: 'No phone number registered for this business' });

    const result = await sendMissedCallOutreach(lead.phone, lead.name);

    if (result.success) {
      lead.status = 'MISSED_CALLED';
      lead.missed_call_at = new Date().toISOString();
      lead.outreach_history = lead.outreach_history || [];
      lead.outreach_history.push({
        channel: 'Missed Call Hook',
        target: lead.phone,
        sent_at: new Date().toISOString()
      });
      saveLeadsDb(leads);
      await notifyOutreachDispatched(lead, 'Missed Call');
      res.json({ success: true, lead, dialUrl: `tel:${lead.phone}` });
    } else {
      res.status(500).json({ error: result.error || 'Failed to dispatch missed call message' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: BATCH EMAIL OUTREACH ────────────────────────────────────────────────

app.post('/api/outreach/batch-email', async (req, res) => {
  const { vertical } = req.body;
  const leads = loadLeadsDb();
  const queue = leads.filter(l => {
    if (vertical && vertical !== 'all' && l.vertical !== vertical) return false;
    if (l.status === 'EMAIL_SENT' || l.status === 'CLOSED') return false;
    return Boolean(l.email);
  });

  if (queue.length === 0) {
    return res.json({ success: true, sentCount: 0, message: 'No uncontacted leads with email found.' });
  }

  res.json({
    success: true,
    sentCount: queue.length,
    message: `Batch email campaign started for ${queue.length} businesses with safe 20s anti-spam pacing.`
  });

  (async () => {
    console.log(`\n📨 Launching batch email campaign for ${queue.length} leads...`);
    for (const lead of queue) {
      const currentLeads = loadLeadsDb();
      const target = currentLeads.find(l => l.place_id === lead.place_id);
      if (!target || target.status === 'EMAIL_SENT') continue;

      const result = await sendSeranexOutreachEmail(target.email, target);
      if (result.success) {
        target.status = 'EMAIL_SENT';
        target.email_sent_at = new Date().toISOString();
        saveLeadsDb(currentLeads);
        await notifyOutreachDispatched(target, 'Email');
      }

      await sleep(20000);
    }
    console.log(`✅ Batch email campaign finished.\n`);
  })().catch(err => console.error('Batch email error:', err));
});

// ─── API: BATCH WHATSAPP OUTREACH ─────────────────────────────────────────────

app.post('/api/outreach/batch-whatsapp', async (req, res) => {
  const { vertical } = req.body;
  const leads = loadLeadsDb();
  const queue = leads.filter(l => {
    if (vertical && vertical !== 'all' && l.vertical !== vertical) return false;
    if (l.status === 'WHATSAPP_SENT' || l.status === 'CLOSED') return false;
    return Boolean(l.phone);
  });

  if (queue.length === 0) {
    return res.json({ success: true, sentCount: 0, message: 'No uncontacted leads with phone found.' });
  }

  res.json({
    success: true,
    sentCount: queue.length,
    message: `Batch WhatsApp campaign started for ${queue.length} businesses with 25s safe pacing.`
  });

  (async () => {
    console.log(`\n💬 Launching batch WhatsApp campaign for ${queue.length} leads...`);
    for (const lead of queue) {
      const currentLeads = loadLeadsDb();
      const target = currentLeads.find(l => l.place_id === lead.place_id);
      if (!target || target.status === 'WHATSAPP_SENT') continue;

      const pitch = target.whatsapp_pitch || `Hi from Seranex Lanka Solutions! We build high-converting websites, custom software, and video ads. Hotline: 0728382638.`;
      const result = await sendWhatsAppOutreach(target.phone, pitch, target.name);

      if (result.success) {
        target.status = 'WHATSAPP_SENT';
        target.whatsapp_sent_at = new Date().toISOString();
        saveLeadsDb(currentLeads);
        await notifyOutreachDispatched(target, 'WhatsApp');
      }

      await sleep(25000);
    }
    console.log(`✅ Batch WhatsApp campaign finished.\n`);
  })().catch(err => console.error('Batch WhatsApp error:', err));
});

// ─── API: UPDATE LEAD STATUS / ADD NOTES ──────────────────────────────────────

app.put('/api/leads/status/:id', (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  const leads = loadLeadsDb();
  const lead = leads.find(l => l.place_id === id);

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (status) lead.status = status;
  if (notes !== undefined) lead.notes = notes;

  saveLeadsDb(leads);
  res.json({ success: true, lead });
});

// ─── API: CONVERSATIONS & CHAT HISTORY ────────────────────────────────────────

app.get('/api/conversations', (req, res) => {
  res.json(loadConversations());
});

app.post('/api/conversations/reply', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'Phone and message are required' });

    const result = await sendWhatsAppOutreach(phone, message, 'Lead');
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to dispatch message' });
    }

    const conversations = loadConversations();
    const rawPhone = phone.includes('@c.us') ? phone : `${phone}@c.us`;

    if (!conversations[rawPhone]) {
      conversations[rawPhone] = {
        phone,
        businessName: 'Prospective Client',
        messages: [],
        classification: 'WARM',
        firstContact: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
    }

    conversations[rawPhone].messages.push({
      role: 'assistant',
      content: message,
      timestamp: new Date().toISOString()
    });
    conversations[rawPhone].lastActivity = new Date().toISOString();
    saveConversations(conversations);

    res.json({ success: true, message: 'Reply sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 24/7 AUTOMATION MANAGEMENT ──────────────────────────────────────────

app.get('/api/automation', (req, res) => {
  const cfg = loadAutomationConfig();
  res.json({
    ...cfg,
    isRunning: Boolean(activeCronTask)
  });
});

app.post('/api/automation', (req, res) => {
  try {
    const { enabled, intervalHours = 6, verticals, regions, autoSendEmail, autoSendWhatsApp } = req.body;
    const current = loadAutomationConfig();

    const updated = {
      ...current,
      enabled: Boolean(enabled),
      intervalHours: parseInt(intervalHours, 10) || 6,
      verticals: verticals || current.verticals,
      regions: regions || current.regions,
      autoSendEmail: Boolean(autoSendEmail),
      autoSendWhatsApp: Boolean(autoSendWhatsApp)
    };

    saveAutomationConfig(updated);
    setup24x7Scheduler(updated);

    res.json({ success: true, config: updated, isRunning: Boolean(activeCronTask) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: SETTINGS & CONFIGURATION MANAGEMENT ─────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json({
    googlePlacesKeyConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    openRouterKeyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    resendKeyConfigured: Boolean(process.env.RESEND_API_KEY),
    model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
    discordWebhook: process.env.DISCORD_HOT_LEADS_WEBHOOK || process.env.DISCORD_WEBHOOK_URL || '',
    adminWhatsApp: process.env.ADMIN_WHATSAPP_NUMBER || AGENCY_PROFILE.hotline,
    botWhatsApp: process.env.BOT_WHATSAPP_NUMBER || '94760602638',
    smtpHost: process.env.SMTP_HOST || 'smtp.resend.com',
    smtpPort: process.env.SMTP_PORT || '465',
    smtpUser: process.env.SMTP_USER || '',
    emailFrom: process.env.EMAIL_FROM || 'sales@seranex.lk',
    smtpConfigured: Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_USER && process.env.SMTP_PASS)),
    agencyName: AGENCY_PROFILE.name,
    agencyWebsite: AGENCY_PROFILE.website,
    agencyHotline: AGENCY_PROFILE.hotline
  });
});

app.post('/api/settings', (req, res) => {
  try {
    const {
      googlePlacesKey,
      openRouterKey,
      resendApiKey,
      emailFrom,
      model,
      discordWebhook,
      adminWhatsApp,
      botWhatsApp,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass
    } = req.body;

    // Update in-memory process.env
    if (googlePlacesKey) process.env.GOOGLE_PLACES_API_KEY = googlePlacesKey;
    if (openRouterKey) process.env.OPENROUTER_API_KEY = openRouterKey;
    if (resendApiKey) process.env.RESEND_API_KEY = resendApiKey;
    if (emailFrom) process.env.EMAIL_FROM = emailFrom;
    if (model) process.env.OPENROUTER_MODEL = model;
    if (discordWebhook) {
      process.env.DISCORD_HOT_LEADS_WEBHOOK = discordWebhook;
      process.env.DISCORD_WEBHOOK_URL = discordWebhook;
    }
    if (adminWhatsApp) process.env.ADMIN_WHATSAPP_NUMBER = adminWhatsApp;
    if (botWhatsApp) process.env.BOT_WHATSAPP_NUMBER = botWhatsApp;
    if (smtpHost) process.env.SMTP_HOST = smtpHost;
    if (smtpPort) process.env.SMTP_PORT = smtpPort;
    if (smtpUser) process.env.SMTP_USER = smtpUser;
    if (smtpPass) process.env.SMTP_PASS = smtpPass;

    // Update .env file
    const envVars = [
      `GOOGLE_PLACES_API_KEY=${process.env.GOOGLE_PLACES_API_KEY || ''}`,
      `OPENROUTER_API_KEY=${process.env.OPENROUTER_API_KEY || ''}`,
      `OPENROUTER_MODEL=${process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'}`,
      `RESEND_API_KEY=${process.env.RESEND_API_KEY || ''}`,
      `EMAIL_FROM=${process.env.EMAIL_FROM || 'sales@seranex.lk'}`,
      `DISCORD_HOT_LEADS_WEBHOOK=${process.env.DISCORD_HOT_LEADS_WEBHOOK || ''}`,
      `DISCORD_WEBHOOK_URL=${process.env.DISCORD_WEBHOOK_URL || ''}`,
      `ADMIN_WHATSAPP_NUMBER=${process.env.ADMIN_WHATSAPP_NUMBER || '94728382638'}`,
      `BOT_WHATSAPP_NUMBER=${process.env.BOT_WHATSAPP_NUMBER || '94760602638'}`,
      `SMTP_HOST=${process.env.SMTP_HOST || 'smtp.resend.com'}`,
      `SMTP_PORT=${process.env.SMTP_PORT || '465'}`,
      `SMTP_SECURE=true`,
      `SMTP_USER=${process.env.SMTP_USER || ''}`,
      `SMTP_PASS=${process.env.SMTP_PASS || ''}`,
      `AGENCY_NAME=Seranex Lanka Solutions`,
      `AGENCY_PHONE=0728382638`,
      `AGENCY_WEBSITE=https://seranex.lk`
    ].join('\n');

    writeFileSync('.env', envVars, 'utf-8');

    res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/test-email', async (req, res) => {
  try {
    const { testEmail } = req.body;
    if (!testEmail) return res.status(400).json({ error: 'Test email is required' });

    const result = await sendSeranexOutreachEmail(testEmail, {
      name: 'Diagnostic Verification',
      vertical: 'services'
    }, {
      email_subject: '✅ Seranex Lanka Solutions Email Verification Test',
      email_body: 'Congratulations! Your email connection is properly configured and operational for Seranex Lanka Solutions 24/7 client outreach.'
    });

    if (result.success) {
      res.json({ success: true, message: `Test email dispatched to ${testEmail}` });
    } else {
      res.status(500).json({ error: result.reason || 'Failed to dispatch email' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/test-discord', async (req, res) => {
  try {
    const webhook = process.env.DISCORD_HOT_LEADS_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;
    if (!webhook) return res.status(400).json({ error: 'No Discord webhook URL configured' });

    const embed = {
      title: '⚡ Seranex Lanka Solutions Discord Webhook Connected',
      description: 'Your real-time sales alert channel is operational. You will receive instant notifications for new leads, outreach dispatches, and 🔥 HOT LEADS!',
      color: 0x6366f1,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (response.ok) {
      res.json({ success: true, message: 'Discord notification sent successfully!' });
    } else {
      res.status(500).json({ error: `Discord responded with HTTP ${response.status}` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: WHATSAPP CONNECTION & PAIRING ───────────────────────────────────────

app.get('/api/whatsapp/status', (req, res) => {
  res.json(getWhatsAppStatus());
});

app.get('/api/whatsapp/qr', (req, res) => {
  const status = getWhatsAppStatus();
  if (status.isReady) {
    return res.json({ status: 'connected', isReady: true });
  }
  if (status.hasQr && status.qrDataUrl) {
    return res.json({
      status: 'qr_ready',
      isReady: false,
      hasQr: true,
      qrDataUrl: status.qrDataUrl
    });
  }
  return res.json({
    status: 'initializing',
    isReady: false,
    hasQr: false,
    message: 'Generating live WhatsApp QR code...'
  });
});

app.post('/api/whatsapp/reset', async (req, res) => {
  try {
    await resetWhatsAppSession();
    res.json({ success: true, message: 'WhatsApp session reset. Generating fresh QR code...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/pairing-code', async (req, res) => {
  try {
    const phone = req.body?.phone || process.env.BOT_WHATSAPP_NUMBER || '0728382638';
    const pairingCode = await requestWhatsAppPairingCode(phone);
    res.json({ success: true, phone, pairingCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    initWhatsApp();
    res.json({ success: true, message: 'WhatsApp client initializing. Check terminal / QR view.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── START SERVER & BACKGROUND INITIALIZATION ─────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`🚀 SERANEX LANKA SOLUTIONS - 24/7 AI OUTREACH & SALES COMMAND CENTER`);
  console.log(`🌐 Live Dashboard: http://localhost:${PORT}`);
  console.log(`💼 Unified Growth: Software • Websites • Video Ad Marketing`);
  console.log(`📞 Hotline: 0728382638 | Web: https://seranex.lk`);
  console.log(`🐳 Dokploy & Docker Ready: Container Healthcheck Active`);
  console.log(`════════════════════════════════════════════════════════════════\n`);

  // Initialize 24/7 scheduler if enabled in automation_config.json
  const autoCfg = loadAutomationConfig();
  if (autoCfg.enabled) {
    setup24x7Scheduler(autoCfg);
  }

  // Pre-initialize WhatsApp if phone configured
  const botPhone = process.env.BOT_WHATSAPP_NUMBER;
  if (botPhone) {
    console.log(`📱 Pre-connecting WhatsApp for Seranex Lanka Solutions Outreach...`);
    initWhatsApp().catch(err => console.warn(`⚠ WhatsApp pre-init warning: ${err.message}`));
  }
});
