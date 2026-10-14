# Backyard Glow Up

Homeowners snap a photo of their backyard, pick a plan, and see what it could look like.

- **Glow Up**: products from your Amazon store (string lights, patio set, rug, umbrella,
  planters, fire pit bowl, path lights, hammock), placed right into their yard. The result
  lists each product with a **View on Amazon** button.
- **Glow Up Plus**: a full transformation your company builds (new sod and landscaping,
  deck, pergola, fire pit, privacy fence, outdoor kitchen, plunge pool). The result has a
  **Get This Built** button that sends you a request with their name, contact details, ZIP
  code, and the design they made.

Results show as a before/after slider and can be shared with family.

There are two parts:

| Folder | What it is |
|---|---|
| `ios/BackyardGlowUp/` | The iPhone app (SwiftUI, iOS 17+). Open in Xcode. |
| `src/` | A small server the app talks to. It holds the AI key, the item lists, and the requests customers send. |

The AI key lives on the server rather than inside the app, because anything shipped in an
app can be pulled out of it. This also means you can change the item lists, product links,
and prompts without an App Store update.

## 1. Start the server

Needs Node.js 18 or newer. There is nothing to install.

```sh
npm start
```

With no key set it runs in **preview mode**: the whole app works, but results show the
original photo. To turn on real AI images:

```sh
OPENAI_API_KEY=sk-... npm start
```

| Setting | Default | What it does |
|---|---|---|
| `OPENAI_API_KEY` | (none, preview mode) | Turns on AI image generation |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Point at your own OpenAI-compatible server later |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-flare` | Image model to use. `gpt-image-2` is the backup choice. Don't use `gpt-image-1` (shuts down Oct 23, 2026), `gpt-image-1-mini`, or `gpt-image-1.5` (both shut down Dec 1, 2026) |
| `OPENAI_IMAGE_QUALITY` | `medium` | `low`, `medium`, or `high`. High costs about 3 times as much per design |
| `OPENAI_IMAGE_SIZE` | `auto` | Output size; `auto` keeps the photo's shape |
| `OPENAI_IMAGE_FORMAT` | `jpeg` | Image format to ask the model for (JPEG keeps files small). Set `none` if a model rejects the setting |
| `AMAZON_STORE_URL` | (none) | Your Amazon storefront page. Used for any Glow Up item without its own link |
| `CONTRACTOR_NAME` | (none) | Your company name, shown after a customer sends a Glow Up Plus request |
| `CONTRACTOR_PHONE` | (none) | Your phone number, shown after a customer sends a Glow Up Plus request |
| `ADMIN_TOKEN` | (none, list is off) | Password for reading Glow Up Plus requests (see below) |
| `RESEND_API_KEY` | (none, no emails) | Your Resend key, for emailing you each Glow Up Plus request (see below) |
| `LEAD_EMAIL_TO` | (none, no emails) | Where those emails go. Separate several addresses with commas |
| `LEAD_EMAIL_FROM` | `Backyard Glow Up <onboarding@resend.dev>` | Who the emails come from. Change it once your own domain is verified in Resend |
| `GENERATE_LIMIT_PER_IP` | `20` | Designs one internet address can make per day |
| `GENERATE_DAILY_CAP` | `300` | Designs the whole server will make per day, a ceiling on your OpenAI bill. `0` pauses new designs |
| `TRUST_PROXY` | (off) | Set to `true` when a host's proxy sits in front of the server (Render does), so each customer's own address is counted |
| `RETENTION_DAYS` | `90` | Designs and photos older than this are deleted, except ones a Glow Up Plus request points at. `0` keeps everything. Anything that isn't a number of days (like `90 days`) is ignored with a warning in the log, and 90 is used |
| `DATA_DIR` | `data` (next to `src`) | Where designs and requests are saved. On a host, point it at the permanent disk |
| `PORT` | `8080` | Server port |

For example:

```sh
AMAZON_STORE_URL=https://www.amazon.com/shop/yourstore \
CONTRACTOR_NAME="Your Company Name" CONTRACTOR_PHONE="555-0100" \
ADMIN_TOKEN=pick-a-long-random-password npm start
```

Generated images are saved in `data/outputs/` and Glow Up Plus requests in `data/leads/`
(both ignored by git). Set `DATA_DIR` to save them somewhere else.

## 2. Set up the app in Xcode

Quickest way, on a Mac with Xcode 16 or newer:

```sh
brew install xcodegen
cd ios && xcodegen
open BackyardGlowUp.xcodeproj
```

`ios/project.yml` already sets the iOS 17 minimum, the camera permission text, and the
app name. Set your Apple team under **Signing & Capabilities** (or `DEVELOPMENT_TEAM` in
`project.yml`) before running on a real iPhone.

Or by hand, without XcodeGen:

1. Xcode → **File → New → Project → iOS → App**.
   Product Name `BackyardGlowUp`, Interface **SwiftUI**, Language **Swift**.
2. Set the target's **Minimum Deployment** to iOS 17.0 or later.
3. Delete the template's `ContentView.swift` and `BackyardGlowUpApp.swift`.
4. Drag every file from `ios/BackyardGlowUp/` into the project navigator (this includes
   `LeadFormView.swift`, the Get This Built form). Leave **Copy items if needed** unticked
   so the project uses the files in this repository, and tick your app target.
5. Target → **Info** tab → add **Privacy - Camera Usage Description** with text like
   "Take a photo of your backyard." Without this the app crashes when the camera opens.
6. Run on the simulator. It reaches the server at `http://localhost:8080` by default.

