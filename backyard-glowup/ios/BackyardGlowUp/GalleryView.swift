import SwiftUI

struct GalleryView: View {
    let model: GlowUpModel

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack {
            Group {
                if model.gallery.isEmpty {
                    ContentUnavailableView(
                        "No designs yet",
                        systemImage: "leaf",
                        description: Text("Designs you make will show up here.")
                    )
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(model.gallery) { design in
                                NavigationLink(value: design) {
                                    GalleryTile(design: design, url: model.client.imageURL(design.file))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("Gallery")
            .navigationDestination(for: Design.self) { design in
                ResultView(design: design, model: model)
            }
        }
    }
}

private struct GalleryTile: View {
    let design: Design
    let url: URL

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .failure:
                    Image(systemName: "photo").foregroundStyle(.secondary)
                default:
                    ProgressView()
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 150)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Text(design.modeLabel)
                .font(.subheadline.bold())
            if let date = design.createdDate {
                Text(date, style: .date)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
