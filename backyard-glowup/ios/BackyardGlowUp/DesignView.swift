import SwiftUI
import PhotosUI

struct DesignView: View {
    @Bindable var model: GlowUpModel
    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if model.config?.previewMode == true {
                        PreviewBanner()
                    }

                    photoSection

                    if let config = model.config {
                        planSection(config)
                        upgradesSection
                        styleSection(config)
                        generateSection
                    } else if let error = model.loadError {
                        ConnectionErrorView(message: error) {
                            Task { await model.loadConfig() }
                        }
                    } else {
                        ProgressView("Connecting…")
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding()
            }
            .navigationTitle("Backyard Glow Up")
            .toolbar {
                Button {
                    showSettings = true
                } label: {
                    Label("Settings", systemImage: "gearshape")
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView(model: model)
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { image in model.photo = image }
                    .ignoresSafeArea()
            }
            .navigationDestination(item: $model.latestDesign) { design in
                ResultView(design: design, model: model)
            }
            .onChange(of: pickerItem) { _, item in
                Task { await loadPicked(item) }
            }
        }
    }

    // MARK: Sections

    private var photoSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(number: 1, title: "Your yard")

            Group {
                if let photo = model.photo {
                    Image(uiImage: photo)
                        .resizable()
                        .scaledToFill()
                } else {
                    VStack(spacing: 8) {
                        Image(systemName: "photo.badge.plus")
                            .font(.system(size: 40))
                        Text("Take or choose a photo of the backyard")
                            .font(.subheadline)
                    }
                    .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 220)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
            .clipShape(RoundedRectangle(cornerRadius: 16))

            HStack {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button {
                        showCamera = true
                    } label: {
                        Label("Take Photo", systemImage: "camera")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Label("Choose Photo", systemImage: "photo.on.rectangle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func planSection(_ config: AppConfig) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(number: 2, title: "Pick a plan")
            HStack(spacing: 12) {
                ForEach(config.modes) { mode in
                    PlanCard(
                        mode: mode,
                        icon: mode.id == "glowup" ? "sparkles" : "leaf",
                        isSelected: mode.id == model.selectedModeID
                    ) {
                        model.selectMode(mode.id)
                    }
                }
            }
        }
    }

    private var upgradesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(number: 3, title: "Upgrades")
            VStack(spacing: 0) {
                ForEach(model.selectedMode?.upgrades ?? []) { upgrade in
                    Button {
                        model.toggleUpgrade(upgrade.id)
                    } label: {
                        HStack {
                            Text(upgrade.label)
                                .foregroundStyle(.primary)
                            Spacer()
                            Image(systemName: model.selectedUpgradeIDs.contains(upgrade.id) ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(model.selectedUpgradeIDs.contains(upgrade.id) ? Color.green : Color.secondary)
                                .font(.title3)
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Divider().padding(.leading, 14)
                }
            }
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
        }
    }

    private func styleSection(_ config: AppConfig) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(number: 4, title: "Style")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    StyleChip(label: "Keep it natural", isSelected: model.selectedStyleID.isEmpty) {
                        model.selectedStyleID = ""
                    }
                    ForEach(config.styles) { style in
                        StyleChip(label: style.label, isSelected: model.selectedStyleID == style.id) {
                            model.selectedStyleID = style.id
                        }
                    }
                }
            }
        }
    }

    private var generateSection: some View {
        VStack(spacing: 10) {
            Button {
                Task { await model.generate() }
            } label: {
                HStack {
                    if model.isGenerating {
                        ProgressView().tint(.white)
                        Text("Designing your yard…")
                    } else {
                        Image(systemName: "wand.and.stars")
                        Text(model.selectedModeID == "glowup" ? "Show Me the Glow Up" : "Show Me the Cleanup")
                    }
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!model.canGenerate)

            if model.photo == nil {
                Text("Add a photo to get started.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if model.selectedUpgradeIDs.isEmpty {
                Text("Pick at least one upgrade.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if model.isGenerating {
                Text("This can take up to a minute.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let error = model.generateError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func loadPicked(_ item: PhotosPickerItem?) async {
        guard let item,
              let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else { return }
        model.photo = image
    }
}

// MARK: - Small building blocks

private struct SectionTitle: View {
    let number: Int
    let title: String

    var body: some View {
        HStack(spacing: 8) {
            Text("\(number)")
                .font(.caption.bold())
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(Circle().fill(.green))
            Text(title)
                .font(.title3.bold())
        }
    }
}

private struct PlanCard: View {
    let mode: Mode
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon)
                    .font(.title2)
                Text(mode.label)
                    .font(.headline)
                Text(mode.blurb)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSelected ? Color.green.opacity(0.15) : Color(.secondarySystemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(isSelected ? Color.green : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct StyleChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Capsule().fill(isSelected ? Color.green : Color(.secondarySystemBackground)))
                .foregroundStyle(isSelected ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }
}

private struct PreviewBanner: View {
    var body: some View {
        Label {
            Text("Preview mode: the server has no AI key yet, so results show your original photo.")
        } icon: {
            Image(systemName: "info.circle.fill")
        }
        .font(.footnote)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct ConnectionErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
            Button("Try Again", action: retry)
                .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
}
