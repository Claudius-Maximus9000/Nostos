# Launch plan: App Store in one month

Target: **submitted to Apple by Friday, November 6, 2026**, live by **about November 13**,
with a week of room for Apple to send it back once or twice. Written October 14, 2026 from
fact-checked research (sources linked below). Prices and rules change, so re-check
anything marked as an estimate before paying for it.

## The short version

1. **Join Apple's developer program this week.** It's $99 a year, and it's the step most
   likely to slow you down.
2. **Build the app on your Mac.** Open this project in Claude on your Mac (the Claude
   Desktop app, or run `claude remote-control` in a terminal in this folder). Claude there
   can use Xcode; the cloud session can't.
3. **Put the server online** with a real `https://` address (about $9 a month on Render).
4. **Add what Apple requires** for an app like this: a permission screen before photos go to
   the AI, a privacy policy, and a support page.
5. **Test with TestFlight**, then submit.

## Your to-do list

### This week (October 14-20)

- [ ] **Decide how to enroll with Apple.**
  - *As yourself (individual):* fastest, usually days. Your personal legal name shows as
    the seller on the App Store. Sole proprietors and DBAs must enroll this way.
  - *As your company:* the company name shows as the seller, but you need a registered LLC
    or corporation, a free D-U-N-S number (up to about 7 business days), a working website
    on your own domain, and an email on that domain. Apple's own verification has no set
    timeline. Only pick this if you already have all of those today.
  - Use your exact legal name on your Apple account; nicknames delay approval.
  - Enroll at [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) ($99/year).
- [ ] **Check your Mac.** Apple menu > About This Mac. You need macOS Sequoia 15.6 or newer
  to run Xcode 26, and Apple only accepts apps built with Xcode 26 or newer. Install Xcode
  from the Mac App Store.
- [ ] **Set up OpenAI for the app** (the AI that draws the yards):
  - Verify your OpenAI organization (needs a physical government ID; no screenshots).
  - Create a separate project for this app with its own API key.
  - Set a **hard monthly spending limit** (start around $100) and email alerts at 50% and 90%.
  - Prepay about $100 in credits. Accounts on the lowest level can only make a handful of
    images per minute, which a few customers at once would hit.
- [ ] **Tell Claude a few things** (see "Questions to answer" below), especially which kind
  of Amazon store you have and whether your business is an LLC.
