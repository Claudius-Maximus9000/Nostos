# Backyard Glow Up

Snap a photo of a backyard, pick a plan, and see what it could look like.

- **Cleanup**: small upgrades (mow, clear debris, trim hedges, mulch, string lights).
- **Glow Up**: a full transformation (new deck, pergola, fire pit, outdoor kitchen, plunge pool).

Results show as a before/after slider and can be shared straight to a customer.

There are two parts:

| Folder | What it is |
|---|---|
| `ios/BackyardGlowUp/` | The iPhone app (SwiftUI, iOS 17+). Open in Xcode. |
| `src/` | A small server the app talks to. It holds the AI key and the upgrade list. |

The AI key lives on the server rather than inside the app, because anything shipped in an
app can be pulled out of it. This also means you can change the upgrade list and prompts
without an App Store update.

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
| `PORT` | `8080` | Server port |

Generated images are saved in `data/outputs/` (ignored by git).

## 2. Set up the app in Xcode

1. Xcode → **File → New → Project → iOS → App**.
   Product Name `BackyardGlowUp`, Interface **SwiftUI**, Language **Swift**.
2. Set the target's **Minimum Deployment** to iOS 17.0 or later.
3. Delete the template's `ContentView.swift` and `BackyardGlowUpApp.swift`.
4. Drag every file from `ios/BackyardGlowUp/` into the project navigator.
   Tick **Copy items if needed** and your app target.
5. Target → **Info** tab → add **Privacy - Camera Usage Description** with text like
   "Take a photo of your backyard." Without this the app crashes when the camera opens.
6. Run on the simulator. It reaches the server at `http://localhost:8080` by default.

**On a real iPhone:** open Settings (gear icon) in the app and enter your Mac's address,
for example `http://192.168.1.20:8080`. The phone and Mac must be on the same Wi-Fi. If
iOS blocks the connection, add **App Transport Security Settings → Allow Local Networking
= YES** in the Info tab. A hosted server should use `https://`.

## Changing upgrades and styles

Edit `src/presets.js`. Each upgrade has a label (shown in the app) and a prompt phrase
(sent to the image model). Restart the server and the app picks up the changes.

## Tests

```sh
npm test
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | Plans, upgrades, styles, and whether the server is in preview mode |
| POST | `/api/generate` | `{ image: "data:image/jpeg;base64,...", mode, upgrades: [...], style }` |
| GET | `/api/gallery` | Recent designs |
| GET | `/outputs/<file>` | A generated image or its original photo |
