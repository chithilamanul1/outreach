import nodemailer from "nodemailer";
import { setTimeout as sleep } from "node:timers/promises";
import { AGENCY_PROFILE, CORE_SERVICES } from "./config/businessCategories.js";

/**
 * Configure SMTP transporter
 * Supports Hostinger, cPanel, Webmail, Titan, and Gmail
 */
export function getTransporter() {
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const smtpHost = process.env.SMTP_HOST || "smtp.hostinger.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "465", 10);
  const smtpSecure = process.env.SMTP_SECURE === "false" ? false : (smtpPort === 465);

  // 1. Hostinger / Custom Hosting SMTP
  if (smtpUser && smtpPass) {
    return {
      transporter: nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        pool: false,
        tls: {
          rejectUnauthorized: false
        }
      }),
      fromEmail: smtpUser
    };
  }

  // 2. Gmail Fallback
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return {
      transporter: nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      }),
      fromEmail: process.env.GMAIL_USER
    };
  }

  return null;
}

/**
 * Build rich HTML email template branded for Seranex Lanka Solutions
 */
export function generateSeranixHtmlEmail(lead, pitch) {
  const agencyName = AGENCY_PROFILE.name;
  const website = AGENCY_PROFILE.website;
  const phone = AGENCY_PROFILE.hotline;
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const waUrl = `https://wa.me/947228382638?text=Hi%20Seranex%20Lanka,%20I%20received%20your%20email%20regarding%20${encodeURIComponent(lead.name)}`;

  const bodyParagraphs = (pitch.email_body || "")
    .split("\n\n")
    .map(p => `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #334155; font-size: 15px;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pitch.email_subject || "Seranex Lanka Solutions Outreach"}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;" cellspacing="0" cellpadding="0">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #090d16 0%, #1e1b4b 100%); padding: 32px 36px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">SERANEX <span style="color: #6366f1;">LANKA SOLUTIONS</span></span>
                    <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 13px; letter-spacing: 0.5px;">Software • High-Converting Websites • Video Ad Marketing</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 36px 36px 24px 36px; text-align: left;">
              ${bodyParagraphs}

              <!-- 3 Core Services Highlight Box -->
              <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px; margin: 28px 0; border-left: 4px solid #6366f1;">
                <p style="margin: 0 0 10px 0; font-weight: 700; color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">What Seranex Lanka Solutions Delivers:</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding: 6px 0; font-size: 14px; color: #475569;">
                      💻 <b>Custom Software & SaaS:</b> Booking systems, CRM, POS & workflow automations.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 14px; color: #475569;">
                      🌐 <b>High-Converting Websites:</b> 1-2 day launch, ultra-fast, mobile-first with free domain & hosting.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 14px; color: #475569;">
                      🎬 <b>Video Ads & Growth Marketing:</b> 4K commercials, viral Instagram/TikTok Reels, Meta & Google Ads.
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA Buttons -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0 16px 0;">
                <tr>
                  <td style="border-radius: 8px; background-color: #2563eb;">
                    <a href="${waUrl}" target="_blank" style="display: inline-block; padding: 13px 24px; font-size: 14px; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 8px;">
                      💬 Chat on WhatsApp (07228382638)
                    </a>
                  </td>
                  <td style="padding-left: 12px;">
                    <a href="${website}" target="_blank" style="display: inline-block; padding: 13px 20px; font-size: 14px; color: #0f172a; background-color: #f1f5f9; text-decoration: none; font-weight: 600; border-radius: 8px; border: 1px solid #cbd5e1;">
                      Visit seranex.lk →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer Signature -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 36px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0; font-weight: 700; color: #1e293b; font-size: 14px;">Client Solutions & Growth Team</p>
              <p style="margin: 2px 0 8px 0;">Seranex Lanka Solutions</p>
              <p style="margin: 0;">🌐 <a href="${website}" style="color: #6366f1; text-decoration: none;">${website}</a> &nbsp;|&nbsp; 📞 Direct Hotline: ${phone}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send personalized B2B outreach email to a prospect business
 */
export async function sendSeranixOutreachEmail(recipientEmail, lead, customPitch = null) {
  const mailConfig = getTransporter();
  if (!mailConfig) {
    console.warn("  ⚠ SMTP not configured. Cannot send email.");
    return { success: false, reason: "SMTP not configured" };
  }

  const pitch = customPitch || {
    email_subject: lead.email_subject || `Digital Growth & Web Upgrade for ${lead.name}`,
    email_body: lead.email_body || lead.message || "Hello! We would love to collaborate."
  };

  const htmlContent = generateSeranixHtmlEmail(lead, pitch);

  const mailOptions = {
    from: `"Seranex Lanka Solutions" <${mailConfig.fromEmail}>`,
    to: recipientEmail,
    replyTo: mailConfig.fromEmail,
    subject: pitch.email_subject,
    text: pitch.email_body,
    html: htmlContent
  };

  try {
    const info = await mailConfig.transporter.sendMail(mailOptions);
    console.log(`  ✅ [Email Dispatched] Sent to ${recipientEmail} (ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`  ✖ [Email Failed] Error sending to ${recipientEmail}: ${err.message}`);
    return { success: false, reason: err.message };
  }
}
