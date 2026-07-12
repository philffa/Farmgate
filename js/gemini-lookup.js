// Farmgate — Gemini price lookup module.
// Given a crop name, asks Gemini for a wholesale/DTC price benchmark focused
// on QLD/east-coast Australia, with an honestly self-reported confidence
// level. Returns a plain object shaped to match the crop_benchmarks table
// columns (see docs/SPEC.md), ready to pass to FarmgateDB.upsertBenchmark().
//
// Depends on: CONFIG.GEMINI_API_KEY (js/config.js)

const GeminiLookup = (function () {
  "use strict";

  const MODEL = "gemini-3.5-flash";
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const VALID_CONFIDENCE = ["qld_specific", "east_coast", "australia_general", "global_estimate"];

  function buildPrompt(cropDisplayName) {
    return `You are helping a Queensland, Australia market gardener estimate price benchmarks for a crop they are considering growing.

Crop: "${cropDisplayName}"

Give your best estimate of TWO price ranges for this crop, in Australian dollars per kilogram (AUD/kg):
1. WHOLESALE price range — what a grower would receive selling in bulk to a wholesaler, distributor, or large buyer.
2. DIRECT-TO-CONSUMER (DTC) price range — what the same product typically sells for direct to consumers or small buyers (farmers markets, farm-gate, direct restaurant sales), which is usually higher than wholesale.

IMPORTANT — be honest about how local your knowledge actually is. Try to find data in this priority order, and report which level you actually achieved:
1. "qld_specific" — you have specific knowledge of Queensland, Australia pricing for this crop.
2. "east_coast" — you don't have QLD-specific data, but have reasonable knowledge of NSW/QLD/VIC east-coast Australian pricing.
3. "australia_general" — you only have general Australia-wide pricing knowledge, not region-specific.
4. "global_estimate" — you have no reliable Australian data at all, and are estimating from global/international pricing (e.g. US, European) as a rough proxy.

Do not claim a higher confidence level than you genuinely have. If this is a rare or unusual crop you have little data on, it is fine and expected to report "global_estimate" — that honesty is more valuable than a falsely confident answer.

Respond with ONLY a JSON object, no other text, no markdown code fences, matching exactly this shape:
{
  "display_name": "Proper Case Name",
  "wholesale_low": <number>,
  "wholesale_high": <number>,
  "dtc_low": <number>,
  "dtc_high": <number>,
  "confidence": "<one of: qld_specific, east_coast, australia_general, global_estimate>",
  "reasoning": "<one or two sentences on what you're anchoring this estimate to, e.g. specific markets, comparable crops, or data sources you're drawing on>"
}`;
  }

  // Strip markdown code fences if Gemini wraps its JSON despite instructions.
  function stripCodeFences(text) {
    let t = text.trim();
    if (t.startsWith("```")) {
      t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
    }
    return t;
  }

  // Validate and normalize the parsed object. Throws a descriptive error
  // if the shape is unusable, rather than silently passing bad data on.
  function validateAndNormalize(obj, cropDisplayName) {
    const errors = [];

    if (!obj || typeof obj !== "object") {
      throw new Error("Gemini response was not a JSON object.");
    }

    const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

    const wholesale_low = num(obj.wholesale_low);
    const wholesale_high = num(obj.wholesale_high);
    const dtc_low = num(obj.dtc_low);
    const dtc_high = num(obj.dtc_high);

    if (wholesale_low === null) errors.push("wholesale_low missing or not a number");
    if (wholesale_high === null) errors.push("wholesale_high missing or not a number");
    if (dtc_low === null) errors.push("dtc_low missing or not a number");
    if (dtc_high === null) errors.push("dtc_high missing or not a number");

    let confidence = obj.confidence;
    if (!VALID_CONFIDENCE.includes(confidence)) {
      errors.push(`confidence "${confidence}" is not one of ${VALID_CONFIDENCE.join(", ")} — defaulting to global_estimate`);
      confidence = "global_estimate"; // safe fallback: understate confidence, never overstate
    }

    if (errors.length > 0 && (wholesale_low === null || wholesale_high === null || dtc_low === null || dtc_high === null)) {
      // Missing numeric data is fatal — nothing sensible to show.
      throw new Error("Gemini response missing required price fields: " + errors.join("; "));
    }

    // Sanity check: low should not exceed high. Swap if reversed rather than failing outright.
    let wl = wholesale_low, wh = wholesale_high;
    if (wl > wh) { const t = wl; wl = wh; wh = t; }
    let dl = dtc_low, dh = dtc_high;
    if (dl > dh) { const t = dl; dl = dh; dh = t; }

    return {
      display_name: (typeof obj.display_name === "string" && obj.display_name.trim()) ? obj.display_name.trim() : cropDisplayName,
      wholesale_low: wl,
      wholesale_high: wh,
      dtc_low: dl,
      dtc_high: dh,
      confidence: confidence,
      reasoning: (typeof obj.reasoning === "string" && obj.reasoning.trim()) ? obj.reasoning.trim() : "(No reasoning provided.)",
      source: "gemini",
      _validationWarnings: errors, // kept for debugging/console logging, not shown to user directly
    };
  }

  // Main entry point. cropDisplayName should be the human-typed name
  // (e.g. "Sugar Apple") — normalization for storage happens elsewhere
  // (FarmgateDB.normalizeCropName), this module just needs something
  // readable to put in the prompt and as a display_name fallback.
  async function lookupCropPrice(cropDisplayName) {
    if (typeof CONFIG === "undefined" || !CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY.includes("YOUR-GEMINI")) {
      throw new Error("Gemini API key not configured — copy js/config.example.js to js/config.js and fill in a real key.");
    }

    const prompt = buildPrompt(cropDisplayName);

    let response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": CONFIG.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 1.0, // low temperature: we want consistent, grounded estimates, not creative variation
            responseMimeType: "application/json",
          },
        }),
      });
    } catch (networkErr) {
      throw new Error("Network error calling Gemini API: " + networkErr.message);
    }

    if (!response.ok) {
      let bodyText = "";
      try { bodyText = await response.text(); } catch (_) {}
      throw new Error(`Gemini API returned ${response.status} ${response.statusText}. ${bodyText.slice(0, 300)}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (err) {
      throw new Error("Gemini API response was not valid JSON at the HTTP level: " + err.message);
    }

    const candidate = payload && payload.candidates && payload.candidates[0];
    const text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;

    if (!text) {
      // Check for a blocked/safety response specifically, since that's a distinct failure mode worth surfacing clearly.
      const finishReason = candidate && candidate.finishReason;
      if (finishReason && finishReason !== "STOP") {
        throw new Error(`Gemini did not return usable content (finishReason: ${finishReason}). This crop name may need rephrasing.`);
      }
      throw new Error("Gemini response contained no text content. Raw payload: " + JSON.stringify(payload).slice(0, 300));
    }

    const cleaned = stripCodeFences(text);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error("Could not parse Gemini's response as JSON: " + err.message + " | Raw text: " + cleaned.slice(0, 300));
    }

    const normalized = validateAndNormalize(parsed, cropDisplayName);
    if (normalized._validationWarnings.length > 0) {
      console.warn("[GeminiLookup] validation warnings for '" + cropDisplayName + "':", normalized._validationWarnings);
    }
    delete normalized._validationWarnings;

    return normalized;
  }

  return {
    lookupCropPrice,
    // exposed for testing/debugging only:
    _buildPrompt: buildPrompt,
    _validateAndNormalize: validateAndNormalize,
    _stripCodeFences: stripCodeFences,
  };
})();
