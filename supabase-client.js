// Farmgate — Supabase client wrapper.
// All reads/writes to the two tables (crop_benchmarks, demand_curve_entries)
// go through the functions in this file. Nothing elsewhere in the app should
// call the Supabase SDK directly — keeps the persistence layer swappable.
//
// Depends on: CONFIG (js/config.js), the Supabase SDK CDN script (loaded in
// index.html before this file).

const FarmgateDB = (function () {
  "use strict";

  let client = null;
  let initError = null;

  function init() {
    if (client || initError) return; // already attempted
    try {
      if (typeof CONFIG === "undefined") {
        throw new Error("CONFIG is not defined — check js/config.js exists and loads before this file.");
      }
      if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes("YOUR-PROJECT")) {
        throw new Error("Supabase URL not configured — copy js/config.example.js to js/config.js and fill in real values.");
      }
      if (typeof supabase === "undefined") {
        throw new Error("Supabase SDK not loaded — check the CDN <script> tag in index.html.");
      }
      client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    } catch (err) {
      initError = err;
      console.error("[FarmgateDB] init failed:", err.message);
    }
  }

  function ensureReady() {
    init();
    if (initError) throw initError;
    if (!client) throw new Error("Supabase client not initialized for an unknown reason.");
  }

  // Normalize a crop name for use as the primary key: lowercase, trimmed,
  // internal whitespace collapsed. "  Sugar   Apple " -> "sugar apple"
  function normalizeCropName(name) {
    return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  // ---------------- crop_benchmarks ----------------

  // Returns the benchmark row for a crop, or null if not found.
  // Throws on genuine connection/config errors (caller should catch).
  async function getBenchmark(cropName) {
    ensureReady();
    const key = normalizeCropName(cropName);
    const { data, error } = await client
      .from("crop_benchmarks")
      .select("*")
      .eq("crop_name", key)
      .maybeSingle();
    if (error) throw error;
    return data; // null if no row found
  }

  // Insert or update a benchmark row. `fields` should include at least
  // display_name, wholesale_low/high, dtc_low/high, confidence, reasoning,
  // source. last_updated is always set to "now" server-side by this call
  // (callers don't need to supply it).
  async function upsertBenchmark(cropName, fields) {
    ensureReady();
    const key = normalizeCropName(cropName);
    const row = Object.assign({}, fields, {
      crop_name: key,
      last_updated: new Date().toISOString(),
    });
    const { data, error } = await client
      .from("crop_benchmarks")
      .upsert(row, { onConflict: "crop_name" })
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // Returns a list of { crop_name, display_name, last_updated } for every
  // crop ever looked up — used to populate the "recent crops" chips.
  // Ordered most-recently-updated first, capped at `limit`.
  async function listRecentCrops(limit) {
    ensureReady();
    const { data, error } = await client
      .from("crop_benchmarks")
      .select("crop_name, display_name, last_updated")
      .order("last_updated", { ascending: false })
      .limit(limit || 12);
    if (error) throw error;
    return data || [];
  }

  // Total count of crops in the table, for the footer stat.
  async function countCrops() {
    ensureReady();
    const { count, error } = await client
      .from("crop_benchmarks")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    return count || 0;
  }

  // ---------------- demand_curve_entries ----------------

  // Returns all demand curve rows for a crop, oldest first.
  async function getDemandEntries(cropName) {
    ensureReady();
    const key = normalizeCropName(cropName);
    const { data, error } = await client
      .from("demand_curve_entries")
      .select("*")
      .eq("crop_name", key)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  // Insert a new demand curve row. Returns the created row (with its new id).
  async function insertDemandEntry(cropName, fields) {
    ensureReady();
    const key = normalizeCropName(cropName);
    const row = Object.assign({}, fields, { crop_name: key });
    const { data, error } = await client
      .from("demand_curve_entries")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Update an existing demand curve row by id.
  async function updateDemandEntry(id, fields) {
    ensureReady();
    const row = Object.assign({}, fields, { updated_at: new Date().toISOString() });
    const { data, error } = await client
      .from("demand_curve_entries")
      .update(row)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // Delete a demand curve row by id.
  async function deleteDemandEntry(id) {
    ensureReady();
    const { error } = await client
      .from("demand_curve_entries")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return true;
  }

  // Public API
  return {
    init,
    normalizeCropName,
    getBenchmark,
    upsertBenchmark,
    listRecentCrops,
    countCrops,
    getDemandEntries,
    insertDemandEntry,
    updateDemandEntry,
    deleteDemandEntry,
  };
})();
