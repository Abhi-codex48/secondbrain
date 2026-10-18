# Second Brain: private notes, handwriting and daily news

A website for Android, iPhone, tablet and desktop. Anyone can sign in with Google and gets a private space that only they can read:

- **News**: today's headlines from ten major newspapers plus PIB, collected automatically every hour. Opening a headline loads the **full article** (through free reader services) with its **key points** (no AI). Bookmark articles or save any link.
- **Notes**: your repository in folders. You get:
  - rich text: bold, five highlight colours, text colours, headings, lists, checklists, quotes, links, images
  - handwriting with a pen or finger, and voice typing
  - live search and filters, pinning, version history and Trash
- **More**: a to-do list, "What I studied today", and a search of everything you recorded on any date.
- **Pen mode** on every screen: draw over what you're reading and save it as a handwriting note.
- **Search** across your notes, news and Wikipedia, with a one-tap Google search.
- **Backup and deletion**: download everything as a restorable file or as Markdown, free up space, delete all your data, or delete your account (Settings).

No AI service is used, and nothing needs a credit card.

---

## How it works

| Part | Runs on (free) | What it does |
|---|---|---|
| Website | **GitHub Pages** | Serves the app |
| Login and your notes | **Google Firebase**: Authentication and Cloud Firestore, Spark plan | Sign in with Google; notes, folders, tasks and handwriting are stored privately and synced across devices. Works offline; changes sync when you reconnect. |
| News | **GitHub Actions**, every hour | Reads the newspapers' public RSS feeds and publishes the **headlines, links and short feed descriptions** with the site (sports, entertainment and shopping stories are left out). Article text is never copied. |
| Key points | **Your device** | Picks the most informative sentences, the facts and figures, and the laws, bodies and schemes mentioned, straight from the text you paste. Nothing is reworded, so nothing is made up. |

Firebase free (Spark) plan limits, from third-party pricing guides at build time; check the Firebase console for current values:
- about 1 GB of stored data
- about 50,000 reads and 20,000 writes a day

The app is built to stay well inside these limits:
- notes are cached on the device, and only changed notes are downloaded
- images are shrunk before saving

Cloud Storage and Cloud Functions need the paid Blaze plan, so this app doesn't use them. That's why images are stored inside the note itself (about 1 MB per note).

---

## One-time setup (about 5 minutes, all clicks)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Create a project**. Name it `secondbrain`. Google Analytics isn't needed.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
3. In **Authentication → Settings → Authorized domains**, click **Add domain** and add `abhi-codex48.github.io`.
4. **Build → Firestore Database → Create database.** Pick a location (e.g. `asia-south1`, Mumbai) and **Start in production mode**.
5. In **Firestore → Rules**, replace everything with the contents of [`firestore.rules`](firestore.rules) and click **Publish**. This makes your notes readable and writable only by you.
6. Open **Project settings** (gear icon) → **General** → **Your apps** → click the **Web** icon `</>`. Name it `secondbrain` and click **Register app** (no hosting needed). Copy the `firebaseConfig` values it shows into [`src/firebase-config.ts`](src/firebase-config.ts) (already done for this site). These values are meant to be public; the rules from step 5 protect your data.

After the config is committed, the site rebuilds by itself. Open **https://abhi-codex48.github.io/secondbrain/** and tap **Continue with Google**.

To put it on your phone's home screen:
- **Android (Chrome):** menu ⋮ → **Add to Home screen**.
- **iPhone (Safari):** Share → **Add to Home Screen**.

---

## Using it

**News.**
- The page opens with today's headlines, sorted into topics: Polity, Economy, Environment, Science & Tech, International, Society, Security, Geography, History & Culture, Agriculture, Health and Editorial.
- **Sources:** The Hindu, The Indian Express, Hindustan Times, The Times of India, The Economic Times, Mint, Business Standard, Deccan Herald, The Tribune, The New Indian Express, and PIB. If a paper's own feed fails, its headlines come from a Google News search for that site. Settings shows which sources are working.
- **To study an article:** tap it. The full text loads in a few seconds from your own browser through free reader services (Jina Reader and two public page fetchers, tried at the same time), with the key points, facts and figures, and the laws, bodies and schemes it mentions. Subscriber-only articles load only the part the site shows to everyone; for those, open the article and use **Paste article text**. The text stays private in your account.

