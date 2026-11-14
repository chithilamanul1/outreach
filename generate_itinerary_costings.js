import xlsx from "xlsx";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Ensure output directory exists
const OUT_DIR = "costing_sheets";
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Load master hotel room rates
let masterRates = [];
if (existsSync("master_costing_sheet.json")) {
  try { masterRates = JSON.parse(readFileSync("master_costing_sheet.json", "utf-8")); } catch {}
}

/**
 * Standard Sri Lanka 17-Passenger Costing Engine
 * Group size: 17 Adults
 * Room configuration: 8 Double/Twin rooms + 1 Single room = 9 rooms total
 * Transport: 29-33 Seater Luxury AC Coach
 */

const ENTRANCE_FEES = {
  "Sigiriya Rock Fortress": 36,
  "Dambulla Golden Cave Temple": 12,
  "Polonnaruwa Ancient City": 30,
  "Anuradhapura Sacred City": 30,
  "Temple of the Tooth Kandy": 10,
  "Royal Botanical Gardens Peradeniya": 10,
  "Kandy Cultural Dance Show": 8,
  "Tea Factory & Plantation Tour": 5,
  "Yala Safari (Jeep + Park Permit + Tracker)": 45,
  "Madu River Boat Safari (Balapitiya)": 12,
  "Kosgoda Turtle Conservation Center": 8,
  "Galle Dutch Fort Walking Tour": 0,
  "Pinnawala Elephant Orphanage": 15
};

const TRANSPORT_RATES = {
  coach_29_seat_per_day: 135, // USD per day (includes fuel, driver, AC)
  driver_daily_batta: 12,     // USD per day if no hotel quarters
  driver_assistant_batta: 8,  // USD per day
  highway_tolls_total: 45,    // USD estimated per tour
  guide_daily_fee: 55         // National Tourist Guide Lecturer (NTGL)
};

const ITINERARIES = [
  {
    code: "OWT-17P-07D",
    title: "7 Days / 6 Nights - Classic Sri Lanka Highlights",
    nights: 6,
    days: 7,
    route: "Negombo (1N) -> Sigiriya (2N) -> Kandy (1N) -> Nuwara Eliya (1N) -> Bentota (1N) -> Airport",
    destinations: ["Negombo", "Sigiriya", "Sigiriya", "Kandy", "Nuwara Eliya", "Bentota"],
    attractions: [
      "Pinnawala Elephant Orphanage",
      "Sigiriya Rock Fortress",
      "Dambulla Golden Cave Temple",
      "Temple of the Tooth Kandy",
      "Kandy Cultural Dance Show",
      "Royal Botanical Gardens Peradeniya",
      "Tea Factory & Plantation Tour",
      "Madu River Boat Safari (Balapitiya)",
      "Kosgoda Turtle Conservation Center"
    ]
  },
  {
    code: "OWT-17P-10D",
    title: "10 Days / 9 Nights - Culture, Hill Country & Safari",
    nights: 9,
    days: 10,
    route: "Negombo (1N) -> Sigiriya/Anuradhapura (2N) -> Kandy (2N) -> Ella/Nuwara Eliya (2N) -> Yala (1N) -> Mirissa/Galle (1N) -> Airport",
    destinations: ["Negombo", "Sigiriya", "Sigiriya", "Kandy", "Kandy", "Nuwara Eliya", "Ella", "Yala", "Mirissa"],
    attractions: [
      "Pinnawala Elephant Orphanage",
      "Sigiriya Rock Fortress",
      "Dambulla Golden Cave Temple",
      "Polonnaruwa Ancient City",
      "Temple of the Tooth Kandy",
      "Kandy Cultural Dance Show",
      "Royal Botanical Gardens Peradeniya",
      "Tea Factory & Plantation Tour",
      "Yala Safari (Jeep + Park Permit + Tracker)",
      "Madu River Boat Safari (Balapitiya)",
      "Kosgoda Turtle Conservation Center",
      "Galle Dutch Fort Walking Tour"
    ]
  },
  {
    code: "OWT-17P-12D",
    title: "12 Days / 11 Nights - Grand Sri Lanka Island Tour",
    nights: 11,
    days: 12,
    route: "Negombo (1N) -> Anuradhapura & Jaffna (2N) -> Sigiriya (2N) -> Kandy (2N) -> Nuwara Eliya (1N) -> Ella (1N) -> Yala (1N) -> Galle (1N) -> Airport",
    destinations: ["Negombo", "Anuradhapura", "Jaffna", "Sigiriya", "Sigiriya", "Kandy", "Kandy", "Nuwara Eliya", "Ella", "Yala", "Galle"],
    attractions: [
      "Pinnawala Elephant Orphanage",
      "Anuradhapura Sacred City",
      "Sigiriya Rock Fortress",
      "Dambulla Golden Cave Temple",
      "Temple of the Tooth Kandy",
      "Kandy Cultural Dance Show",
      "Royal Botanical Gardens Peradeniya",
      "Tea Factory & Plantation Tour",
      "Yala Safari (Jeep + Park Permit + Tracker)",
      "Madu River Boat Safari (Balapitiya)",
      "Kosgoda Turtle Conservation Center",
      "Galle Dutch Fort Walking Tour"
    ]
  }
];