**On a real iPhone:** open Settings (gear icon) in the app and enter your Mac's address,
for example `http://192.168.1.20:8080`. The phone and Mac must be on the same Wi-Fi. If
iOS blocks the connection, add **App Transport Security Settings → Allow Local Networking
= YES** in the Info tab. A hosted server should use `https://` (see Going live below).

## Changing items and styles

Edit `src/presets.js`. Each item has a label (shown in the app) and a prompt phrase
(sent to the image model). Restart the server and the app picks up the changes.

## Adding your Amazon product links

In `src/presets.js`, each Glow Up item has a `url` field. Paste the product's Amazon link
there:

```js
{ id: 'lights', label: 'Outdoor string lights', prompt: '...', url: 'https://www.amazon.com/dp/B0XXXXXXXX' },
```

An item with no link of its own uses `AMAZON_STORE_URL` (your storefront page) instead.
If neither is set, the app shows "Link coming soon" for that item. Glow Up Plus items
never have links, since you build those yourself.

## Seeing Glow Up Plus requests

Each request is saved as its own file in `data/leads/`. To get them all, newest first,
start the server with `ADMIN_TOKEN` set and ask for them with that token:

```sh
curl -H "Authorization: Bearer pick-a-long-random-password" http://localhost:8080/api/leads
```

Each request comes with a summary of the design the customer made; open
`http://localhost:8080/outputs/<file>` to see it. The same token also unlocks
`/api/gallery`, every customer's recent designs. Customers only ever see their own
designs: the app saves those on their phone. Without `ADMIN_TOKEN` this list is
turned off. Customer details never go into the server log, only request ids like
`[lead] new request <id>`.

## Getting an email for each request

Each Glow Up Plus request can be emailed to you the moment it arrives, so it never lives
only on the server. This uses [Resend](https://resend.com), which is free at this size:

1. Sign up at resend.com with the email address you want requests sent to.
2. Create an API key. Set it as `RESEND_API_KEY`, and set `LEAD_EMAIL_TO` to the address
   you signed up with.
3. That's it. Until you verify your own domain in Resend, emails come from
   `onboarding@resend.dev` and can only go to your own Resend address. Once a domain is
   verified, set `LEAD_EMAIL_FROM` to something like `Your Company <leads@yourcompany.com>`
   and `LEAD_EMAIL_TO` can be any address.

The email has the customer's name, phone, email, ZIP code, and notes, plus the plan,
items, and style they picked and the design's id and picture path (put your server
address in front of the path to see it). Turn on Mail notifications on your iPhone and it
feels like a text. If either setting is missing, no email is sent and requests are still
saved. The server log only ever says `[lead] email sent <id>` or
`[lead] email failed <id> <reason>`, never the customer's details.

Like designs, requests have daily limits, because anyone could send them, not just the
app. Each internet address can send 5 requests a day; after that the app shows "You've
sent a lot of requests today. Please try again tomorrow." At most 90 emails go out a day,
which keeps you under Resend's free plan (100 a day). Requests past that are still saved
(you can read them as shown above), and the log says `[lead] email skipped <id>`.

If the server ever can't save a request (for example, its disk is full), it emails it
anyway and the email says it is the only copy. The customer is told it was sent only if
that email went out.

## Daily limits

The app has no sign-in, so the server limits how many designs get made. This keeps a
stranger from running up your OpenAI bill:

- Each internet address gets 20 designs a day (`GENERATE_LIMIT_PER_IP`). After that the
  app shows "You've made a lot of designs today. Please come back tomorrow."
