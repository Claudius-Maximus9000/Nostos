import SwiftUI

struct ResultView: View {
    let design: Design
    let model: GlowUpModel

    @State private var before: UIImage?
    @State private var after: UIImage?
    @State private var loadFailed = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let before, let after {
                    BeforeAfterSlider(before: before, after: after)
                    Text("Drag the slider to compare.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                } else if loadFailed {
                    ContentUnavailableView("Couldn't load this design", systemImage: "photo.badge.exclamationmark")
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 260)
                }

                if design.preview, let note = design.note {
                    Label(note, systemImage: "info.circle")
                        .font(.footnote)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.orange.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("What's included")
                        .font(.headline)
                    ForEach(upgradeLabels, id: \.self) { label in
                        Label(label, systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.primary)
                    }
                    if let style = styleLabel {
                        Label("\(style) style", systemImage: "paintpalette")
                            .foregroundStyle(.secondary)
                    }
                }

                if let after {
                    let image = Image(uiImage: after)
                    ShareLink(item: image, preview: SharePreview("Backyard \(design.modeLabel)", image: image)) {
                        Label("Share with Customer", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding()
        }
        .navigationTitle(design.modeLabel)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: design.id) {
            let client = model.client
            before = await Self.loadImage(client.imageURL(design.beforeFile))
            after = await Self.loadImage(client.imageURL(design.file))
            loadFailed = before == nil || after == nil
        }
    }

    private var upgradeLabels: [String] {
        guard let mode = model.config?.modes.first(where: { $0.id == design.mode }) else { return design.upgrades }
        return mode.upgrades.filter { design.upgrades.contains($0.id) }.map(\.label)
    }

    private var styleLabel: String? {
        model.config?.styles.first { $0.id == design.style }?.label
    }

    private static func loadImage(_ url: URL) async -> UIImage? {
        guard let result = try? await URLSession.shared.data(from: url),
              (result.1 as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return UIImage(data: result.0)
    }
}

// Shows the original photo on the left of the handle and the redesign on the right.
struct BeforeAfterSlider: View {
    let before: UIImage
    let after: UIImage
    @State private var split: CGFloat = 0.5

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let height = geo.size.height

            ZStack(alignment: .leading) {
                Image(uiImage: after)
                    .resizable()
                    .scaledToFill()
                    .frame(width: width, height: height)
                    .clipped()

                Image(uiImage: before)
                    .resizable()
                    .scaledToFill()
                    .frame(width: width, height: height)
                    .clipped()
                    .mask(alignment: .leading) {
                        Rectangle().frame(width: width * split)
                    }

                Rectangle()
                    .fill(.white)
                    .frame(width: 3)
                    .shadow(radius: 2)
                    .offset(x: width * split - 1.5)

                Circle()
                    .fill(.white)
                    .frame(width: 36, height: 36)
                    .overlay(
                        Image(systemName: "arrow.left.and.right")
                            .font(.caption.bold())
                            .foregroundStyle(.black)
                    )
                    .shadow(radius: 3)
                    .offset(x: width * split - 18)
            }
            .overlay(alignment: .topLeading) { Tag(text: "Before") }
            .overlay(alignment: .topTrailing) { Tag(text: "After") }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0).onChanged { value in
                    split = min(max(value.location.x / width, 0), 1)
                }
            )
        }
        .aspectRatio(before.size.width / max(before.size.height, 1), contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private struct Tag: View {
        let text: String

        var body: some View {
            Text(text)
                .font(.caption.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(.black.opacity(0.55), in: Capsule())
                .foregroundStyle(.white)
                .padding(10)
        }
    }
}