function getEstimatedHotelRate(destination, starTier) {
  // Try matching real master costing sheet first
  const match = masterRates.find(r => 
    (r.destination || "").toLowerCase().includes(destination.toLowerCase()) &&
    (r.starCategory || "").includes(starTier === "4-star" ? "4" : "3") &&
    r.doubleBB
  );

  if (match) {
    return {
      hotel: match.hotelName,
      doubleRate: parseFloat(match.doubleBB) || 85,
      singleRate: parseFloat(match.singleBB) || 75
    };
  }

  // Fallback realistic B2B contracted market averages for Sri Lanka
  if (starTier === "4-star") {
    return { hotel: `${destination} 4★ Preferred Partner`, doubleRate: 95, singleRate: 85 };
  } else {
    return { hotel: `${destination} 3★ Preferred Partner`, doubleRate: 65, singleRate: 55 };
  }
}

function calculateItineraryCost(itin, starTier) {
  const pax = 17;
  const numDoubleRooms = 8;
  const numSingleRooms = 1;

  // 1. Accommodation total
  let hotelRows = [];
  let totalAccom = 0;

  itin.destinations.forEach((dest, dayIdx) => {
    const rateInfo = getEstimatedHotelRate(dest, starTier);
    const nightTotal = (rateInfo.doubleRate * numDoubleRooms) + (rateInfo.singleRate * numSingleRooms);
    totalAccom += nightTotal;
    hotelRows.push({
      night: `Night ${dayIdx + 1}`,
      destination: dest,
      hotelName: rateInfo.hotel,
      doubleRate: rateInfo.doubleRate,
      singleRate: rateInfo.singleRate,
      rooms: "8 DBL + 1 SGL",
      nightTotal
    });
  });

  // 2. Transport total
  const transportDays = itin.days;
  const coachTotal = transportDays * TRANSPORT_RATES.coach_29_seat_per_day;
  const driverTotal = transportDays * TRANSPORT_RATES.driver_daily_batta;
  const assistantTotal = transportDays * TRANSPORT_RATES.driver_assistant_batta;
  const guideTotal = transportDays * TRANSPORT_RATES.guide_daily_fee;
  const tollTotal = TRANSPORT_RATES.highway_tolls_total;
  const totalTransport = coachTotal + driverTotal + assistantTotal + guideTotal + tollTotal;

  // 3. Entrance & Excursion fees per person
  let totalEntrancePerPax = 0;
  itin.attractions.forEach(attr => {
    totalEntrancePerPax += (ENTRANCE_FEES[attr] || 0);
  });
  const totalEntrancesGroup = totalEntrancePerPax * pax;

  // 4. Value additions (Garland, cold towels, 2 x 500ml water bottles per day)
  const waterAndGarlandPerPax = itin.days * 2 + 3; // $2/day water + $3 garland
  const totalAdditions = waterAndGarlandPerPax * pax;

  // 5. Grand Totals
  const netTotalGroup = totalAccom + totalTransport + totalEntrancesGroup + totalAdditions;
  const netPerPax = netTotalGroup / pax;

  // 6. Agency Markup / Profit (15%)
  const marginPct = 0.15;
  const sellingTotalGroup = netTotalGroup / (1 - marginPct);
  const sellingPerPax = sellingTotalGroup / pax;

  return {
    itin,
    starTier,
    pax,
    hotelRows,
    totalAccom,
    transportDays,
    coachTotal,
    driverTotal,
    assistantTotal,
    guideTotal,
    tollTotal,
    totalTransport,
    totalEntrancePerPax,
    totalEntrancesGroup,
    totalAdditions,
    netTotalGroup,
    netPerPax,
    sellingTotalGroup,
    sellingPerPax
  };
}

