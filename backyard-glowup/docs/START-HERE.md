# Backyard Glow Up: everything you need to know

A handoff from the Claude session that designed and built this app (October 14 to 17, 2026)
to the Claude session on the owner's Mac that will compile it and ship it to the App Store.
Read this whole file first. Then open `backyard-glowup/docs/design/backyard-preview.html` in a
browser to see the look the owner approved, and read `backyard-glowup/CLAUDE.md` and
`backyard-glowup/LAUNCH.md`.

This file is saved in the code too, at `backyard-glowup/docs/START-HERE.md`, and
`CLAUDE.md` points to it, so later sessions on the Mac find it automatically. Paths below
are relative to the folder that contains `backyard-glowup/`.

---

## 1. Read this first

- **What it is:** an iPhone app for a backyard contracting company. A homeowner photographs
  their backyard, picks a plan, and sees an AI redesign of *their own yard* with a
  before/after slider.
- **Who you're working with:** the owner of that contracting company. **Not a developer.**
  Talk in plain language, one step at a time, and tell them exactly what to click when
  they need to do something (Apple, OpenAI, Render, Amazon).
- **The owner loves the colors, the dark look, and the overall design.** Keep it exactly as
  described in section 4. Don't restyle anything without asking.
- **Deadline:** submit to Apple by **Friday, November 6, 2026**, live about **November 13**.
- **Your first job:** the SwiftUI code has **never been compiled** (it was written in a Linux
  cloud environment with no Xcode). Generate the project, build it for the simulator, and fix
  whatever the compiler finds:
  ```sh
  brew install xcodegen          # once
  cd backyard-glowup/ios && xcodegen
  xcodebuild -project BackyardGlowUp.xcodeproj -scheme BackyardGlowUp \
    -destination 'platform=iOS Simulator,name=iPhone 16' build
  ```
  Pick any installed simulator (`xcrun simctl list devices available`). Run the server
  locally while you test the app: `cd backyard-glowup && npm start`. It needs **Node.js 22
  or newer** (`brew install node` if `node --version` fails) but no npm packages. With no
  OpenAI key it runs in "preview mode" and returns the original photo, so the whole flow
  works for free.
