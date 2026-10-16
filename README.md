# Second Brain: UPSC notes and news

A personal study website that works on Android, iPhone, tablet and desktop:

- **News**: today's UPSC-related articles from ten major newspapers plus PIB, fetched automatically. Paste any article link to read it. Every article with readable text gets an AI summary in simple English.
- **Notes**: your repository in folders. Rich text (bold, highlight in five colours, text colours, headings, lists, checklists, quotes, links, images), handwriting with a pen or finger, voice typing, live search and filters, pinning, version history and Trash.
- **More**: a to-do list, "What I studied today", and a search of everything you recorded on any date.
- **Pen mode** on every screen: draw over whatever you are reading and save it as a handwriting note.
- **Search** across your notes, saved news and Wikipedia, with a one-tap Google search.
- **Backup**: download everything as JSON (restorable) or Markdown, restore safely, and free up storage.

Everything runs on free plans. No credit card is needed for any step below.

---

## How it fits together

| Part | Service (free plan) | What it does |
|---|---|---|
| Website | **GitHub Pages** (public repo) | Serves the app |
| Database, login, image storage | **Supabase** | Stores your notes privately; row-level security means only your account can read them |
| Server functions | **Supabase Edge Functions** | Fetch newspaper feeds, read articles, call the AI. API keys stay on the server |
| AI summaries | **Groq** (first), **Google Gemini** (backup) | Summaries in simple English. Optional: the app works without them |

Free-plan limits as published when this was built (check the providers' pages for current values):
- Supabase free: 500 MB database, 1 GB file storage, 2 projects. **A free project is paused after 7 days without activity**; your data is kept and you restore it from the Supabase dashboard. Daily use keeps it active.
- Groq and Gemini free tiers have per-day request limits that change over time. The app also caps itself at 150 AI requests per day (`AI_DAILY_LIMIT`). When a limit is reached, reading and writing notes keep working.
- **Privacy:** Google's pricing page states that content sent on the Gemini *free* tier may be used to improve Google's products. Only article text (or a note's typed text when you tap "Summarise with AI") is ever sent. Leave the Gemini key out if you prefer.

---

## One-time setup (about 20 minutes)

### 1. Create the Supabase project
1. Sign up at [supabase.com](https://supabase.com) and click **New project**.
2. Name it `secondbrain`, choose the region **Mumbai (ap-south-1)**, and set a **database password**. Save the password somewhere safe.
3. When it's ready, open **Project Settings → API** and copy:
   - **Project URL** (looks like `https://abcd1234.supabase.co`). The part before `.supabase.co` is your **project ref**.
   - **anon public** key.
4. Open your account menu → **Access Tokens** → **Generate new token**. Copy it.
5. Open **Authentication → URL Configuration** and set **Site URL** to `https://abhi-codex48.github.io/secondbrain/`.

### 2. Get a free AI key
- **Groq** (recommended): sign in at [console.groq.com](https://console.groq.com), open **API Keys**, then **Create API Key**.
- **Gemini** (optional backup): [aistudio.google.com](https://aistudio.google.com), then **Get API key**.

### 3. Add the values to GitHub
Open the repository on GitHub, then **Settings → Secrets and variables → Actions**.

Under **Secrets**, add:

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | token from step 1.4 |
| `SUPABASE_PROJECT_REF` | project ref from step 1.3 |
| `SUPABASE_DB_PASSWORD` | database password from step 1.2 |
| `GROQ_API_KEY` | Groq key (optional) |
| `GEMINI_API_KEY` | Gemini key (optional) |

Under the **Variables** tab, add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |

The anon key is designed to be public; your data is protected by row-level security. Never put the `service_role` key anywhere in this repo.

### 4. Turn on the website
1. Merge this code into the `main` branch.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Open the **Actions** tab, choose **Set up Supabase (database + server functions)**, and click **Run workflow**. It creates the tables and security rules and deploys the three server functions.
4. In **Actions**, run **Deploy website** (it also runs on every push to `main`).
5. Your site is at **https://abhi-codex48.github.io/secondbrain/**.

### 5. Create your account and keep it private
1. Open the site, tap **Create account**, and confirm the email Supabase sends you.
2. In Supabase, open **Authentication → Sign In / Providers** and turn **off "Allow new users to sign up"**. Only your account can then sign in.

### 6. Put it on your phone's home screen
- **Android (Chrome):** menu ⋮ → **Add to Home screen**.
- **iPhone/iPad (Safari):** Share → **Add to Home Screen**.

---

## Using it

**News.** It opens with today's articles, filtered to UPSC topics (Polity, Economy, Environment, Science & Tech, International, Society, Security, Geography, History & Culture, Agriculture, Health, Editorial). News is checked automatically when you open the page (at most once an hour), or when you tap **Refresh**. Each card shows how much text was available: **Full text**, **Excerpt** or **Headline only**. A summary is never made from a headline alone. For paywalled or blocked articles, use **Open original** or **Paste article text**.

**Sources** (editable in Settings → News sources): The Hindu, The Indian Express, Hindustan Times, The Times of India, The Economic Times, Mint, Business Standard, Deccan Herald, The Tribune, The New Indian Express, and PIB. Where a paper's own RSS feed doesn't work, its headlines come from Google News search for that site (headlines only). Settings shows which sources are responding.

**Handwriting.** Use **Write by hand** in any note. You get a pen with pressure from a stylus, a highlighter, an eraser (removes whole strokes), six colours, four sizes, undo/redo, and lined, grid or plain paper. **Stylus-only mode** turns on automatically the first time a stylus is used, so your palm doesn't draw; a finger then scrolls the page. Pages grow as you write, and any page can be saved as a PNG image.

**Voice typing** (microphone button in the editor) uses the browser's speech recognition. It works in Chrome and Edge and most versions of Safari, but not in Firefox. Chrome sends the audio to Google to convert it to text. Your keyboard's own mic key works everywhere.

**Dates.** Dates are shown in India time. Each note keeps the source's publication date (or "not given"), the date you read it (you can change it), and its created and edited times.

**Safety nets.**
- Notes autosave. If the connection drops, the latest text is kept on the device and saved when you're back online.
- Editing creates version history (Restore from the clock icon).
- Deleted notes go to Trash.
- Restoring the same backup twice does not create duplicates.

---

## Development

```bash
npm install
cp .env.example .env.local   # add your Supabase URL and anon key
npm run dev                  # http://localhost:5173
npm test                     # unit tests + database security tests (in-memory Postgres)
npm run build
```

- `src/`: React app (pages, the handwriting engine in `components/Ink.tsx`, the editor in `components/RichEditor.tsx`).
- `supabase/migrations/`: tables, row-level security, version-history trigger, storage bucket.
- `supabase/functions/`: `news-sync`, `fetch-article` (with guards against private-network addresses), and `summarise`.
- `supabase/functions/_shared/`: feed parsing, the topic classifier, URL safety checks and AI prompts. All are tested in `tests/`.

## Known limits
- Paywalled articles (for example premium stories) can't be read automatically. Paste the text instead.
- Some feed links in the default list could not be confirmed when this was built. A failing feed shows in Settings and falls back to Google News headlines. You can replace feed links there.
- Topic tags come from keywords, so an article is sometimes tagged with the wrong topic.
- AI summaries can contain mistakes. They are labelled as drafts, kept separate from your own writing, and say what text they were based on.
- Handwriting is stored as editable strokes. It is not converted to typed text.
- Image files are not inside the JSON backup; only their links are.