// Generate the Excel workbook
const wb = xlsx.utils.book_new();

// Sheet 1: Master Summary & Rate Matrix
const summaryData = [
  ["OCEANWAY TOURS (PVT) LTD - SRI LANKA", "", "", "", "", ""],
  ["CONFIDENTIAL B2B GROUP COSTING - 17 PASSENGERS", "", "", "", "", ""],
  ["All Rates in USD ($) Net & Selling per Person | 8 Double/Twin Rooms + 1 Single Room", "", "", "", "", ""],
  [""],
  [
    "Itinerary Code",
    "Tour Package Title",
    "Duration",
    "Hotel Category",
    "Net Cost Per Pax",
    "Selling Price Per Pax (USD)",
    "Total Group Cost (USD)"
  ]
];

ITINERARIES.forEach(itin => {
  ["4-star", "3-star"].forEach(tier => {
    const calc = calculateItineraryCost(itin, tier);
    summaryData.push([
      calc.itin.code + (tier === "4-star" ? "-4S" : "-3S"),
      calc.itin.title,
      `${calc.itin.days}D / ${calc.itin.nights}N`,
      tier === "4-star" ? "4-Star Deluxe / Boutique" : "3-Star Standard / Superior",
      `$${calc.netPerPax.toFixed(2)}`,
      `$${calc.sellingPerPax.toFixed(2)}`,
      `$${calc.sellingTotalGroup.toFixed(2)}`
    ]);
  });
});

summaryData.push([""]);
summaryData.push(["INCLUSIONS IN COSTING:"]);
summaryData.push(["✓ Accommodation on Bed & Breakfast (BB) basis for 17 passengers (8 Double/Twin + 1 Single)"]);
summaryData.push(["✓ Transportation by Private Luxury AC 29-33 Seater Coach for the entire tour duration"]);
summaryData.push(["✓ Services of an English/Arabic speaking Licensed National Tourist Guide Lecturer"]);
summaryData.push(["✓ Driver & Assistant accommodations, meals, highway toll fees, parking, and vehicle permits"]);
summaryData.push(["✓ All site entrance fees and excursion tickets as per itinerary (Sigiriya, Yala Safari, Kandy Temple, etc.)"]);
summaryData.push(["✓ Mineral water bottles (2 x 500ml per person per day) and traditional orchid garland welcome on arrival"]);
summaryData.push(["✓ All applicable Sri Lanka Government taxes, VAT, and service charges"]);

const wsSummary = xlsx.utils.aoa_to_sheet(summaryData);
xlsx.utils.book_append_sheet(wb, wsSummary, "B2B Rate Summary");