**Key points without AI.**
- The app scores every sentence by how many of the article's important words it contains, where it sits in the article, and whether it shares words with the headline. It then shows the best ones in their original order.
- Sentences with numbers (%, ₹, crore, lakh, dates) are listed as facts.
- Names ending in Act, Ministry, Commission, Scheme, Court and similar, plus Article and Section numbers, are listed as "mentioned".
- It quotes the article exactly, so it can't invent anything. It also can't explain or simplify.

**Handwriting and drawing (full-screen studio).**
- Tap **Write by hand**, or **Open** on a handwriting page in a note.
- **Pens:** ballpoint, fountain pen with stroke width that follows pressure, and pencil with a grainy line. Also a highlighter.
- **Erasers:** tap the eraser again to switch between *erase part* and *whole stroke*.
- **Thickness and colour:** a thickness slider and a colour palette with a custom colour picker.
- **Hold to straighten:** draw a line, box, circle or triangle and keep the pen still at the end. It snaps to a clean shape, which you can keep dragging to adjust.
- **Shapes** (from **+**): line, arrow, rectangle, circle, triangle and table. Lines snap to horizontal, vertical and 45°.
- **Text** (T): tap anywhere and type a label, in small, medium or large.
- **Lasso:** draw a loop around anything to move it, resize it from the corner handle, recolour, duplicate or delete it.
- **+ menu:** insert an image, add more space, choose paper (lined, grid, dots or plain), turn on stylus-only mode, or clear the page.
- **Zoom:** pinch with two fingers to zoom in (up to 4×) and move around; tap the zoom label to reset.
- **Stylus-only mode** turns on the first time a stylus touches the page, so your palm doesn't draw and a finger scrolls.
- **Saving:** autosaves as you draw. **Save** returns to the note, and **Share** sends the page as a PNG image.

**Pen mode** (the orange pen button on any screen) lets you write and highlight straight on the page. Scroll with two fingers (or one finger once you use a stylus, or the hand button). Nothing is saved until you press **Save**, which keeps a picture of that part of the page with your marks as a private note.

**Voice typing** is the microphone button in the editor. It works in Chrome, Edge and most versions of Safari, but not Firefox. Your keyboard's own mic key works everywhere.

**Safety nets.**
- Notes save on the device instantly and sync in the background, offline too.
- Editing keeps version history (the clock icon).
- Deleted notes go to Trash.
- Restoring the same backup twice doesn't create duplicates.

---

## Development

```bash
npm install
npm run dev        # http://localhost:5173 (needs src/firebase-config.ts filled in)
npm test           # topic classifier, feed parser, key points
npm run build
node --experimental-strip-types scripts/fetch-news.ts news.json   # try the news fetcher
```

- `src/lib/api.ts`: Firestore data layer (device cache plus downloading only what changed).
- `src/lib/keypoints.ts`: key-point extraction.
- `scripts/fetch-news.ts`: the hourly news collector.
- `shared/`: feed list, RSS parser and topic classifier.
- `firestore.rules`: security rules.

## Known limits
- Full text comes from free reader services. Subscriber-only articles, and papers that only publish through Google News (currently The Indian Express), can't be loaded; open the article and paste the text instead.
- Scheduled GitHub runs can be delayed at busy times, and GitHub pauses them if the repository has no activity for 60 days. Any push, or **Run workflow** in the Actions tab, restarts them.
- Topic tags come from keywords, so some articles may be tagged with the wrong topic.
- Each note can hold about 1 MB, which is enough for long text, several images or many pages of handwriting.
