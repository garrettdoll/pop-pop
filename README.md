# POP! POP!

Every vendor market Brooklyn SoftBoys could vend, in one place: what to apply for, what's due, who runs each market, and which systems you're already in. It lives on your phone's home screen like an app.

You almost never type. Send Claude a screenshot of a market and it goes in. Claude also checks your email and runs a light web search for you. The app is for **looking** and **quick taps**.

> **Heads up:** this site is public (anyone with the link could see it) because it's hosted free on GitHub Pages. Don't share the link, and nothing sensitive is stored in it: no passwords, no personal phone number or address, no payment details.

---

## Set it up (one step at a time)

Do one step, check that it worked, then move to the next.

### Step 1: Make sure the main branch is called `main`

1. Open your repo on GitHub: `https://github.com/garrettdoll/pop-pop`
2. Look at the branch name near the top left. If it says `main`, you're done: go to Step 2.
3. If it says something else (like `claude/…`): open **Settings → General → Default branch**, click the pencil/rename icon, type `main`, and confirm.

You should now see the code (index.html, app, data…) on a branch called `main`.

### Step 2: Turn on GitHub Pages

1. In the repo, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Under **Branch**, choose `main` and `/ (root)`, then click **Save**.

You should see a banner that says your site is being published. It takes a minute or two.

### Step 3: Look at the site on your computer

1. Open `https://garrettdoll.github.io/pop-pop/`
2. If you get a 404, wait another minute and refresh.

You should see **POP! POP!** with a yellow sticker, an "Apply now" section and a row of tabs. A "View-only" tag at the top is normal for now.

### Step 4: Make your GitHub token (so taps can save)

The token lets the app on your phone save changes to this repo. It only works on this one repo.

1. On GitHub, click your profile picture → **Settings** → **Developer settings** (bottom of the left menu) → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Token name:** `POP POP phone`. **Expiration:** pick the longest you're comfortable with (a year is fine; put a reminder in your calendar).
3. **Repository access:** choose **Only select repositories** and pick `pop-pop`.
4. **Permissions → Repository permissions → Contents:** set to **Read and write**. Leave everything else alone.
5. Click **Generate token** and **copy it right away**. GitHub shows it only once.

Keep the page open (or paste the token somewhere private for a minute) until Step 7.

### Step 5: Open the site on your phone

1. On your phone, open `https://garrettdoll.github.io/pop-pop/` in **Safari** (iPhone) or **Chrome** (Android).

### Step 6: Add it to your home screen

- **iPhone (Safari):** tap the **Share** button → **Add to Home Screen** → **Add**.
- **Android (Chrome):** tap the **⋮** menu → **Install app** (or **Add to Home screen**).

You should see a yellow **POP! POP!** icon on your home screen.

### Step 7: Connect the token

1. Open POP! POP! from the **home screen icon**.
2. On the welcome screen, paste your token and tap **Save and connect**. (If you skipped that screen, tap the gear icon → paste the token → **Save token**.)

The app checks the token with GitHub and shows "Connected". The "View-only" tag disappears.

### Step 8: Try one tap

1. Go to **Markets**, tap any card to open it, and change its **Status**.
2. You should see the sticker pop and a small **Saved** message.
3. (Optional) In the repo on GitHub you'll see a new commit like `app: Fort Greene Artisans Bazaar → applied`.

That's it. You're set up.

---

## Day to day

- **Add a market:** send Claude a screenshot (phone or computer). It reads the image, adds the market, flags anything missing, and tells you what it did. Anything you send goes in, wherever it is.
- **Home** shows what to apply for now, what's due this week, and what's next. If you're not sure whether you applied somewhere, tap **Yes, applied / Not yet / Skip it** right on the card.
- **For You** has questions Claude couldn't answer on its own (dates it couldn't find, which markets you did). Tap an answer or just tell Claude. There's no rush.
- **Explore** holds markets the web search found. Tap **Add to hub** to keep one or **Dismiss** to make it go away for good.
- **Organizers** shows which market systems you're already in, and flags the ones you still need to sign up for.
- **Results are optional.** After a market you can tap **Add results** (sales, booth fee, a thumbs up or down). Nobody will ask you to.

## Good to know

- **Weekend-first.** Saturday and Sunday events have no flag. A weekday event shows "Availability to confirm", or "Falls on Columbus Day weekend" when it's near a long weekend. Tell Claude which days your company gives off and it will use them.
- **Works offline.** With no signal you'll see the last saved data and an "Offline" banner. Taps made offline are kept and saved when you're back.
- **Token expires?** The app shows a banner saying GitHub didn't accept the token. Make a new one (Step 4), then gear icon → **Replace token**.
- **Something looks off?** Gear icon → **Reload data**. If a data file has a problem, Settings lists what the app skipped.
- **Change the look:** open `app/tokens.css`. The accent color, fonts, spacing and dark mode are all variables at the top. (For example, change `--accent: #ffe600` to `#ff4a1c` for a hot red-orange.)

## What's automated

Claude Code can run recurring jobs ("Routines") in the cloud. The plan is:

- **Email sweep:** every morning, Claude reads (never sends, never changes) your `info@brooklynsoftboys.com` inbox for market announcements, deadlines, acceptances and payment reminders, and updates the hub.
- **Market search:** every 3 days, a short web search for new markets in Williamsburg, Bushwick, Bed-Stuy, DUMBO and bigger Manhattan markets. Finds go to Explore, never straight into your hub. It stops early when there's nothing new.

You can also run either one yourself any time by telling Claude **"check my email for markets"** or **"run the market search"**.

*Status: see the end of Claude's first report. Turning the schedules on needs Claude to be able to save to this repo first.*

---

## For developers (and future Claude sessions)

- `CLAUDE.md` has the standing rules for running the hub.
- No build step. Static HTML, CSS and ES modules. Data lives in `data/*.json`.
- `node --test tests/*.test.mjs` runs the date and holiday tests. `NODE_PATH=$(npm root -g) node tests/e2e.mjs` runs the browser tests against a mock GitHub (needs Playwright). `node tools/validate-data.mjs` checks the data files.
- Typeface: [Archivo](https://fonts.google.com/specimen/Archivo) (SIL Open Font License), self-hosted in `app/fonts/`.
