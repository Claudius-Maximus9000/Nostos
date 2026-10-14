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
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | Image model to use |
| `OPENAI_IMAGE_SIZE` | `auto` | Output size; `auto` keeps the photo's shape |
| `AMAZON_STORE_URL` | (none) | Your Amazon storefront page. Used for any Glow Up item without its own link |
| `CONTRACTOR_NAME` | (none) | Your company name, shown after a customer sends a Glow Up Plus request |
| `CONTRACTOR_PHONE` | (none) | Your phone number, shown after a customer sends a Glow Up Plus request |
| `ADMIN_TOKEN` | (none, list is off) | Password for reading Glow Up Plus requests (see below) |
| `PORT` | `8080` | Server port |

For example:

```sh
AMAZON_STORE_URL=https://www.amazon.com/shop/yourstore \
CONTRACTOR_NAME="Your Company Name" CONTRACTOR_PHONE="555-0100" \
ADMIN_TOKEN=pick-a-long-random-password npm start
```

Generated images are saved in `data/outputs/` and Glow Up Plus requests in `data/leads/`
(both ignored by git).

## 2. Set up the app in Xcode

1. Xcode → **File → New → Project → iOS → App**.
   Product Name `BackyardGlowUp`, Interface **SwiftUI**, Language **Swift**.
2. Set the target's **Minimum Deployment** to iOS 17.0 or later.
3. Delete the template's `ContentView.swift` and `BackyardGlowUpApp.swift`.
4. Drag every file from `ios/BackyardGlowUp/` into the project navigator (this includes
   `LeadFormView.swift`, the Get This Built form). Tick **Copy items if needed** and your
   app target.
5. Target → **Info** tab → add **Privacy - Camera Usage Description** with text like
   "Take a photo of your backyard." Without this the app crashes when the camera opens.
6. Run on the simulator. It reaches the server at `http://localhost:8080` by default.

**On a real iPhone:** open Settings (gear icon) in the app and enter your Mac's address,
for example `http://192.168.1.20:8080`. The phone and Mac must be on the same Wi-Fi. If
iOS blocks the connection, add **App Transport Security Settings → Allow Local Networking
= YES** in the Info tab. A hosted server should use `https://`.

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
turned off. Customer details never go into the server log, only `[lead] new request <id>`.

## Tests

```sh
npm test
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | Plans (with product links), styles, contractor name and phone, and whether the server is in preview mode |
| POST | `/api/generate` | `{ image: "data:image/jpeg;base64,...", mode, upgrades: [...], style }` |
| GET | `/api/gallery` | Every customer's recent designs. Needs `Authorization: Bearer <ADMIN_TOKEN>` (the app keeps each customer's own designs on their phone) |
| POST | `/api/leads` | A Get This Built request: `{ designId, name, phone, email, zip, notes }` (phone or email required) |
| GET | `/api/leads` | All requests, newest first. Needs `Authorization: Bearer <ADMIN_TOKEN>` |
| GET | `/outputs/<file>` | A generated image or its original photo |