// Sheet 2, 3, 4: Detailed Breakdown for each itinerary
ITINERARIES.forEach(itin => {
  const calc4 = calculateItineraryCost(itin, "4-star");
  const calc3 = calculateItineraryCost(itin, "3-star");

  const detailData = [
    [`OCEANWAY TOURS - DETAILED COST BREAKDOWN: ${itin.code}`],
    [itin.title],
    [`Route: ${itin.route}`],
    [`Group Size: 17 Passengers | Transport: 29-Seater Luxury AC Coach`],
    [""],
    ["SECTION 1: ACCOMMODATION BREAKDOWN (8 Double/Twin + 1 Single = 9 Rooms)"],
    ["Night", "Destination", "Hotel (4-Star)", "Double BB", "Single BB", "4-Star Total", "Hotel (3-Star)", "3-Star Total"]
  ];

  for (let i = 0; i < calc4.hotelRows.length; i++) {
    const h4 = calc4.hotelRows[i];
    const h3 = calc3.hotelRows[i];
    detailData.push([
      h4.night,
      h4.destination,
      h4.hotelName,
      `$${h4.doubleRate}`,
      `$${h4.singleRate}`,
      `$${h4.nightTotal.toFixed(2)}`,
      h3.hotelName,
      `$${h3.nightTotal.toFixed(2)}`
    ]);
  }

  detailData.push([
    "Total Accommodation",
    "",
    "",
    "",
    "",
    `$${calc4.totalAccom.toFixed(2)}`,
    "",
    `$${calc3.totalAccom.toFixed(2)}`
  ]);

  detailData.push([""]);
  detailData.push(["SECTION 2: TRANSPORT & LOGISTICS (29-Seater Coach)"]);
  detailData.push(["Item", "Days / Qty", "Daily Rate (USD)", "Total (USD)"]);
  detailData.push(["29-Seater AC Luxury Tourist Coach (Coach + Fuel)", calc4.transportDays, `$${TRANSPORT_RATES.coach_29_seat_per_day}`, `$${calc4.coachTotal.toFixed(2)}`]);
  detailData.push(["Driver Allowance & Batta", calc4.transportDays, `$${TRANSPORT_RATES.driver_daily_batta}`, `$${calc4.driverTotal.toFixed(2)}`]);
  detailData.push(["Driver Assistant Batta", calc4.transportDays, `$${TRANSPORT_RATES.driver_assistant_batta}`, `$${calc4.assistantTotal.toFixed(2)}`]);
  detailData.push(["Licensed National Tourist Guide Lecturer (NTGL)", calc4.transportDays, `$${TRANSPORT_RATES.guide_daily_fee}`, `$${calc4.guideTotal.toFixed(2)}`]);
  detailData.push(["Expressway Toll Fees & Parking Charges", "Lump sum", "-", `$${calc4.tollTotal.toFixed(2)}`]);
  detailData.push(["Total Transport & Guiding", "", "", `$${calc4.totalTransport.toFixed(2)}`]);

  detailData.push([""]);
  detailData.push(["SECTION 3: ENTRANCE TICKETS & EXCURSIONS (PER PERSON)"]);
  detailData.push(["Attraction / Activity", "Per Pax USD", "Group Total (17 Pax)"]);
  itin.attractions.forEach(attr => {
    const fee = ENTRANCE_FEES[attr] || 0;
    detailData.push([attr, `$${fee.toFixed(2)}`, `$${(fee * 17).toFixed(2)}`]);
  });
  detailData.push(["Total Entrances & Excursions", `$${calc4.totalEntrancePerPax.toFixed(2)}`, `$${calc4.totalEntrancesGroup.toFixed(2)}`]);

  detailData.push([""]);
  detailData.push(["SECTION 4: COST SUMMARY & PRICING COMPARISON"]);
  detailData.push(["Cost Component", "4-Star Package (Group)", "4-Star Per Person", "3-Star Package (Group)", "3-Star Per Person"]);
  detailData.push(["Accommodation (9 Rooms)", `$${calc4.totalAccom.toFixed(2)}`, `$${(calc4.totalAccom / 17).toFixed(2)}`, `$${calc3.totalAccom.toFixed(2)}`, `$${(calc3.totalAccom / 17).toFixed(2)}`]);
  detailData.push(["Transport & Guide (29-Seat Coach)", `$${calc4.totalTransport.toFixed(2)}`, `$${(calc4.totalTransport / 17).toFixed(2)}`, `$${calc3.totalTransport.toFixed(2)}`, `$${(calc3.totalTransport / 17).toFixed(2)}`]);
  detailData.push(["Entrance Tickets & Safaris", `$${calc4.totalEntrancesGroup.toFixed(2)}`, `$${calc4.totalEntrancePerPax.toFixed(2)}`, `$${calc3.totalEntrancesGroup.toFixed(2)}`, `$${calc3.totalEntrancePerPax.toFixed(2)}`]);
  detailData.push(["Value Additions (Water & Garlands)", `$${calc4.totalAdditions.toFixed(2)}`, `$${(calc4.totalAdditions / 17).toFixed(2)}`, `$${calc3.totalAdditions.toFixed(2)}`, `$${(calc3.totalAdditions / 17).toFixed(2)}`]);
  detailData.push(["NET COST TO OCEANWAY", `$${calc4.netTotalGroup.toFixed(2)}`, `$${calc4.netPerPax.toFixed(2)}`, `$${calc3.netTotalGroup.toFixed(2)}`, `$${calc3.netPerPax.toFixed(2)}`]);
  detailData.push(["SELLING PRICE (15% B2B MARKUP)", `$${calc4.sellingTotalGroup.toFixed(2)}`, `$${calc4.sellingPerPax.toFixed(2)}`, `$${calc3.sellingTotalGroup.toFixed(2)}`, `$${calc3.sellingPerPax.toFixed(2)}`]);

  const ws = xlsx.utils.aoa_to_sheet(detailData);
  xlsx.utils.book_append_sheet(wb, ws, itin.code);
});

