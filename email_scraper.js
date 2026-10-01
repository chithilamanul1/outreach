/**
 * Hotel Website Email Scraper
 * Extracts official contact/reservations/sales emails from hotel websites
 */

import * as cheerio from "cheerio";

const SCRAPE_TIMEOUT_MS = 10000;

// Extensions and patterns to ignore
const IGNORED_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|bmp|tiff|woff|woff2|ttf|eot|js|css)$/i;
const IGNORED_DOMAINS = [
  "sentry.io",
  "wix.com",
  "wixpress.com",
  "mysite.com",
  "hotelonia.com",
  "xtadia.com",
  "wordpress.org",
  "schema.org",
  "google.com",
  "example.com",
  "domain.com"
];

// Department priority scores (higher is better for travel agency rate requests)
const PRIORITY_KEYWORDS = [
  { prefix: "contracting", score: 100 },
  { prefix: "reservations", score: 90 },
  { prefix: "resv", score: 85 },
  { prefix: "sales", score: 80 },
  { prefix: "inquiries", score: 70 },
  { prefix: "inquiry", score: 70 },
  { prefix: "frontdesk", score: 60 },
  { prefix: "info", score: 50 },
  { prefix: "general", score: 40 },
  { prefix: "contact", score: 30 }
];

// Common valid TLDs (longest first)
const VALID_TLDS = [
  ".com.lk", ".org.lk", ".hotel.lk", ".edu.lk", ".gov.lk", ".lk",
  ".co.uk", ".com", ".org", ".net", ".co", ".travel", ".hotel",
  ".info", ".io", ".biz", ".ca", ".uk", ".de", ".fr", ".au", ".in", ".asia"
];

/**
 * Trim glued text after TLD (e.g. .comaboutcontactoffers -> .com)
 */
function trimDomainToValidTld(domain) {
  if (!domain) return null;
  const clean = domain.toLowerCase();

  for (const tld of VALID_TLDS) {
    const idx = clean.indexOf(tld);
    if (idx !== -1) {
      return clean.substring(0, idx + tld.length);
    }
  }

  // Generic fallback: match up to 2-4 letter TLD
  const genericMatch = clean.match(/^([a-z0-9.-]+\.[a-z]{2,5})/i);
  if (genericMatch) return genericMatch[1];

  return clean;
}

/**
 * Clean and validate an email string
 */
function cleanEmail(rawEmail) {
  if (!rawEmail) return null;
  let email = rawEmail.trim().toLowerCase().replace(/[(),;:/?#]+$/, "");
  
  if (!email.includes("@")) return null;
  if (IGNORED_EXTENSIONS.test(email)) return null;

  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const localPart = parts[0];
  let domain = parts[1];

  if (!localPart || !domain || !domain.includes(".")) return null;

  // Trim glued words after domain (e.g. tabularasaresort.comaboutcontact -> tabularasaresort.com)
  domain = trimDomainToValidTld(domain);
  if (!domain || domain.length < 4) return null;

  for (const ign of IGNORED_DOMAINS) {
    if (domain.includes(ign)) return null;
  }

  return `${localPart}@${domain}`;
}

/**
 * Score an email based on travel agency relevance
 */
function scoreEmail(email) {
  let score = 10;
  for (const { prefix, score: pScore } of PRIORITY_KEYWORDS) {
    if (email.startsWith(prefix) || email.includes(prefix)) {
      score = Math.max(score, pScore);
    }
  }
  return score;
}

/**
 * Fetch HTML with timeout and user-agent
 */
async function fetchHtml(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Extract email addresses from raw HTML and mailto links
 */
function extractEmailsFromHtml(html, baseUrl) {
  if (!html) return [];
  const found = new Set();
  const $ = cheerio.load(html);

  // 1. Mailto links (most reliable)
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const raw = href.replace(/^mailto:/i, "").split("?")[0];
    const cleaned = cleanEmail(raw);
    if (cleaned) found.add(cleaned);
  });

  // 2. Strict regex search bounded by valid TLDs
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?:com\.lk|org\.lk|hotel\.lk|lk|com|org|net|co|travel|hotel|info|io|biz|ca|uk|de|fr|au|in|asia|[a-z]{2,5})\b/gi;
  const bodyText = $("body").text();
  const textMatches = bodyText.match(emailRegex) || [];
  for (const match of textMatches) {
    const cleaned = cleanEmail(match);
    if (cleaned) found.add(cleaned);
  }

  // Check footer or contact divs specifically
  $("footer, .footer, #footer, .contact, #contact").each((_, el) => {
    const matches = $(el).html()?.match(emailRegex) || [];
    for (const match of matches) {
      const cleaned = cleanEmail(match);
      if (cleaned) found.add(cleaned);
    }
  });

  return [...found];
}

/**
 * Find contact/reservations subpage links from the homepage
 */
function findContactLinks(html, baseUrl) {
  if (!html) return [];
  const links = new Set();
  const $ = cheerio.load(html);

  const keywords = ["contact", "reach", "reservations", "inquiry", "about", "get-in-touch"];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    const text = $(el).text()?.trim().toLowerCase();

    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("tel:") || href.startsWith("mailto:")) {
      return;
    }

    const matchesKeyword = keywords.some(
      (kw) => href.toLowerCase().includes(kw) || text.includes(kw)
    );

    if (matchesKeyword) {
      try {
        const fullUrl = new URL(href, baseUrl).toString();
        // Only include internal links
        const parsedBase = new URL(baseUrl);
        const parsedLink = new URL(fullUrl);
        if (parsedLink.hostname === parsedBase.hostname) {
          links.add(fullUrl);
        }
      } catch {
        // ignore invalid url
      }
    }
  });

  return [...links].slice(0, 3); // Max 3 subpages to avoid rate-limiting
}

/**
 * Main scraper function: Scrapes emails from website homepage and contact subpages
 */
export async function scrapeHotelEmails(websiteUrl) {
  if (!websiteUrl) return { primaryEmail: null, allEmails: [] };

  let urlToFetch = websiteUrl;
  if (!urlToFetch.startsWith("http://") && !urlToFetch.startsWith("https://")) {
    urlToFetch = "https://" + urlToFetch;
  }

  const collectedEmails = new Set();

  try {
    // 1. Fetch homepage
    const homeHtml = await fetchHtml(urlToFetch);
    if (homeHtml) {
      const homeEmails = extractEmailsFromHtml(homeHtml, urlToFetch);
      homeEmails.forEach((e) => collectedEmails.add(e));

      // 2. If no email or only generic email found, check contact subpages
      const contactLinks = findContactLinks(homeHtml, urlToFetch);
      for (const link of contactLinks) {
        if (collectedEmails.size >= 4) break; // enough emails collected
        const subHtml = await fetchHtml(link);
        if (subHtml) {
          const subEmails = extractEmailsFromHtml(subHtml, link);
          subEmails.forEach((e) => collectedEmails.add(e));
        }
      }
    }
  } catch (err) {
    console.warn(`  ⚠ Email scrape error for ${websiteUrl}: ${err.message}`);
  }

  const emailList = [...collectedEmails];
  if (emailList.length === 0) {
    return { primaryEmail: null, allEmails: [] };
  }

  // Sort by priority score
  emailList.sort((a, b) => scoreEmail(b) - scoreEmail(a));

  return {
    primaryEmail: emailList[0],
    allEmails: emailList
  };
}
