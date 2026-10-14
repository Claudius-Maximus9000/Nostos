import SwiftUI
import Observation

@MainActor
@Observable
final class GlowUpModel {
    static let defaultServerURL = "http://localhost:8080"
    private static let serverURLKey = "serverURL"

    // Server
    private(set) var serverURLString: String
    private(set) var config: AppConfig?
    private(set) var loadError: String?

    // What the user is designing
    var photo: UIImage?
    private(set) var selectedModeID = "cleanup"
    var selectedUpgradeIDs: Set<String> = []
    var selectedStyleID = ""

    // Results
    private(set) var isGenerating = false
    var generateError: String?
    var latestDesign: Design?
    private(set) var gallery: [Design] = []

    init() {
        serverURLString = UserDefaults.standard.string(forKey: Self.serverURLKey) ?? Self.defaultServerURL
    }

    var client: APIClient {
        APIClient(baseURL: URL(string: serverURLString) ?? URL(string: Self.defaultServerURL)!)
    }

    var selectedMode: Mode? {
        config?.modes.first { $0.id == selectedModeID }
    }

    var canGenerate: Bool {
        photo != nil && !selectedUpgradeIDs.isEmpty && !isGenerating
    }

    func updateServerURL(_ value: String) async {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        serverURLString = trimmed.isEmpty ? Self.defaultServerURL : trimmed
        UserDefaults.standard.set(serverURLString, forKey: Self.serverURLKey)
        await loadConfig()
        await loadGallery()
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

    func loadGallery() async {
        // The gallery is a nice-to-have; a failure here shouldn't block designing.
        gallery = (try? await client.fetchGallery()) ?? gallery
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
        } catch {
            generateError = error.localizedDescription
        }
    }
}
