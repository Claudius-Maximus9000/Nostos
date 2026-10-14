import Foundation

// Mirrors GET /api/config. The upgrade catalog lives on the server so new
// upgrades can be added without shipping an app update.
struct AppConfig: Decodable {
    let modes: [Mode]
    let styles: [Style]
    let previewMode: Bool
}

struct Mode: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let blurb: String
    let upgrades: [Upgrade]
    let defaultUpgrades: [String]
}

struct Upgrade: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
}

struct Style: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
}

// One generated design, as returned by POST /api/generate and GET /api/gallery.
struct Design: Decodable, Identifiable, Hashable {
    let id: String
    let file: String
    let beforeFile: String
    let createdAt: String
    let mode: String
    let upgrades: [String]
    let style: String
    let preview: Bool
    let note: String?

    var modeLabel: String { mode == "glowup" ? "Glow Up" : "Cleanup" }

    // The server writes dates with JavaScript's toISOString(), which includes milliseconds.
    var createdDate: Date? {
        try? Date(createdAt, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }
}
