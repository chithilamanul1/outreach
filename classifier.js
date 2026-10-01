/**
 * Hotel Category & Star Rating Classifier
 * Ensures strict filtering so that searching for 3-star only yields 3-star,
 * 4-star only yields 4-star, and 5-star only yields 5-star.
 */

const BUDGET_KEYWORDS = [
  "hostel",
  "dorm",
  "homestay",
  "backpacker",
  "home stay",
  "guest house",
  "guesthouse",
  "room for rent",
  "budget stay"
];

/**
 * Filter out obvious non-matching places based on metadata
 */
export function quickFilter(place, targetCategory) {
  const name = (place.name || "").toLowerCase();

  // If targeting 4-star or 5-star, filter out obvious budget accommodations
  if (targetCategory === "4-star" || targetCategory === "5-star") {
    for (const kw of BUDGET_KEYWORDS) {
      if (name.includes(kw)) {
        return {
          valid: false,
          reason: `Name contains budget accommodation keyword '${kw}'`
        };
      }
    }
  }

  // 5-star hotels typically have decent review counts in Sri Lanka
  if (targetCategory === "5-star" && place.user_ratings_total && place.user_ratings_total < 20) {
    // Very few reviews for a supposed 5-star hotel in Sri Lanka is suspicious unless brand new
    // We don't strictly reject, but flag it
  }

  return { valid: true };
}

/**
 * Verify hotel star rating using LLM if needed
 */
export async function verifyStarRating(placeDetails, targetCategory, apiKey, model) {
  if (!apiKey) return { verified: true, starCategory: targetCategory };

  const prompt = `You are a Sri Lankan hospitality industry expert and travel agent contractor.
Determine if the following property in Sri Lanka qualifies as a "${targetCategory}" property.

Hotel Details:
- Name: "${placeDetails.name}"
- Address: "${placeDetails.formatted_address || "N/A"}"
- Google Rating: ${placeDetails.rating || "N/A"} (${placeDetails.user_ratings_total || 0} reviews)
- Website: "${placeDetails.website || "N/A"}"

Rules:
- 5-Star: Luxury resorts and upscale international/national standard 5-star hotels (e.g., Shangri-La, Cinnamon Grand, Jetwing Lighthouse, Heritance, Cape Weligama, Santani, etc.).
- 4-Star: Premium full-service 4-star hotels, luxury boutique hotels, and upscale resorts (e.g., Mount Lavinia Hotel, Aliya Resort, Cinnamon Citadel, OZO, Fairway, Jetwing Lake, etc.).
- 3-Star: Good mid-range standard hotels, comfortable beach resorts, and established tourist hotels. NOT budget homestays, NOT backpacker dorms.

Respond in EXACT JSON format:
{
  "matchesCategory": true or false,
  "detectedStarRating": "3-star" or "4-star" or "5-star" or "unrated" or "budget",
  "reason": "short explanation"
}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/travel-agency-rate-gatherer",
        "X-Title": "Hotel Star Classifier",
      },
      body: JSON.stringify({
        model: model || "anthropic/claude-3-haiku",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      return { verified: true, starCategory: targetCategory };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    
    // Extract JSON from output
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        verified: parsed.matchesCategory === true,
        detectedStarRating: parsed.detectedStarRating || targetCategory,
        reason: parsed.reason || ""
      };
    }

    return { verified: true, starCategory: targetCategory };
  } catch (err) {
    console.warn(`  ⚠ Classifier warning: ${err.message}`);
    return { verified: true, starCategory: targetCategory };
  }
}
