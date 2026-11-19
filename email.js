import nodemailer from "nodemailer";
import { setTimeout as sleep } from "node:timers/promises";
import { AGENCY_PROFILE, CORE_SERVICES } from "./config/businessCategories.js";

/**
 * Configure email sender (Resend API, Resend SMTP, Hostinger/cPanel, or Gmail)
 */
export function getEmailProvider() {
  const resendKey = process.env.RESEND_API_KEY;
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const smtpHost = process.env.SMTP_HOST || "smtp.hostinger.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "465", 10);
  const smtpSecure = process.env.SMTP_SECURE === "false" ? false : (smtpPort === 465);
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_FROM || (smtpUser === "resend" ? "sales@seranex.lk" : (smtpUser || "sales@seranex.lk"));

  // 1. Resend REST API (Highest reliability, fast, no open SMTP ports required)
  if (resendKey) {
    return {
      type: "resend_api",
      apiKey: resendKey,
      fromEmail
    };
  }

  // 2. SMTP (Resend SMTP, Hostinger, cPanel, Titan, AWS SES)
  if (smtpUser && smtpPass) {
    return {
      type: "smtp",
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
      fromEmail
    };
  }

  // 3. Gmail Fallback
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return {
      type: "gmail",
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

export function getTransporter() {
  return getEmailProvider();
}

/**
 * Build rich HTML email template branded for Seranex Lanka Solutions
 */
export function generateSeranexHtmlEmail(lead, pitch) {
  const agencyName = AGENCY_PROFILE.name;
  const website = AGENCY_PROFILE.website;
  const phone = AGENCY_PROFILE.hotline;
  const cleanPhone = phone.replace(/^0/, "94");
  const waUrl = `https://wa.me/94728382638?text=Hi%20Seranex%20Lanka,%20I%20received%20your%20email%20regarding%20${encodeURIComponent(lead.name)}`;

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
                      💬 Chat on WhatsApp (0728382638)
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
 * Send personalized B2B outreach email to a prospect business (supports Resend API & SMTP)
 */
export async function sendSeranexOutreachEmail(recipientEmail, lead, customPitch = null) {
  const provider = getEmailProvider();
  if (!provider) {
    console.warn("  ⚠ Email provider not configured (Requires RESEND_API_KEY or SMTP credentials).");
    return { success: false, reason: "Email provider not configured" };
  }

  const pitch = customPitch || {
    email_subject: lead.email_subject || `Digital Growth & Web Upgrade for ${lead.name}`,
    email_body: lead.email_body || lead.message || "Hello! We would love to collaborate."
  };

  const htmlContent = generateSeranexHtmlEmail(lead, pitch);
  const senderFormatted = `"Seranex Lanka Solutions" <${provider.fromEmail}>`;

  // 1. Resend API Dispatch
  if (provider.type === "resend_api") {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: senderFormatted,
          to: [recipientEmail],
          reply_to: provider.fromEmail,
          subject: pitch.email_subject,
          html: htmlContent,
          text: pitch.email_body
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Resend API error (${res.status})`);
      }

      console.log(`  ✅ [Email Dispatched via Resend API] Sent to ${recipientEmail} (ID: ${data.id})`);
      return { success: true, messageId: data.id };
    } catch (err) {
      console.error(`  ✖ [Resend API Failed] Error sending to ${recipientEmail}: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }

  // 2. SMTP Dispatch (Resend SMTP, Hostinger, Gmail)
  const mailOptions = {
    from: senderFormatted,
    to: recipientEmail,
    replyTo: provider.fromEmail,
    subject: pitch.email_subject,
    text: pitch.email_body,
    html: htmlContent
  };

  try {
    const info = await provider.transporter.sendMail(mailOptions);
    console.log(`  ✅ [Email Dispatched via SMTP] Sent to ${recipientEmail} (ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`  ✖ [SMTP Failed] Error sending to ${recipientEmail}: ${err.message}`);
    return { success: false, reason: err.message };
  }
}

// Backwards-compatible aliases
export const generateSeranixHtmlEmail = generateSeranexHtmlEmail;
export const sendSeranixOutreachEmail = sendSeranexOutreachEmail;