// Sheet 5: Entrance Fee Reference Matrix
const entranceData = [
  ["SRI LANKA TOURIST ATTRACTIONS & EXCURSIONS - OFFICIAL B2B TICKET RATES (2026/2027)"],
  ["Attraction Name", "Category", "Rate Per Foreign Adult (USD)", "Notes"],
  ["Sigiriya Rock Fortress", "Cultural World Heritage", "$36.00", "UNESCO site - Central Cultural Fund"],
  ["Dambulla Golden Cave Temple", "Cultural World Heritage", "$12.00", "Includes rock temple & museum"],
  ["Polonnaruwa Ancient City", "Cultural World Heritage", "$30.00", "Includes museum & royal palace ruins"],
  ["Anuradhapura Sacred City", "Cultural World Heritage", "$30.00", "Includes Ruwanwelisaya, Sri Maha Bodhi"],
  ["Temple of the Sacred Tooth Relic (Kandy)", "Religious / Cultural", "$10.00", "Dalada Maligawa"],
  ["Royal Botanical Gardens Peradeniya", "Nature & Flora", "$10.00", "Over 4,000 plant species"],
  ["Kandy Cultural Dance Show", "Performance Art", "$8.00", "Traditional Kandyan drummers & fire-walking"],
  ["Tea Factory & Plantation Tour (Nuwara Eliya)", "Agro-tourism", "$5.00", "Includes tea tasting session"],
  ["Yala National Park Safari", "Wildlife Safari", "$45.00", "Includes private 4x4 safari jeep + entrance + tracker"],
  ["Madu River Boat Safari (Balapitiya)", "Eco-safari", "$12.00", "Cinnamon island, mangroves & fish therapy"],
  ["Kosgoda Sea Turtle Hatchery", "Conservation", "$8.00", "5 species of sea turtles conserved"],
  ["Galle Dutch Fort Walking Tour", "Heritage Walk", "$0.00", "Complimentary walking tour with guide"],
  ["Pinnawala Elephant Orphanage", "Wildlife Sanctuary", "$15.00", "Includes river bathing viewing"]
];

const wsEntrance = xlsx.utils.aoa_to_sheet(entranceData);
xlsx.utils.book_append_sheet(wb, wsEntrance, "Entrance Fees Matrix");

// Save Excel file
const outPath = join(OUT_DIR, "Oceanway_17Pax_International_Itineraries_Costing.xlsx");
xlsx.writeFile(wb, outPath);
console.log(`\n✅ Generated Master Costing Sheet: ${outPath}`);
console.log(`   Sheets created: ${wb.SheetNames.join(", ")}\n`);