- [ ] **Make a Render account** at [render.com](https://render.com) and connect it to your
  GitHub. Claude will walk you through putting the server online from there.

### Next week (October 21-27)

- [ ] **Accept Apple's latest agreement** in App Store Connect (Business section). Apple
  won't let you create the app until you do.
- [ ] **Create the app in App Store Connect.** Check the name "Backyard Glow Up" is free.
  The bundle ID can never change after the first upload, so pick it carefully (for example
  `com.yourcompany.backyardglowup`).
- [ ] **Publish two web pages** (Claude can write drafts): a **privacy policy** and a
  **support page** with real contact details. Both links are required.
- [ ] **Get your Amazon links** for each Glow Up product (see "Amazon" below).
- [ ] **Install TestFlight** on your iPhone and try the first build Claude uploads.

### Week 3 (October 28 - November 3)

- [ ] **Test on real yards** with friends via TestFlight (Apple does a quick one-time check
  before outside testers can join).
- [ ] **Write the App Store listing** with Claude: description, keywords, screenshots,
  privacy answers, age rating.
- [ ] **Pick the App Review contact**: a name, email, and phone number Apple can reach
  during review.

### Week 4 (November 4-6)

- [ ] **Submit.** Apple says most apps are reviewed within 24 to 48 hours. Keep the server
  running the whole time; an offline server is an automatic rejection.
- [ ] Choose **manual release** so you decide the exact day it goes live.

## What it costs

| Item | Cost |
|---|---|
| Apple Developer Program | $99 a year |
| Server on Render (Starter plan + 5 GB disk) | about $9 a month |
| AI images (OpenAI, medium quality) | **estimate** about 5 to 6 cents per design: about $55 for 1,000 designs a month, plus extra if customers redo designs. High quality is about 3 times as much. |
| Lead emails (Resend free tier) | free at launch |
| Amazon programs (Associates, Brand Store, Attribution) | free to join |

The AI estimate comes from OpenAI's published prices for the previous model. Claude should
measure the real cost per design during testing, since OpenAI reports it with each image.

## Amazon

Which rules apply depends on what "my Amazon store" means:

- **Amazon Associates or an Influencer storefront** (you earn a commission):
  - Every link must include your Associates tag (for example `yourname-20`). Untagged links
    earn nothing.
  - Show "As an Amazon Associate I earn from qualifying purchases." near the
    View on Amazon buttons.
  - Purchases through the app **don't count until Amazon approves the app**. That review
    can only happen after the app is live on the App Store, so expect little or no
    commission in the first weeks.
  - New Associates accounts need 3 sales within 180 days. Your own and family purchases
    don't count.
  - No Amazon prices or product photos in the app for now. Those need 10 sales in 30 days first.
  - An Influencer storefront also needs a qualifying Instagram, TikTok, YouTube, Pinterest,
    or Facebook account.
- **Your own products with a Brand Store** (you're the seller): no disclosure needed. Link
  straight to your products. Free Amazon Attribution tags show you which sales came from the app.

Either way, the buttons open the Amazon app or Safari (never a page inside the app), and
"Amazon" never appears in the app's name, icon, or screenshots.

## Questions to answer

1. Which Amazon store is it: Associates, an Influencer storefront, or your own products?
2. Is your business an LLC or corporation, or a sole proprietorship? Do you have a website and email on your own domain?
3. Your company name and phone number, for the "Request sent" screen.
4. How long should we keep customer photos and quote requests? (The server deletes design photos after 90 days unless they're attached to a quote request. Older designs then disappear from customers' galleries too.)
5. Is an email for each new Glow Up Plus request enough, or do you need text messages? Texts need 1 to 3 weeks of carrier registration, so we'd start that now.
6. How many free designs should one person get per day? (Starting point: 20 per internet connection per day, and 300 total per day.)
7. Should Glow Up Plus ever charge inside the app? Real contractor work can be paid outside Apple. Charging for app features (like premium AI designs) has to go through Apple, with some exceptions in the US.
8. US only at launch? (Simpler for Apple and for Amazon.)
9. What is "Astra"? If you mean OpenAI's GPT-6 Astra or a database called Astra DB, neither is needed to launch. Our server talks to OpenAI's image model directly, which is simpler and cheaper.

## Claude's to-do list

### Server (no Mac needed; started October 14)

- [x] Switch from `gpt-image-1` to `gpt-image-2.5-flare` with quality set explicitly.
  OpenAI shuts `gpt-image-1` down on **October 23, 2026**.
- [x] Limits so strangers can't run up the OpenAI bill: 20 designs per internet connection
  per day and 300 for the whole server, plus a friendly "try again later" message when
  OpenAI's spending limit is reached (that attempt doesn't count against the customer).
- [x] Email the owner each new Glow Up Plus request (Resend), with a cap of 5 requests per
  connection per day and 90 emails a day so nobody can flood the inbox.
- [x] Delete design photos after 90 days (`RETENTION_DAYS`), keeping any attached to a quote request.
- [x] Health check and a Render setup file (`render.yaml`) so the server can go online.
- [ ] Deploy to Render with the owner, set the secrets, and confirm the `https://` address
  works. When creating the Blueprint, point Render at `backyard-glowup/render.yaml`.
- [ ] Make the first real design with the OpenAI key and check the cost per design. The
  server asks for JPEG images to save disk space; if the model refuses, set
  `OPENAI_IMAGE_FORMAT=none`.
- [ ] Later, if abuse shows up: Apple App Attest, so only the real app can ask for designs.

### iPhone app (on the Mac, in this order)

1. **Build it.** `cd ios && xcodegen`, open the project, build for the simulator, and fix
   whatever the compiler finds. This code has never been compiled.
2. **AI permission screen.** Before the first photo is sent, explain that it goes to our
   server and to OpenAI to make the design, with Agree / Not now. Remember the answer and
   let people withdraw it. Apple has required this since November 2025 (guideline
   5.1.2(i)) and it's the most likely rejection for this app.
3. **Customer settings.** Hide the server-address screen in release builds. Bake in the
   production `https://` address. Add links to the privacy policy and support page, plus a
   way to request deletion.
4. **Amazon rows.** No "Link coming soon" in the shipped app: Apple rejects placeholder
   content. Every item needs a link, or the row shows without a button. Add the Associates
   disclosure line if it applies.
5. **`PrivacyInfo.xcprivacy`** declaring UserDefaults use (Apple rejects uploads without it).
6. **App icon** (one 1024x1024 image; Xcode makes the other sizes).
7. Optional: **Save to Photos** on the result screen. It needs its own permission text
   (`NSPhotoLibraryAddUsageDescription`) or the app crashes.
8. **Test on an iPad simulator too.** iPhone-only apps still run on iPad, and Apple tests them there.
9. **Archive and upload** to App Store Connect, then TestFlight.
10. **Listing materials**: screenshots at 1206x2622 (iPhone 17 / 17 Pro simulator) and a
    larger set, the privacy-label answers (photos, name, email, phone, ZIP, notes; no
    tracking), age rating, and review notes that name OpenAI and the server.

## Sources

- Apple enrollment and fees: <https://developer.apple.com/programs/enroll/>, <https://developer.apple.com/support/enrollment/>, <https://developer.apple.com/help/account/membership/D-U-N-S/>
- Xcode 26 requirement: <https://developer.apple.com/news/upcoming-requirements/>, <https://developer.apple.com/xcode/system-requirements/>
- App Review guidelines (5.1.1, 5.1.2(i) third-party AI consent, 2.1, 3.1.3(e), 4.2): <https://developer.apple.com/app-store/review/guidelines/>, <https://developer.apple.com/news/?id=ey6d8onl>
- Review times and TestFlight: <https://developer.apple.com/distribute/app-review/>, <https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/>
- Screenshots: <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/>
- Privacy manifest: <https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api>
- Amazon Associates policies: <https://affiliate-program.amazon.com/help/operating/policies>
- OpenAI model shutdowns, pricing, spend limits: <https://developers.openai.com/api/docs/deprecations>, <https://developers.openai.com/api/docs/pricing>, <https://developers.openai.com/api/docs/guides/spend-limits>
