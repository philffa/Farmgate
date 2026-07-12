# Farmgate — Setup Walkthrough

Follow these steps once to get the tool fully working. Should take about
10–15 minutes total.

## 1\. Create a Supabase project (free)

1. Go to [supabase.com](https://supabase.com) and sign up / log in.
2. Click **New project**. Pick any name (e.g. "farmgate"), set a database
password (save it somewhere, though you won't need it day-to-day), pick
the region closest to you (Sydney, if offered).
3. Wait \~2 minutes for the project to spin up.
4. Once it's ready, go to the **SQL Editor** (left sidebar) → **New query**.
5. Open `docs/schema.sql` from this repo, paste its entire contents into
the query editor, and click **Run**. You should see "Success. No rows
returned" — this creates both tables.
6. Go to **Project Settings** (gear icon) → **API**. You'll need two values
from this page in Step 3 below (Add your keys to the project):

   * **Project URL** (https://ahsezelwpsexyhmqfygy.supabase.co/rest/v1/)
   * **anon public** key (sb\_publishable\_EyfTwM3rwD0ol-tC0bDDUA\_LryCUu4e)

## 2\. Get a Gemini API key (free)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
and sign in with a Google account.
2. Click **Create API key**. Copy the key it gives you.
3. Free tier limits apply (a generous number of requests per day) — plenty
for occasional crop lookups.

## 3\. Add your keys to the project

1. Open `js/config.js` in this repo (if it doesn't exist yet, copy
`js/config.example.js` to `js/config.js` first).
2. Fill in the three values:

```js
   const CONFIG = {
     SUPABASE\_URL: "https://xxxxx.supabase.co",
     SUPABASE\_ANON\_KEY: "your-anon-key-here",
     GEMINI\_API\_KEY: "your-gemini-key-here",
   };
   ```

3. Save the file.

**Security note:** `config.js` contains your real API keys and is listed in
`.gitignore` so it won't be committed to a public repo by accident. If your
GitHub repo is public, double-check `config.js` never shows up in your
commits (run `git status` before pushing — it should not be listed). See
`docs/SPEC.md` for why this project accepts keys living client-side at all
(short version: personal tool, low stakes, deliberate trade-off).

## 4\. Publish to GitHub Pages

1. Create a new GitHub repo (public or private — private repos can still
use GitHub Pages on paid plans; free accounts need a public repo for
free Pages hosting).
2. Push this entire project folder to that repo.
3. In the repo, go to **Settings → Pages**.
4. Under **Source**, choose the branch (usually `main`) and folder (`/root`
unless you've moved things), then **Save**.
5. GitHub will give you a URL like `https://yourname.github.io/farmgate/` —
that's your live tool. It can take a minute or two to go live after the
first save.

## 5\. Test it

1. Open your GitHub Pages URL.
2. Type a crop name that's definitely not already in your database — try
something niche, e.g. "black sapote".
3. You should see a short loading state while it calls Gemini, then a
price window appear with a confidence label and today's date.
4. Add a buyer contact in the Demand Curve section (name, price, volume,
type, evidence level) — a small "Saved." indicator should appear, and a
dot should show up on the chart below.
5. Refresh the page and search the same crop again — the buyer you just
added should still be there (confirms Supabase read/write is working,
not just local browser memory).
6. Try a few different prices in the "Test a price" section and watch the
sellable volume and revenue change — then check the "Planting size \&
margin" section updates to match.
7. Click "Export 1-page PDF" — your browser's print dialog should open
showing a clean one-page summary. Choose "Save as PDF" (or your
browser's equivalent) as the destination to actually save a file.
8. Open the same GitHub Pages URL on your phone — search the same crop —
you should see the exact same benchmark price and buyer contacts
(confirms multi-device sync is working, the main point of this whole
setup).

If any step fails, check the browser console (F12 → Console tab, or your
phone browser's remote debugging tools) for error messages — they'll
usually point at whichever key or table is misconfigured. Common issues:

* `"Supabase URL not configured"` → `js/config.js` doesn't exist yet or
still has placeholder values — see Step 3 above.
* `"Gemini API key not configured"` → same issue, but for the Gemini key.
* A 403/401 error from Supabase → double-check you copied the **anon
public** key, not a different key, from Project Settings → API.

