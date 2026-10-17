import SwiftUI
import Observation

@MainActor
@Observable
final class GlowUpModel {
    static let defaultServerURL = "http://localhost:8080"
    private static let serverURLKey = "serverURL"
    private static let galleryKey = "gallery"
    private static let galleryLimit = 50

    // Server
    private(set) var serverURLString: String
    private(set) var config: AppConfig?
    private(set) var loadError: String?

    // What the user is designing
    var photo: UIImage?
    private(set) var selectedModeID = "glowup"
    var selectedUpgradeIDs: Set<String> = []
    var selectedStyleID = ""

    // Results
    private(set) var isGenerating = false
    var generateError: String?
    var latestDesign: Design?
    private(set) var gallery: [Design] = []

    init() {
        serverURLString = UserDefaults.standard.string(forKey: Self.serverURLKey) ?? Self.defaultServerURL
        gallery = Self.savedGallery()
    }

    var client: APIClient {
        APIClient(baseURL: URL(string: serverURLString) ?? URL(string: Self.defaultServerURL)!)
    }

    var selectedMode: Mode? {
        mode(id: selectedModeID)
    }

    // Who to name on the "Get This Built" screens. Nil when the server isn't set up with one.
    var contractorName: String? { nonEmpty(config?.contractor?.name) }
    var contractorPhone: String? { nonEmpty(config?.contractor?.phone) }

    func mode(id: String) -> Mode? {
        config?.modes.first { $0.id == id }
    }

    var canGenerate: Bool {
        photo != nil && !selectedUpgradeIDs.isEmpty && !isGenerating
    }

    func updateServerURL(_ value: String) async {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        serverURLString = trimmed.isEmpty ? Self.defaultServerURL : trimmed
        UserDefaults.standard.set(serverURLString, forKey: Self.serverURLKey)
        await loadConfig()
    }

    func loadConfig() async {
        loadError = nil
        do {
            config = try await client.fetchConfig()
            selectMode(selectedModeID)
        } catch {
            config = nil
            loadError = "Can't reach the server at \(serverURLString). Check that it's running, or change the address in Settings."
        }
    }

    // Switching plans resets upgrades to that plan's suggested starting set.
    func selectMode(_ id: String) {
        selectedModeID = id
        selectedUpgradeIDs = Set(selectedMode?.defaultUpgrades ?? [])
    }

    func toggleUpgrade(_ id: String) {
        if selectedUpgradeIDs.contains(id) {
            selectedUpgradeIDs.remove(id)
        } else {
            selectedUpgradeIDs.insert(id)
        }
    }

    func generate() async {
        guard let photo, canGenerate else { return }
        isGenerating = true
        generateError = nil
        defer { isGenerating = false }

        do {
            let design = try await client.generate(
                photo: photo,
                modeID: selectedModeID,
                upgradeIDs: Array(selectedUpgradeIDs).sorted(),
                styleID: selectedStyleID
            )
            latestDesign = design
            gallery.insert(design, at: 0)
            saveGallery()
        } catch {
            generateError = error.localizedDescription
        }
    }

    // The Gallery lives on the phone, not the server, so customers never see each other's yards.
    private static func savedGallery() -> [Design] {
        guard let data = UserDefaults.standard.data(forKey: galleryKey),
              let designs = try? JSONDecoder().decode([Design].self, from: data) else { return [] }
        return designs
    }

    private func saveGallery() {
        gallery = Array(gallery.prefix(Self.galleryLimit))
        if let data = try? JSONEncoder().encode(gallery) {
            UserDefaults.standard.set(data, forKey: Self.galleryKey)
        }
    }

    private func nonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