- The whole server makes at most 300 designs a day (`GENERATE_DAILY_CAP`). After that,
  and whenever OpenAI says you're over its rate limit or your monthly spend limit, the
  app shows "We're getting a lot of requests right now. Please try again in a few
  minutes."
- Days start at midnight UTC (late afternoon or evening in the US).
- Only real attempts count. A photo or plan the server turns away doesn't use one up,
  and neither does a design OpenAI turns away because of its rate limit or your spend
  limit (OpenAI charges nothing for those).
- The counts are kept in memory, so restarting the server (every deploy restarts it)
  starts them over.
- On a host like Render, set `TRUST_PROXY=true` (`render.yaml` already does). Otherwise
  every customer looks like the same address and they all share one allowance. Don't set
  it when the server is reached directly, because then anyone could claim any address.
  Even behind Render, a determined person can fake their address, which is why the daily
  total and OpenAI's spend limit are there too.

## Photo cleanup

Customers' photos and designs are deleted after 90 days (`RETENTION_DAYS`): the design,
the original photo, and its record. The server checks when it starts and every 12 hours
after. Designs a Glow Up Plus request points at are kept so you can quote the job, and
requests themselves are never deleted. Customers' Galleries on their phones load
pictures from the server, so designs older than 90 days stop showing there. Set
`RETENTION_DAYS=0` to keep everything. A typo such as `90 days` doesn't turn cleanup off:
the server keeps deleting after 90 days and warns about the setting in its log.

Designs are saved as JPEG pictures. By our estimate a design and its original photo take
about 1 to 2 MB together, so the 5 GB disk holds roughly 3,000 designs: about 30 a day,
every day, with 90-day cleanup. Check the disk's usage in Render after the first few
weeks. If it's filling up, make the disk bigger on the service's **Disks** page (about 25
cents per GB a month; a disk can grow but never shrink) or set a shorter `RETENTION_DAYS`.

## Going live (Render)

The iPhone app needs the server on the internet at an `https://` address.
`render.yaml` sets this up on [Render](https://render.com): the Starter plan plus a 5 GB
disk for designs and requests, about $8 to $9 a month.

1. Make sure this repository is on GitHub, then create a Render account.
2. In Render, choose **New > Blueprint**, connect GitHub, and pick this repository and
   the branch to run. Set the Blueprint path to `backyard-glowup/render.yaml`, since the
   app is in this folder rather than at the top of the repository.
3. Render asks for the secret settings: `OPENAI_API_KEY`, `ADMIN_TOKEN` (make up a long
   random password), `RESEND_API_KEY`, `LEAD_EMAIL_TO`, `AMAZON_STORE_URL`,
   `CONTRACTOR_NAME`, and `CONTRACTOR_PHONE`. Any you don't have yet can be left blank
   and added later on the service's **Environment** page.
4. Click **Apply**. When the first deploy finishes, Render shows the server's address,
   like `https://backyard-glowup.onrender.com`. Open that address with `/healthz` on
   the end; it should say `{"ok":true}`.
5. Enter the address in the app's Settings. Before the App Store release, the app's
   built-in address (`defaultServerURL` in `GlowUpModel.swift`, now
   `http://localhost:8080`) needs to change to it too.
6. In the OpenAI dashboard, give this app its own project and API key, and set a monthly
   budget for that project with **Enforce a hard limit** turned on (around $100 is a
   good start), plus alerts at 50% and 90%. If the limit is hit, customers see the "lot
   of requests" message until the month rolls over or you raise it.

Every push to that branch deploys again. Because of the disk there are a few seconds of
downtime per deploy, and the daily limits start over.

## Tests

```sh
npm test
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | `{"ok":true}`, for the host's health check |
| GET | `/api/config` | Plans (with product links), styles, contractor name and phone, and whether the server is in preview mode |
| POST | `/api/generate` | `{ image: "data:image/jpeg;base64,...", mode, upgrades: [...], style }`. Subject to the daily limits |
| GET | `/api/gallery` | Every customer's recent designs. Needs `Authorization: Bearer <ADMIN_TOKEN>` (the app keeps each customer's own designs on their phone) |
| POST | `/api/leads` | A Get This Built request: `{ designId, name, phone, email, zip, notes }` (phone or email required). 5 per address per day |
| GET | `/api/leads` | All requests, newest first. Needs `Authorization: Bearer <ADMIN_TOKEN>` |
| GET | `/outputs/<file>` | A generated image or its original photo |
