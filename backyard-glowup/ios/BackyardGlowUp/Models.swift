import Foundation

// Mirrors GET /api/config. The plan catalog lives on the server so new
// items can be added without shipping an app update.
struct AppConfig: Decodable {
    let modes: [Mode]
    let styles: [Style]
    let previewMode: Bool
    let contractor: Contractor?
}

// Who builds Glow Up Plus projects. The server sends null for anything it isn't set up with.
struct Contractor: Decodable, Hashable {
    let name: String?
    let phone: String?
}

struct Mode: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String
    let label: String
    let blurb: String
    let upgrades: [Upgrade]
    let defaultUpgrades: [String]

    // "shop" plans are Amazon products the customer buys; "contractor" plans are built for them.
    var isShop: Bool { kind == "shop" }
}

struct Upgrade: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let url: String?

    // Where to buy a shop item. Nil for contractor items and products without a link yet.
    var shopURL: URL? { url.flatMap { URL(string: $0) } }
}

struct Style: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
}

// One generated design, as returned by POST /api/generate. The app saves the ones
// made on this phone so the Gallery only ever shows the customer's own yard.
struct Design: Codable, Identifiable, Hashable {
    let id: String
    let file: String
    let beforeFile: String
    let createdAt: String
    let mode: String
    let upgrades: [String]
    let style: String
    let preview: Bool
    let note: String?

    var modeLabel: String { mode == "glowupplus" ? "Glow Up Plus" : "Glow Up" }

    // The server writes dates with JavaScript's toISOString(), which includes milliseconds.
    var createdDate: Date? {
        try? Date(createdAt, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }
}

// Returned by POST /api/leads once a "Get This Built" request is saved.
struct LeadReceipt: Decodable {
    let id: String
    let createdAt: String
}
