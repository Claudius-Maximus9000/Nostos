import SwiftUI

struct SettingsView: View {
    let model: GlowUpModel
    @Environment(\.dismiss) private var dismiss
    @State private var draftURL = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://localhost:8080", text: $draftURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Server address")
                } footer: {
                    Text("Simulator: http://localhost:8080. On a real iPhone, use your Mac's network address, like http://192.168.1.20:8080, or your hosted server's address.")
                }

                Section("Status") {
                    if model.config == nil {
                        Label("Not connected", systemImage: "xmark.circle")
                            .foregroundStyle(.red)
                    } else if model.config?.previewMode == true {
                        Label("Connected, preview mode (no AI key on server)", systemImage: "info.circle")
                            .foregroundStyle(.orange)
                    } else {
                        Label("Connected, AI image generation on", systemImage: "checkmark.circle")
                            .foregroundStyle(.green)
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await model.updateServerURL(draftURL)
                            dismiss()
                        }
                    }
                }
            }
            .onAppear { draftURL = model.serverURLString }
        }
    }
}
