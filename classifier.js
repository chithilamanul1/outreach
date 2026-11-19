/**
 * Seranex Lanka Solutions - Intelligent Business Audit & AI Opportunity Classifier
 * Audits prospect businesses, identifies missing digital infrastructure
 * (No Website, Outdated Web, Missing Booking/POS Software, Zero Video Marketing),
 * and generates high-converting bespoke outreach pitches.
 */

import { AGENCY_PROFILE, CORE_SERVICES, BUSINESS_VERTICALS } from "./config/businessCategories.js";

const SOCIAL_MEDIA_DOMAINS = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "tiktok.com",
  "tripadvisor.com",
  "tripadvisor.co.uk",
  "yelp.com",
  "youtube.com",
  "google.com",
  "business.site",
  "wa.me",
  "api.whatsapp.com"
];

/**
 * Check if the URL is a real independent domain or just a social media profile
 */
export function evaluateWebsite(url) {
  if (!url || typeof url !== "string") {
    return { status: "none", isReal: false, cleanUrl: null };
  }
  const clean = url.trim().toLowerCase();
  if (clean === "" || clean === "none" || clean === "null" || clean === "n/a") {
    return { status: "none", isReal: false, cleanUrl: null };
  }

  const isSocial = SOCIAL_MEDIA_DOMAINS.some((domain) => clean.includes(domain));
  if (isSocial) {
    return { status: "social_only", isReal: false, cleanUrl: clean };
  }

  return { status: "has_website", isReal: true, cleanUrl: clean };
}

/**
 * Audit a discovered business and identify project opportunities
 */
export function auditBusiness(place, targetVertical = "restaurants") {
  const name = place.name || "Business";
  const webEval = evaluateWebsite(place.website);
  const rating = place.rating || 0;
  const reviews = place.user_ratings_total || 0;
  const address = place.formatted_address || "";
  const phone = place.formatted_phone_number || place.international_phone_number || null;

  // Determine vertical info
  const vertical = BUSINESS_VERTICALS[targetVertical] || BUSINESS_VERTICALS.restaurants;

  let recommendedService = "website";
  let opportunityScore = 60;
  let detectedNeeds = [];

  // 1. Website Audit
  if (webEval.status === "none") {
    recommendedService = "website";
    opportunityScore = 95;
    detectedNeeds.push("No independent website found (Completely reliant on offline / word of mouth)");
  } else if (webEval.status === "social_only") {
    recommendedService = "growth_bundle";
    opportunityScore = 90;
    detectedNeeds.push("Only has a social media link (Needs dedicated brand website & custom domain to build trust)");
  } else {
    // Has a website -> Recommend software or video advertising & marketing
    if (targetVertical === "restaurants" || targetVertical === "hospitality" || targetVertical === "healthcare") {
      recommendedService = "software";
      opportunityScore = 80;
      detectedNeeds.push("Opportunity for automated online booking, direct ordering & CRM to cut third-party commissions");
    } else {
      recommendedService = "video_marketing";
      opportunityScore = 82;
      detectedNeeds.push("Opportunity for high-converting 4K video ads & Reels to drive direct customer leads");
    }
  }

  // 2. High review volume means established business with marketing budget
  if (reviews > 50) {
    opportunityScore = Math.min(100, opportunityScore + 10);
    detectedNeeds.push(`Strong review traction (${reviews} reviews, ${rating}★) indicates established business with budget`);
  }

  return {
    name,
    address,
    phone,
    website: place.website || null,
    website_status: webEval.status,
    rating,
    review_count: reviews,
    vertical: targetVertical,
    vertical_name: vertical.name,
    recommended_service: recommendedService,
    service_details: CORE_SERVICES[recommendedService],
    opportunity_score: opportunityScore,
    detected_needs: detectedNeeds,
    pitch_angle: vertical.pitchAngle
  };
}

/**
 * Generate AI Hyper-Personalized Pitch using OpenRouter / Gemini LLM
 */