- **Get the code from GitHub, not just this zip** (section 5, "Getting the code onto the
  Mac"), so your work can be pushed and deployed.
- **Then** work through section 10 ("Your task list") in order.

---

## 2. The owner and the business

- Owns a **backyard contracting company** (they build decks, pergolas, patios, and so on).
- Also owns a separate kids' app (room cleaning with an AI "glow up" of the bedroom). This app
  is the **backyard version** of that idea. The two are unrelated codebases.
- Wants the app to make money two ways:
  1. **Glow Up:** customers buy the products shown in their redesigned yard from the
     owner's **Amazon store**.
  2. **Glow Up Plus:** the premium option. A contractor (the owner's company) builds the
     whole transformation. The owner said it will be "way more expensive", because the
     customer gets a real contractor and does no work. How Plus is priced or charged is
     **not decided**; today it's a free quote request.
- Once mentioned wanting the OpenAI calls to "eventually run on Astra" on their server. It's
  unclear what Astra is (see section 11). Don't let it block the launch.

---

## 3. The product

### The two plans

Defined in `backyard-glowup/src/presets.js`, the single source of truth for plan ids, item
ids, labels, blurbs, defaults, and the AI prompt text. The app downloads this catalog from
the server (`GET /api/config`), so items can change without an app update. **Never hardcode
the catalog in Swift.**

**Glow Up** (`id: glowup`, `kind: shop`). Blurb: "Shop the look. Products picked for your
yard, ready to order from Amazon." The AI adds products to the customer's photo. Items
(defaults marked *):

| id | Label |
|---|---|
| `lights`* | Outdoor string lights |
| `seating`* | Patio conversation set |
| `rug` | Outdoor rug |
| `umbrella` | Patio umbrella |
| `planters`* | Planters with flowers |
| `firebowl` | Fire pit bowl |
| `pathlights` | Solar path lights |
| `hammock` | Hammock with stand |

Each item has a `url` field for its Amazon product link. All are empty today; items with no
link fall back to `AMAZON_STORE_URL`, and with neither the app shows "Link coming soon"
(which must not ship; see section 9).

**Glow Up Plus** (`id: glowupplus`, `kind: contractor`). Blurb: "Done for you. A local
contractor builds the whole transformation." Upgrades (defaults marked *):

| id | Label |
|---|---|
| `landscaping`* | New sod and landscaping |
| `deck`* | New composite deck |
| `pergola`* | Pergola with climbing plants |
| `firepit`* | Stone fire pit with seating |
| `beds` | Raised garden beds |
| `fence` | Privacy fence and screening |
| `kitchen` | Outdoor kitchen counter |
| `pool` | Small plunge pool |

**Styles** (both plans): Keep it natural (no style, the default), Modern, Cottage, Rustic,
Tropical.

**Prompts:** the AI only changes what was picked ("Only change the parts of the yard
described above"), and keeps the same camera angle, house, fences and sky. Shop prompts say
"Add these outdoor products to this backyard photo..."; contractor prompts say "Edit this
backyard photo to show a finished professional renovation with...".

### How a customer uses it

1. **Design tab:** take or choose a photo → pick Glow Up or Glow Up Plus → tick items or
   upgrades → pick a style → tap "Show Me the Glow Up" / "Show Me the Glow Up Plus".
2. **Result screen:** before/after slider, then:
   - Glow Up: **"Shop this look"**, one row per chosen item with a small **"View on
     Amazon"** button (opens the Amazon app or Safari, never an in-app web view).
   - Glow Up Plus: **"What's included"**, then a big green **"Get This Built"** button and the
     footnote "A local contractor will contact you with a quote."
   - Both: a **"Share"** button (iOS share sheet with the after image).
3. **Get This Built** (Plus only): a sheet with Name, Phone, Email, ZIP code, Notes. Phone *or*
   email is required. Sending posts to the server, which saves the request and emails the
   owner. Then "Request sent".
4. **Gallery tab:** the designs made **on this phone**. The *list* of designs (ids, file
   names, plan, items, date; max 50) is saved on the phone in UserDefaults and is never
   fetched from the server, so customers never see each other's yards. The *pictures* are
   not stored on the phone: tiles and before/after images load from the server's
   `/outputs/<file>`. So a design disappears from the Gallery after the server deletes it
   (`RETENTION_DAYS`, default 90; designs attached to a Get This Built request are kept), and
   Get This Built on it then fails with "That design is no longer available". The privacy
   policy and consent screen must say photos and designs are stored on our server for 90 days
   (longer when attached to a request).
5. **Settings** (gear icon): server address and connection status. A developer tool; hide it in
   release builds (section 10).

No accounts, no sign-in, no payments in the app.

---

## 4. Design: colors, type, and every screen (the owner loves this; keep it)

**Approved references** (in `backyard-glowup/docs/design/`):
- `backyard-preview.html`: open it in a browser. A clickable copy of the app (phone frame
  on desktop). Its "No AI key yet" switch shows the preview-mode banner.
- `screenshots/`: `dark-*` and `light-*` phone captures of the top of the Design screen
  (`design-top`), the Items/Upgrades sections for each plan (`design-glowup`,
  `design-plus`), the main button (`design-bottom-button`) and its working state
  (`design-generating`), the preview-mode banner, both result screens (`result-shop`,
  `result-plus`), the Get This Built form (`sheet`) and Request sent (`sent`), Gallery,
  and Settings; plus `phone-*` captures at iPhone width.

**Where the preview differs from the app on purpose** (don't copy these into the app):
- The yard pictures are illustrations, labeled "Sample yard (drawing)", and the preview has
  a "Use the sample yard instead" link. The real app starts with an empty photo box and shows
  AI photos.
- On a computer with a mouse, the style chips wrap onto two lines. In the app they scroll
  sideways in one row.
- "View on Amazon" and "Share" show a short message in the preview. In the app they open
  Amazon and the iOS share sheet.
- The Gallery has two "Example" designs, and a guide panel sits beside the phone.
- The preview never shows "Link coming soon" (it uses placeholder links).

The look is **native iOS (SwiftUI) with one accent color: green.** The owner especially loves
the **dark mode** look ("very nice and very professional"). The app follows the phone's
light/dark setting today; the owner has been offered "always dark" (one line:
`.preferredColorScheme(.dark)` at the root) but **hasn't decided**. Ask before changing it.

### Colors

| Role | SwiftUI | Light | Dark |
|---|---|---|---|
| **Accent** (buttons, selected states, checkmarks, section-number badges, links) | `.tint(.green)` at the app root; `Color.green` | `#34C759` | `#30D158` |
| Text on green | `.white` | `#FFFFFF` | `#FFFFFF` |
| Screen background | system background | `#FFFFFF` | `#000000` |
| Cards, list groups, unselected chips | `Color(.secondarySystemBackground)` | `#F2F2F7` | `#1C1C1E` |
| Empty photo box | `.quaternary` fill | translucent gray | translucent gray |
| Primary text | `.primary` | black | white |
| Secondary text, hints, unchecked circles | `.secondary` | 60% gray | 60% light gray |
| Selected plan card | `Color.green.opacity(0.15)` fill + 2 pt green border | | |
| Preview-mode banner and notes | `Color.orange.opacity(0.15)` background | | |
| Errors | `.red` | | |
| Slider handle and knob | `.white` (knob icon `.black`) | | |
| "Before" / "After" tags | `.black.opacity(0.55)` capsule, white text | | |

**No other accent colors.** Don't add brand colors, gradients, or a second accent.

### Type

System font (SF Pro) with Dynamic Type styles throughout: large navigation titles;
section titles `.title3.bold()`; plan names and section headers `.headline`; body text
default; hints and notes `.footnote`; plan blurbs `.caption`.

### Components

- **Section title:** a 22×22 pt green circle with the step number in white `.caption.bold()`,
  then the title in `.title3.bold()`. Sections: 1 Your yard, 2 Pick a plan, 3 Items (Glow Up)
  or Upgrades (Plus), 4 Style.
- **Photo box:** full width, 220 pt tall, 16 pt corners, `.quaternary` fill. Empty state:
  `photo.badge.plus` at 40 pt and "Take or choose a photo of the backyard" (`.subheadline`,
  secondary). Below it, two equal `.bordered` buttons: "Take Photo" (`camera`; only when a
  camera exists) and "Choose Photo" (`photo.on.rectangle`, PhotosPicker).
- **Plan cards:** two side by side, min height 150, 14 pt padding, 16 pt corners. Icon at
  `.title2` (`bag` for Glow Up, `hammer` for Plus, chosen by `kind`), name `.headline`,
  blurb `.caption` secondary. Selected: green 15% fill + 2 pt green border. Unselected:
  secondary background.
- **Item list:** one rounded group (14 pt corners, secondary background); rows with 12/14 pt
  padding and the label on the left. On the right, `checkmark.circle.fill` in green when on,
  `circle` in secondary when off, at `.title3`. Dividers inset 14 pt, between rows only
  (none under the last row).
- **Style chips:** horizontal scroll of capsules, 14×8 pt padding, `.subheadline.weight(.medium)`.
  Selected: solid green with white text. Unselected: secondary background with primary text.
- **Main button:** `.borderedProminent` (solid green), full width, `.headline`, icon
  `wand.and.stars`, text "Show Me the Glow Up" / "Show Me the Glow Up Plus". While working,
  the button is disabled, so it turns system gray: a default (gray) spinner + "Designing
  your yard…", and the hint "This can take up to a minute." (see `design-generating`).
- **Before/after slider:** the after image fills the box; the before image is masked to the left
  of the handle. Handle: 3 pt white line with shadow; knob: 36 pt white circle with
  `arrow.left.and.right`. "Before" tag top-left, "After" tag top-right. 16 pt corners. Starts
  at 50%. Box aspect ratio = the photo's.
- **Shop rows:** item label left; small `.bordered` "View on Amazon" `Link` right.
- **Get This Built:** `.borderedProminent`, full width, `hammer` icon, `.headline`.
- **Share:** `.bordered`, full width, `square.and.arrow.up`.
- **Lead form sheet:** a standard grouped `Form`, title "Get This Built", Cancel / bold Send;
  sections "Your details" (footer: "Add a phone number or email so the contractor can reach
  you.") and "About the project". Validation message in red footnote. Success: 64 pt green
  `checkmark.circle.fill`, "Request sent" (`.title2.bold()`), the body text, a prominent
  "Done".
- **Gallery:** two-column grid; 150 pt tall thumbnails with 12 pt corners, the plan name in
  `.subheadline.bold()`, and the date in `.caption` secondary. Empty: "No designs yet" /
  "Designs you make will show up here."
- **Tabs:** "Design" (`wand.and.stars`) and "Gallery" (`photo.on.rectangle`).

### Words on screen (keep them; they were chosen deliberately)

"Backyard Glow Up" (title) · "Show Me the Glow Up" · "Show Me the Glow Up Plus" ·
"Designing your yard…" · "Pick at least one item." / "Pick at least one upgrade." ·
"Add a photo to get started." · "Drag the slider to compare." · "Shop this look" ·
"View on Amazon" · "What's included" · "Get This Built" · "A local contractor will contact
you with a quote." · "Share" · "Request sent" · "<Company> will contact you soon to plan
your project and give you a quote." (or "A local contractor...") · "Questions? Call <phone>."

### Not designed yet

- **App icon:** none exists. Propose 2–3 options in the same palette (green on dark) and let
  the owner choose. Xcode makes every size from one 1024×1024 image.
- **Launch screen:** the generated default (`UILaunchScreen_Generation`) is in place.

---

## 5. Where things stand (as of October 17, 2026)

| Part | State |
|---|---|
| Design | Approved by the owner (section 4) |
| Server (Node) | Done and tested: **121 tests pass** (`npm test`). Not deployed yet |
| iPhone app (SwiftUI) | Written and reviewed twice, **never compiled** |
| Xcode project | `ios/project.yml` (XcodeGen) ready; no `.xcodeproj` committed |
| App icon, privacy policy, support page, AI consent screen | Not done (section 10) |
| Apple developer account, OpenAI setup, Render, Amazon links | Owner's to-do (section 9) |

**Code:** GitHub repo `Claudius-Maximus9000/Nostos`, branch `claude/adoring-shannon-fuf8tq`,
folder `backyard-glowup/`. Pull request: https://github.com/Claudius-Maximus9000/Nostos/pull/1.
This package's `backyard-glowup/` folder is that branch as of October 17, 2026 (the commit
that added `docs/START-HERE.md`). The repo name "Nostos" is a leftover; the app has nothing
to do with it.

### Getting the code onto the Mac (and back to GitHub)

1. With the owner, run `gh auth login` (they sign in to the GitHub account that owns
   `Claudius-Maximus9000/Nostos`; install the GitHub CLI with `brew install gh` if needed).
   You can't do the sign-in for them.
2. `git clone -b claude/adoring-shannon-fuf8tq https://github.com/Claudius-Maximus9000/Nostos.git`
   and work in `Nostos/backyard-glowup/`.
3. If `git log` shows commits newer than the one that added `docs/START-HERE.md`, read them.
   Where they conflict with this briefing, ask the owner.
4. Commit and push after each task. **Render deploys from the GitHub branch** chosen in its
   Blueprint, so server changes (for example Amazon links in `src/presets.js`) only reach
   customers after a push.
5. Before setting up Render, decide with the owner whether to merge PR #1 into `main` and
   deploy `main`, or deploy the branch as is. Either works; just keep it consistent.
6. If GitHub truly can't be reached, work in this zip's `backyard-glowup/` and run
   `git init` there so nothing is lost. Push it once access works.
7. Moving the app to its own repository later is fine. If you do, update the Render
   Blueprint's repository and path (`render.yaml` has `rootDir: backyard-glowup`) and the
   GitHub links in this file and in `LAUNCH.md`.

**Owner's links:** clickable preview https://claude.ai/artifact/T4R4LMvoXUZuZDhdDX3W7Y · launch
checklist (the owner ticks steps off here) https://claude.ai/artifact/R3Lb5JN5fZBLF7rcg1gVmc.
Both are private to the owner's account.

---

## 6. How it's built

```
iPhone app (SwiftUI) ──https──▶ Node server (Render) ──▶ OpenAI image edit API
                                   │  saves designs + requests on disk
                                   └─▶ Resend (emails the owner each Get This Built request)
```

- The **OpenAI key lives only on the server**, never in the app (OpenAI disables keys found
  inside apps).
- `ios/BackyardGlowUp/`: `BackyardGlowUpApp` (tabs; `.tint(.green)`), `GlowUpModel`
  (`@MainActor @Observable` state; local gallery in UserDefaults, max 50), `APIClient`
  (shrinks photos to 1536 px JPEG before upload; 180 s timeout), `Models` (Codable types that
  mirror the server JSON), `DesignView`, `ResultView` (+ `BeforeAfterSlider`),
  `LeadFormView` (+ `LeadDraft` validation), `GalleryView`, `SettingsView`, `CameraPicker`.
  iOS 17+, iPhone only.
- `src/`: zero-dependency Node 22 server. `server.js` routes, `presets.js` catalog + prompts,
  `providers.js` OpenAI (or the mock in preview mode), `store.js` disk storage + photo
  cleanup, `limits.js` daily limits, `email.js` Resend, `index.js` entry point.
- `ios/project.yml` is the **source of truth for the Xcode project** (XcodeGen).
  - Re-run `xcodegen` in `ios/` after adding or removing any file: new Swift files,
    `PrivacyInfo.xcprivacy`, `Assets.xcassets`. Otherwise they're left out of the build.
  - Put every build setting (team, bundle ID, Info.plist keys) in `project.yml`, never only
    in Xcode's settings screens; regenerating overwrites those.
  - The generated `.xcodeproj` is git-ignored.
  - After building, check that `PrivacyInfo.xcprivacy` is inside the built app.
- `render.yaml`: Render Blueprint (Starter plan, 5 GB disk at `/var/data`, `/healthz`).
- `test/`: `node:test` suites.

### API

| Method | Path | What |
|---|---|---|
| GET | `/healthz` | `{"ok":true}` |
| GET | `/api/config` | Plans (with item `url`s), styles, `previewMode`, `contractor {name, phone}` |
| POST | `/api/generate` | `{ image: "data:image/jpeg;base64,…", mode, upgrades: [ids], style }` → a design `{id, file, beforeFile, createdAt, mode, upgrades, style, preview, note, …}` |
| POST | `/api/leads` | `{ designId, name, phone, email, zip, notes }` → `201 {id, createdAt}` |
| GET | `/api/leads`, `/api/gallery` | Owner only: `Authorization: Bearer <ADMIN_TOKEN>` |
| GET | `/outputs/<file>` | A design image or its original photo |

Errors are `{"error": "<plain-language message>"}`, and the app shows that text as-is.

### Server settings

`OPENAI_API_KEY` (none = preview mode) · `OPENAI_IMAGE_MODEL` (default `gpt-image-2.5-flare`)
· `OPENAI_IMAGE_QUALITY` (`medium`) · `OPENAI_IMAGE_SIZE` (`auto`) · `OPENAI_IMAGE_FORMAT`
(`jpeg`; set `none` if the model rejects it) · `OPENAI_BASE_URL` · `AMAZON_STORE_URL` ·
`CONTRACTOR_NAME` · `CONTRACTOR_PHONE` · `ADMIN_TOKEN` · `RESEND_API_KEY` · `LEAD_EMAIL_TO` ·
`LEAD_EMAIL_FROM` · `GENERATE_LIMIT_PER_IP` (20/day) · `GENERATE_DAILY_CAP` (300/day) ·
`TRUST_PROXY` (`true` on Render) · `RETENTION_DAYS` (90) · `DATA_DIR` · `PORT` (8080).
Full table: `backyard-glowup/README.md`.

---

## 7. Rules that must not break

1. **Keep the design** (section 4): green accent only, native iOS look, dark mode as it is.
2. **OpenAI key stays on the server.**
3. **Privacy:** customers only ever see their own designs (local gallery). `/api/gallery`
   and `/api/leads` stay owner-only. Never log customer details (name, phone, email, ZIP,
   notes); log lines carry only ids.
4. **App and server validation match.** `LeadDraft.validationError` (Swift) mirrors
   `leadProblem()` (server) rule for rule and message for message, in this order:
   name required (≤100) → phone or email required → phone has ≥7 digits (≤30 chars) →
   valid email (≤200) → ZIP 3–12 characters → notes ≤1,000. Change both together.
5. **Catalog comes from the server**; don't hardcode items in Swift.
6. **Amazon buttons open outside the app** (SwiftUI `Link` → Amazon app or Safari). Amazon
   forbids showing its pages in an in-app web view.
7. **The AI changes only what was picked.** Don't make Glow Up "clean up" the whole yard.

---

## 8. Facts that shape the launch (fact-checked October 14, 2026)

- **OpenAI:** `gpt-image-1` shuts down **Oct 23, 2026**; `gpt-image-1-mini` and
  `gpt-image-1.5` on Dec 1, 2026. The server already uses `gpt-image-2.5-flare`, with
  quality set explicitly (an unset quality has come back as "low"). Unconfirmed: whether
  the model accepts `output_format=jpeg`; check with the first real call, and set
  `OPENAI_IMAGE_FORMAT=none` if it doesn't. Rough cost: about 5–6¢ per design at medium
  (an estimate; measure it).
- **Apple:**
  - Uploads must be built with **Xcode 26+** (iOS 26 SDK), which needs macOS Sequoia 15.6+.
  - The Developer Program is $99/year. Enrolling as an individual is fast; as an
    organization it needs a D-U-N-S number, a website, and email on its own domain.
  - Review usually takes 24–48 hours.
  - **Guideline 5.1.2(i)** (since Nov 2025): the app must disclose that photos go to a
    third-party AI (OpenAI) and get **explicit permission first**. This is the most likely
    rejection for this app.
  - A privacy policy is required, linked in App Store Connect *and* inside the app.
  - A `PrivacyInfo.xcprivacy` is required (UserDefaults is a "required reason" API).
  - No placeholder content (2.1), so "Link coming soon" can't ship.
  - The backend must be live during review.
  - The app must not feel like just links and a form (4.2).
  - iPhone-only apps are still tested on iPad.
  - In-app purchase isn't needed for Amazon goods or real contractor work (3.1.3(e)).
  - In-app purchase *is* needed for paid digital features (3.1.1), with US storefront exceptions.
- **Amazon (if Associates/Influencer):**
  - Links need the owner's tag.
  - The disclosure "As an Amazon Associate I earn from qualifying purchases." goes near the
    buttons.
  - Purchases through the app don't count until Amazon approves the app, which can only
    happen after it's live.
  - No Amazon prices or product photos for now.
  - **If it's the owner's own Brand Store:** no disclosure; optional Attribution tags.

Sources and detail: `backyard-glowup/LAUNCH.md`.

---

## 9. What the owner is doing (help them; don't do it for them)

From the launch checklist:
1. Answer three questions (section 11).
2. Join the Apple Developer Program.
3. Check the Mac (macOS 15.6+) and install Xcode.
4. Start you (done, if you're reading this).
5. Set up OpenAI (verify the organization, create a project and key, set a $100 hard limit,
   add $100 credit).
6. Make a Resend account.
7. Put the server on Render with your help.
8. Accept Apple's agreement and create the app in App Store Connect.
9. Publish a privacy policy and a support page (you draft them).
10. Collect Amazon links.
11. TestFlight testing.
12. The listing.
13. The review contact.
14. Submit by Nov 6.
15. Release.

---

## 10. Your task list (in this order)

1. **Build it** (section 1) and fix compile errors. Run it in the simulator against
   `npm start`. Check both plans, the slider, Get This Built, and Gallery. Compare it with
   `backyard-glowup/docs/design/backyard-preview.html` and the screenshots, and match them.
2. **AI permission screen** (Apple 5.1.2(i)). Before the first photo is sent, a sheet in the
   same design explains that the photo goes to our server and to OpenAI to make the design,
   with "Agree" and "Not now". Store the answer, offer a way to withdraw it, and link the
   privacy policy.
3. **Customer settings.** Hide the server-address screen in release builds (`#if DEBUG`).
   Make the release build's default server the production `https://` Render address. That
   address only exists after task 9, so use a clearly marked placeholder until then, and
   don't upload a release build before it's filled in. Add About & Privacy links (privacy
   policy, support, request deletion).
4. **Amazon rows.** No "Link coming soon" in the shipped app: every item gets a real link (from
   the owner), or the row shows without a button. Add the Associates disclosure line if it applies.
5. **`PrivacyInfo.xcprivacy`** declaring UserDefaults (reason `CA92.1`).
6. **App icon**: propose options in the palette; the owner chooses.
7. Optional: **Save to Photos** (needs `NSPhotoLibraryAddUsageDescription`).
8. **Test on an iPad simulator too.**
9. **Deploy the server to Render with the owner** (`render.yaml`; Blueprint path
   `backyard-glowup/render.yaml`; secrets entered in the dashboard; `TRUST_PROXY=true`). Make
   one real design and check the cost and the JPEG setting.
10. **Signing, archive, upload, TestFlight.** Set `DEVELOPMENT_TEAM` and the bundle ID in
    `project.yml` to match App Store Connect. The bundle ID can't change after the first upload.
11. **Listing:**
    - Screenshots at 1206×2622 (iPhone 17 / 17 Pro simulator), plus a larger set.
    - Description, keywords, and age rating.
    - Privacy label: photos, name, email, phone, ZIP, notes; no tracking.
    - Review notes that name OpenAI and the server, with no login needed.
    - Keep the word "Amazon" and Amazon's logo out of the app name, subtitle, keywords,
      icon, and screenshots. Use the Glow Up Plus result or the Design screen for
      screenshots, not the "View on Amazon" rows.

---

## 11. Open questions for the owner

1. **Amazon:** Associates account, Influencer storefront (`amazon.com/shop/...`), or their own
   products with a Brand Store? This decides the disclosure and link format.
2. **Business:** LLC or corporation, or a sole proprietorship? This decides individual vs.
   organization enrollment.
3. **Company name and phone** for the "Request sent" screen (`CONTRACTOR_NAME`,
   `CONTRACTOR_PHONE`).
4. **Always dark mode?** Offered; not decided.
5. **Glow Up Plus pricing:** free quote request for v1 (current), or charge? Real-world
   contractor work is paid outside Apple; charging for app features needs in-app purchase.
6. **Text messages for new requests?** Email is set up. SMS needs 1–3 weeks of carrier registration.
7. **Photo retention:** 90 days by default (designs attached to requests are kept). Older
   designs also disappear from customers' galleries.
8. **What is "Astra"?** Possibly OpenAI's GPT-6 Astra or DataStax Astra DB. Neither is needed
   for launch; the server calls OpenAI's image API directly.
9. **US only at launch?** Recommended.

---

## 12. Why things are the way they are

- **Cleanup plan removed:** the first version had "Cleanup" (mow, clear leaves, trim hedges)
  and "Glow Up" (deck, pergola). The owner redefined the plans as Glow Up (Amazon products)
  and Glow Up Plus (contractor).
- **Key on the server:** the owner pushed back ("I already have a key in another app and it
  works"). It does work, but keys in apps can be extracted and run up their bill, and OpenAI
  disables leaked keys. The owner also wants the AI on their own server later.
- **Local gallery:** once the app became customer-facing, a shared gallery would have shown
  every customer's house to everyone.
- **Glow Up doesn't tidy the yard:** the prompt changes only what was picked. An early preview
  showed a fully cleaned yard, which misrepresented the app. The Plus plan has "New sod and
  landscaping" for that.
- **Limits and spending caps:** the app has no sign-in, so the generate endpoint is public.
  Daily caps plus OpenAI's hard monthly limit stop strangers from running up the bill.
- **The preview's drawings:** the HTML preview uses illustrations so the slider can be tried
  without AI. The real app shows AI photos.
