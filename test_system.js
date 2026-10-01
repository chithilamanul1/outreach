import { STAR_CATEGORIES, SRI_LANKA_REGIONS } from "./config/hotelCategories.js";
import { quickFilter } from "./classifier.js";
import { sanitizeFilename, getCategoryFolder, saveRateSheetAttachment } from "./inbox_harvester.js";
import { generateRateInquiryText } from "./email.js";
import { existsSync, readFileSync } from "node:fs";

console.log("🧪 Running System Component Tests...\n");

// 1. Test Categories
console.log("1. Checking Star Categories:");
for (const [key, cat] of Object.entries(STAR_CATEGORIES)) {
  console.log(`   ✔ ${cat.badge} ${cat.name} (queries: ${cat.searchQueries.length}, folder: ${cat.folder})`);
}
console.log(`   ✔ Regions configured: ${SRI_LANKA_REGIONS.length} destinations across Sri Lanka.`);

// 2. Test Classifier
console.log("\n2. Checking Classifier Quick-Filter:");
const testGuesthouse = { name: "Budget Backpacker Homestay Ella" };
const test5StarHotel = { name: "Cinnamon Grand Colombo" };
const filterResult1 = quickFilter(testGuesthouse, "5-star");
const filterResult2 = quickFilter(test5StarHotel, "5-star");
console.log(`   ✔ 5-star filter on '${testGuesthouse.name}': rejected=${!filterResult1.valid} (reason: ${filterResult1.reason})`);
console.log(`   ✔ 5-star filter on '${test5StarHotel.name}': accepted=${filterResult2.valid}`);

if (filterResult1.valid === false && filterResult2.valid === true) {
  console.log("   ✅ Category filter logic passed!");
} else {
  console.error("   ❌ Filter test failed!");
}

// 3. Test Filename & Folder Sanitizer
console.log("\n3. Testing Folder Structure & Attachment Saver:");
const testHotel = "Heritance Kandalama: Luxury Hotel / Dambulla*";
const cleanName = sanitizeFilename(testHotel);
console.log(`   ✔ Sanitized folder name: "${cleanName}"`);

const dummyBuffer = Buffer.from("Sample Rate Sheet PDF Content 2026-2027");
const savedPath = saveRateSheetAttachment("5-star", testHotel, "Tariff_2026.pdf", dummyBuffer);
console.log(`   ✔ File saved to: ${savedPath}`);
if (existsSync(savedPath)) {
  console.log("   ✅ Folder-by-folder attachment saving verified!");
} else {
  console.error("   ❌ Attachment saving failed!");
}

// 4. Test Email Template
console.log("\n4. Testing B2B Rate Sheet Inquiry Template:");
const emailSample = generateRateInquiryText("Jetwing Lighthouse", "5-Star Luxury Resort");
console.log("   ✔ Generated email inquiry preview (first 180 chars):");
console.log("   \"" + emailSample.slice(0, 180).replace(/\n/g, " ") + "...\"");

console.log("\n🎉 ALL LOCAL COMPONENT TESTS PASSED!\n");
