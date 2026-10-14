import SwiftUI

@main
struct BackyardGlowUpApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .tint(.green)
        }
    }
}

struct ContentView: View {
    @State private var model = GlowUpModel()

    var body: some View {
        TabView {
            DesignView(model: model)
                .tabItem { Label("Design", systemImage: "wand.and.stars") }
            GalleryView(model: model)
                .tabItem { Label("Gallery", systemImage: "photo.on.rectangle") }
        }
        .task {
            await model.loadConfig()
        }
    }
}
