/**
 * Rate Sheet AI Analyzer & Master Costing Big Sheet Generator
 * Parses hotel rate sheet PDFs and Excels using AI, extracts room categories,
 * seasons, meal plan rates (BB, HB, FB, RO), and compiles them into a Master Costing Big Sheet.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { notifyPricingParsedToBigSheet } from "./discord_notifier.js";

const MASTER_SHEET_JSON_PATH = "master_costing_sheet.json";
const MASTER_SHEET_XLSX_PATH = join("rate_sheets", "Master_SriLanka_Hotel_Costing_Sheet.xlsx");

/**
 * Load the current master costing sheet data
 */
export function loadMasterCostingSheet() {
  if (!existsSync(MASTER_SHEET_JSON_PATH)) return [];
  try {
    return JSON.parse(readFileSync(MASTER_SHEET_JSON_PATH, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Save master costing sheet and re-generate the Excel .xlsx file
 */
export function saveMasterCostingSheet(rows) {
  writeFileSync(MASTER_SHEET_JSON_PATH, JSON.stringify(rows, null, 2), "utf-8");

  // Generate Excel workbook (.xlsx)
  try {
    const parentDir = join("rate_sheets");
    if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });

    // Format headers and rows for Excel
    const excelRows = rows.map((r, idx) => ({
      "#": idx + 1,
      "Destination": r.destination || "Sri Lanka",
      "Star Category": r.starCategory || "N/A",
      "Hotel Name": r.hotelName || "Unknown",
      "Room Category": r.roomType || "Standard",
      "Season / Period": r.season || "Standard Season",
      "Validity Dates": r.validity || "2026/2027",
      "Currency": r.currency || "USD",
      "Room Only (RO)": r.roRate || "-",
      "Bed & Breakfast (BB)": r.bbRate || "-",
      "Half Board (HB)": r.hbRate || "-",
      "Full Board (FB)": r.fbRate || "-",
      "Extra Bed Rate": r.extraBed || "-",
      "Child Policy": r.childPolicy || "-",
      "Cancellation / Notes": r.notes || "-",
      "Source File": r.sourceFile || "-"
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Hotel Costing Master");

    // Set column widths
    worksheet["!cols"] = [
      { wch: 4 },  // #
      { wch: 16 }, // Destination
      { wch: 14 }, // Category
      { wch: 28 }, // Hotel Name
      { wch: 22 }, // Room
      { wch: 18 }, // Season
      { wch: 22 }, // Validity
      { wch: 10 }, // Currency
      { wch: 14 }, // RO
      { wch: 18 }, // BB
      { wch: 18 }, // HB
      { wch: 18 }, // FB
      { wch: 14 }, // Extra Bed
      { wch: 25 }, // Child Policy
      { wch: 30 }, // Notes
      { wch: 25 }  // Source
    ];

    XLSX.writeFile(workbook, MASTER_SHEET_XLSX_PATH);
    console.log(`  📊 Master Costing Big Sheet updated: ${MASTER_SHEET_XLSX_PATH}`);
  } catch (err) {
    console.warn(`  ⚠ Error updating Excel Big Sheet: ${err.message}`);
  }
}

/**
 * Extract text from document (Supports Excel sheets directly, or prepares PDF base64)
 */
function readDocumentContent(filePath) {
  const ext = filePath.toLowerCase().split(".").pop();

  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    try {
      const workbook = XLSX.readFile(filePath);
      let fullCsv = "";
      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        fullCsv += `\n--- SHEET: ${sheetName} ---\n` + XLSX.utils.sheet_to_csv(sheet);
      });
      return { type: "text", content: fullCsv };
    } catch (err) {
      return { type: "error", error: err.message };
    }
  }

  try {
    const fileBuffer = readFileSync(filePath);
    if (ext === "pdf" || fileBuffer.subarray(0, 4).toString() === "%PDF") {
      return { type: "pdf", content: fileBuffer.toString("base64") };
    }
  } catch (err) {
    return { type: "error", error: err.message };
  }

  // Plain text fallback
  try {
    return { type: "text", content: readFileSync(filePath, "utf-8") };
  } catch (err) {
    return { type: "error", error: err.message };
  }
}

/**
 * AI Rate Sheet Analyzer using OpenRouter
 */
export async function analyzeRateSheetDocument(filePath, hotelMeta = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("  ⚠ Cannot analyze rate sheet: OPENROUTER_API_KEY missing.");
    return { success: false, reason: "OPENROUTER_API_KEY missing" };
  }

  const doc = readDocumentContent(filePath);
  if (doc.type === "error") {
    console.warn(`  ⚠ Could not read document: ${doc.error}`);
    return { success: false, reason: doc.error };
  }

  console.log(`\n🧠 AI Analyzing Rate Sheet for: "${hotelMeta.hotelName || "Hotel"}" (${filePath})...`);

  const promptText = `You are a Sri Lankan inbound travel agency contracting specialist.
Carefully analyze the attached hotel rate sheet for "${hotelMeta.hotelName || "Hotel"}" located in "${hotelMeta.destination || "Sri Lanka"}".
Extract every room type and contracted pricing structure for travel agents / tour operators.

Return ONLY a valid JSON array of objects with this exact structure:
[
  {
    "roomType": "Deluxe Sea View / Standard / Villa / etc.",
    "season": "Winter Peak / Summer / High / Low / etc.",
    "validity": "e.g. 01 Nov 2026 - 30 Apr 2027",
    "currency": "USD or LKR",
    "roRate": number or null (Room Only),
    "bbRate": number or null (Bed & Breakfast),
    "hbRate": number or null (Half Board),
    "fbRate": number or null (Full Board),
    "extraBed": number or null,
    "childPolicy": "short summary or age policy",
    "notes": "cancellation policy / minimum stay / driver policy"
  }
]

Do NOT return markdown formatting or extra commentary. Return pure JSON array only.`;

  try {
    let messageContent;
    // Prefer multimodal model for PDF or default model
    const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

    if (doc.type === "pdf") {
      const fileName = filePath.split(/[\\/]/).pop() || "rates.pdf";
      messageContent = [
        { type: "text", text: promptText },
        {
          type: "file",
          file: {
            filename: fileName,
            file_data: `data:application/pdf;base64,${doc.content}`
          }
        }
      ];
    } else {
      messageContent = `${promptText}\n\nDocument Data:\n${doc.content.slice(0, 15000)}`;
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/oceanway-tours",
        "X-Title": "Hotel Rate Sheet Analyzer",
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: messageContent }],
        max_tokens: 4500,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`  ⚠ OpenRouter error (${res.status}): ${errText.slice(0, 200)}`);
      return { success: false, reason: `API error ${res.status}` };
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || "";

    // Extract JSON array from LLM response with truncation recovery
    let parsedRates = null;
    const arrayStart = rawContent.indexOf("[");
    if (arrayStart !== -1) {
      let candidate = rawContent.slice(arrayStart);
      const arrayEnd = candidate.lastIndexOf("]");
      if (arrayEnd !== -1) {
        try {
          parsedRates = JSON.parse(candidate.slice(0, arrayEnd + 1));
        } catch (_) {}
      }
      if (!parsedRates) {
        // If truncated by token limit, trim to last complete object
        const lastBrace = candidate.lastIndexOf("}");
        if (lastBrace !== -1) {
          try {
            parsedRates = JSON.parse(candidate.slice(0, lastBrace + 1) + "]");
          } catch (_) {}
        }
      }
    }

    if (!Array.isArray(parsedRates) || parsedRates.length === 0) {
      console.warn("  ⚠ Could not parse JSON array from AI output.");
      return { success: false, raw: rawContent };
    }

    console.log(`  ✔ Extracted ${parsedRates.length} room pricing rows!`);

    // Merge into Master Costing Big Sheet
    const currentBigSheet = loadMasterCostingSheet();
    const sourceFileName = filePath.split(/[\\/]/).pop();

    const newRows = parsedRates.map((r) => ({
      destination: hotelMeta.destination || "Sri Lanka",
      starCategory: hotelMeta.starCategory || "Hotel",
      hotelName: hotelMeta.hotelName || "Unknown Hotel",
      placeId: hotelMeta.placeId || "",
      roomType: r.roomType || "Standard Room",
      season: r.season || "Regular",
      validity: r.validity || "2026/2027",
      currency: r.currency || "USD",
      roRate: r.roRate || null,
      bbRate: r.bbRate || null,
      hbRate: r.hbRate || null,
      fbRate: r.fbRate || null,
      extraBed: r.extraBed || null,
      childPolicy: r.childPolicy || "",
      notes: r.notes || "",
      sourceFile: sourceFileName,
      updatedAt: new Date().toISOString()
    }));

    // Remove existing rows for this specific hotel & source file to avoid duplication
    const filteredSheet = currentBigSheet.filter(
      (row) => !(row.hotelName === hotelMeta.hotelName && row.sourceFile === sourceFileName)
    );

    const updatedBigSheet = [...filteredSheet, ...newRows];
    saveMasterCostingSheet(updatedBigSheet);

    // Discord notification for Big Sheet update
    notifyPricingParsedToBigSheet(
      hotelMeta.hotelName,
      hotelMeta.destination,
      hotelMeta.starCategory,
      newRows.length,
      newRows.slice(0, 3)
    ).catch(() => {});

    return {
      success: true,
      ratesCount: newRows.length,
      sampleRates: newRows.slice(0, 3)
    };
  } catch (err) {
    console.warn(`  ⚠ AI Analysis error: ${err.message}`);
    return { success: false, reason: err.message };
  }
}