export async function generateAIPitch(auditData, apiKey, model = "google/gemini-2.5-flash") {
  if (!apiKey) {
    return generateFallbackPitch(auditData);
  }

  const prompt = `You are the Senior Sales Consultant at "Seranex Lanka Solutions" (https://seranex.lk), hotline: 0728382638.
We provide 3 key services:
1. Software Development (Custom Web/Mobile Apps, CRM, ERP, Booking & Ordering Engines, Automation)
2. Website Design & Development (Ultra-fast, Modern, E-commerce, Mobile-first, 1-2 Day Delivery, $100 / Rs. 28,000 with free domain & hosting)
3. Video Advertisement & Digital Marketing Agency (4K Commercials, Viral TikTok/Reels Ads, Meta & Google Ads)

Target Prospect:
- Business Name: "${auditData.name}"
- Industry: ${auditData.vertical_name}
- Location: ${auditData.address || "Sri Lanka"}
- Website Status: ${auditData.website_status} (${auditData.website || "No website"})
- Google Rating: ${auditData.rating} (${auditData.review_count} reviews)
- Identified Opportunity: ${auditData.detected_needs.join("; ")}
- Recommended Service: ${auditData.service_details.name}

Task:
Draft TWO personalized cold outreach pitches specifically tailored to "${auditData.name}":
1. A professional B2B Cold Email (Compelling subject line + warm, consultative body mentioning their business gap and how Seranex Lanka Solutions solves it).
2. A high-converting WhatsApp message (Short, punchy, 3-4 sentences max, friendly tone, mentioning our hotline 0728382638, conversational CTA to see live demo).

Format your response as strict JSON:
{
  "email_subject": "Subject line here",
  "email_body": "Full personalized email body here...",
  "whatsapp_pitch": "Full whatsapp message here...",
  "key_hook": "One sentence summary of the pitch hook"
}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://seranex.lk",
        "X-Title": "Seranex Lanka Solutions Lead Generator",
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.warn(`  ⚠ OpenRouter pitch generation failed (${res.status}), using template fallback.`);
      return generateFallbackPitch(auditData);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        email_subject: parsed.email_subject || `Digital Growth & Web Upgrade for ${auditData.name}`,
        email_body: parsed.email_body || generateFallbackPitch(auditData).email_body,
        whatsapp_pitch: parsed.whatsapp_pitch || generateFallbackPitch(auditData).whatsapp_pitch,
        key_hook: parsed.key_hook || auditData.pitch_angle
      };
    }

    return generateFallbackPitch(auditData);
  } catch (err) {
    console.warn(`  ⚠ LLM Pitch generation error: ${err.message}`);
    return generateFallbackPitch(auditData);
  }
}

/**
 * High-converting fallback pitch template when LLM is unavailable
 */
export function generateFallbackPitch(audit) {
  const isNoWeb = audit.website_status === "none" || audit.website_status === "social_only";

  let subject = "";
  let emailBody = "";
  let waPitch = "";

  if (isNoWeb) {
    subject = `Quick question regarding ${audit.name}'s online presence`;
    emailBody = `Hi ${audit.name} Team,

I noticed that ${audit.name} has great local feedback (${audit.rating}★ across ${audit.review_count} reviews), but you don't have a dedicated standalone website yet.

At Seranex Lanka Solutions, we help businesses like yours launch modern, high-converting websites in just 1–2 business days—fully equipped with mobile responsiveness, direct WhatsApp ordering/booking buttons, and Google Maps SEO.

We also build custom booking/CRM software and produce 4K social media video ads (Instagram Reels & TikTok) to drive immediate customer traffic.

Would you be open to seeing a free interactive design mockup we drafted for ${audit.name}?

Best regards,

Kasun | Senior Solutions Consultant
Seranex Lanka Solutions
Web: ${AGENCY_PROFILE.website}
Hotline / WhatsApp: ${AGENCY_PROFILE.hotline}`;

    waPitch = `Hi from Seranex Lanka Solutions! We noticed ${audit.name} has great ratings (${audit.rating}★), but no official website yet. We build modern, fast business websites in just 1-2 days (starting at $100 / Rs. 28,000 with free domain & hosting) plus custom booking software and cinematic video ads. Would you like to see a free design demo for ${audit.name}? Hotline: 0728382638.`;
  } else {
    subject = `New customer acquisition & software upgrade for ${audit.name}`;
    emailBody = `Hi ${audit.name} Team,

I came across ${audit.name} and was really impressed by your brand presence and customer ratings.

I'm reaching out from Seranex Lanka Solutions. We partner with established businesses to supercharge their digital systems:
1. Custom Booking & Automation Software (eliminating third-party platform commissions and automating customer bookings)
2. Cinematic 4K Video Ads & Viral Reels campaigns that generate measurable paying customers via Meta & Google Ads
3. Website Speed & Conversion optimization to double your online inquiry rate

Would you have 10 minutes this week for a brief exploratory chat, or can I send over our recent client case studies?

Best regards,

Kasun | Senior Sales Director
Seranex Lanka Solutions
Web: ${AGENCY_PROFILE.website}
Direct Hotline: ${AGENCY_PROFILE.hotline}`;

    waPitch = `Hello ${audit.name} team! I'm reaching out from Seranex Lanka Solutions. We build custom booking software, website upgrades, and 4K Instagram/TikTok video ad campaigns that bring high-ticket customers directly to your business. Could I share a quick 1-minute portfolio video of our latest client results? Hotline: 0728382638.`;
  }

  return {
    email_subject: subject,
    email_body: emailBody,
    whatsapp_pitch: waPitch,
    key_hook: audit.pitch_angle || "Accelerate business growth with custom software, modern web & video marketing."
  };
}
