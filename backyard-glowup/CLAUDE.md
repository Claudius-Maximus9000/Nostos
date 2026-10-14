# Backyard Glow Up

An iPhone app for a backyard contracting company. A homeowner photographs their backyard,
picks a plan, and sees an AI redesign of their own yard with a before/after slider.

- **Glow Up** (`glowup`, kind `shop`): the AI adds outdoor products to the photo. Each
  product links to the owner's Amazon store ("View on Amazon" on the result screen).
- **Glow Up Plus** (`glowupplus`, kind `contractor`): a full makeover the owner's company
  builds. The result screen has "Get This Built", a quote-request form (`LeadFormView`)
  that posts to `/api/leads`.

The owner is not a developer. Explain things in plain language and keep them in the loop
on anything they need to do themselves (Apple account, App Store Connect, keys, links).

## Layout

- `ios/BackyardGlowUp/`: SwiftUI app, iOS 17+. `GlowUpModel` is the `@MainActor @Observable`
  state; views are `DesignView`, `ResultView`, `LeadFormView`, `GalleryView`, `SettingsView`.
- `ios/project.yml`: XcodeGen spec. Run `xcodegen` in `ios/` to create the Xcode project.
- `src/`: zero-dependency Node 22 server. `presets.js` is the plan/product catalog and prompt
  builder and the source of truth for plan ids, item ids, labels, and defaults.
  `server.js` routes, `store.js` disk storage, `providers.js` image models (mock or
  OpenAI-compatible).
- `test/`: `node:test` suites. Run `npm test` from this folder.
- `LAUNCH.md`: the plan for getting to the App Store, and what the owner has to do.

## Status

- **The Swift code has never been compiled.** It was written and reviewed in a Linux
  environment without Xcode. The first job on a Mac is to generate the project, build for
  the simulator, and fix whatever the compiler finds:
  ```sh
  cd ios && xcodegen
  xcodebuild -project BackyardGlowUp.xcodeproj -scheme BackyardGlowUp \
    -destination 'platform=iOS Simulator,name=iPhone 16' build
  ```
  (Pick any installed simulator; `xcrun simctl list devices available` lists them.)
- The server is tested (`npm test`). Run it with `npm start`; with no `OPENAI_API_KEY` it is
  in preview mode and returns the original photo, so the whole app flow works for free.
- There is no app icon or asset catalog yet.

## Decisions to keep

- **Color and look:** the owner loves the green tint (`.tint(.green)` at the app root) and
  the dark look. Do not introduce another accent color. The app follows the phone's
  light/dark setting; the owner has been offered "always dark" but has not decided.
- **The OpenAI key stays on the server**, never in the app.
- **Privacy:** customers only see their own designs. The Gallery is saved on the phone
  (UserDefaults); `GET /api/gallery` and `GET /api/leads` are owner-only behind
  `ADMIN_TOKEN`. Customer details are never written to logs.
- **Server and app validation must match.** `LeadDraft.validationError` in
  `LeadFormView.swift` mirrors `leadProblem()` in `server.js`, rule for rule and message
  for message. Change both together.
- **Copy:** button and screen text is deliberate (for example "Show Me the Glow Up",
  "Shop this look", "View on Amazon", "Link coming soon", "Get This Built",
  "Request sent"). Keep wording consistent between the app and the server's messages.
- Plans, items, and styles come from the server (`/api/config`), so the catalog can change
  without an app update. Don't hardcode catalog data in Swift.
