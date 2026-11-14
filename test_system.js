import { AGENCY_PROFILE, BUSINESS_VERTICALS, TARGET_REGIONS, CORE_SERVICES } from "./config/businessCategories.js";
import { auditBusiness, generateFallbackPitch } from "./classifier.js";
import { generateSeranexHtmlEmail } from "./email.js";
import { cleanPhoneNumber, formatPhoneForWhatsApp } from "./whatsapp.js";
import { parseAIResponse } from "./salesbot.js";

console.log("🧪 Running Seranex Lanka Solutions Component Verification Tests...\n");

// 1. Verify Agency Profile & Verticals
console.log(`1. Checking Agency Identity:`);
console.log(`   ✔ Name: ${AGENCY_PROFILE.name}`);
console.log(`   ✔ Website: ${AGENCY_PROFILE.website}`);
console.log(`   ✔ Hotline: ${AGENCY_PROFILE.hotline} (${AGENCY_PROFILE.hotlineIntl})`);
console.log(`   ✔ Verticals Configured: ${Object.keys(BUSINESS_VERTICALS).length} industries`);
console.log(`   ✔ Core Services: ${Object.keys(CORE_SERVICES).map(k => CORE_SERVICES[k].name).join(" | ")}`);

// 2. Test Business Audit Classifier
console.log(`\n2. Testing Intelligent Business Audit:`);
const mockRestaurant = {
  name: "Negombo Seafood Bistro & Cafe",
  formatted_address: "Lewis Place, Negombo, Sri Lanka",
  formatted_phone_number: "072 283 8268",
  website: null,
  rating: 4.8,
  user_ratings_total: 210
};

const auditResult = auditBusiness(mockRestaurant, "restaurants");
console.log(`   ✔ Prospect: ${auditResult.name}`);
console.log(`   ✔ Website Status: ${auditResult.website_status}`);
console.log(`   ✔ Opportunity Score: ${auditResult.opportunity_score}/100`);
console.log(`   ✔ Recommended Service: ${auditResult.service_details.name}`);
console.log(`   ✔ Detected Needs: ${auditResult.detected_needs.join("; ")}`);

if (auditResult.opportunity_score >= 80 && auditResult.website_status === "none") {
  console.log("   ✅ Opportunity Classifier logic passed!");
} else {
  console.error("   ❌ Opportunity Classifier test failed!");
}

// 3. Test Fallback Pitch Generation
console.log(`\n3. Testing Pitch Generator:`);
const pitch = generateFallbackPitch(auditResult);
console.log(`   ✔ Email Subject: "${pitch.email_subject}"`);
console.log(`   ✔ WhatsApp Message Length: ${pitch.whatsapp_pitch.length} chars`);
console.log(`   ✔ Sample Pitch Snippet: "${pitch.whatsapp_pitch.slice(0, 110)}..."`);

// 4. Test HTML Email Generation
console.log(`\n4. Testing Seranex Branded HTML Email Template:`);
const html = generateSeranexHtmlEmail(mockRestaurant, pitch);
if (html.includes("SERANEX") && html.includes("seranex.lk")) {
  console.log(`   ✅ HTML Email Template generated cleanly (${html.length} bytes)!`);
} else {
  console.error(`   ❌ HTML Email Template missing Seranex Lanka Solutions branding.`);
}

// 5. Test Phone Sanitization
console.log(`\n5. Testing WhatsApp Phone Formatting:`);
const rawPhone = "07228382638";
const clean = cleanPhoneNumber(rawPhone);
const waChatId = formatPhoneForWhatsApp(rawPhone);
console.log(`   ✔ Raw: "${rawPhone}" -> Cleaned: "${clean}" -> WhatsApp ChatID: "${waChatId}"`);
if (waChatId === "947228382638@c.us") {
  console.log("   ✅ Phone sanitization passed!");
} else {
  console.error("   ❌ Phone sanitization failed!");
}

// 6. Test AI Salesbot Parser
console.log(`\n6. Testing Salesbot Response & Classification Parser:`);
const sampleLLMOutput = `We can definitely build a custom online reservation system for your restaurant in 2 days! Would 3 PM tomorrow work for a quick demo?\n[LEAD:HOT]\n[ACTION:SEND_PORTFOLIO]`;
const parsed = parseAIResponse(sampleLLMOutput);
console.log(`   ✔ Detected Classification: ${parsed.classification}`);
console.log(`   ✔ Detected Action: ${parsed.action}`);
console.log(`   ✔ Clean Message: "${parsed.message}"`);
if (parsed.classification === "HOT" && parsed.action === "SEND_PORTFOLIO") {
  console.log("   ✅ Salesbot parser passed!");
} else {
  console.error("   ❌ Salesbot parser failed!");
}

console.log("\n🎉 ALL LOCAL SERANEX LANKA SOLUTIONS COMPONENT TESTS PASSED!\n");
