import UIKit

enum APIError: LocalizedError {
    case server(String)
    case badPhoto
    case badResponse

    var errorDescription: String? {
        switch self {
        case .server(let message): return message
        case .badPhoto: return "Couldn't read that photo. Try another one."
        case .badResponse: return "Unexpected response from the server."
        }
    }
}

// Talks to the Backyard Glow Up server. The image model API key stays on the server.
struct APIClient {
    let baseURL: URL

    func fetchConfig() async throws -> AppConfig {
        try await send(URLRequest(url: baseURL.appendingPathComponent("api/config")))
    }

    func fetchGallery() async throws -> [Design] {
        struct Response: Decodable { let items: [Design] }
        let response: Response = try await send(URLRequest(url: baseURL.appendingPathComponent("api/gallery")))
        return response.items
    }

    func generate(photo: UIImage, modeID: String, upgradeIDs: [String], styleID: String) async throws -> Design {
        struct Body: Encodable {
            let image: String
            let mode: String
            let upgrades: [String]
            let style: String
        }
        guard let jpeg = photo.jpegForUpload() else { throw APIError.badPhoto }

        var request = URLRequest(url: baseURL.appendingPathComponent("api/generate"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Image models can take a minute or more, well past URLSession's 60s default.
        request.timeoutInterval = 180
        request.httpBody = try JSONEncoder().encode(Body(
            image: "data:image/jpeg;base64,\(jpeg.base64EncodedString())",
            mode: modeID,
            upgrades: upgradeIDs,
            style: styleID
        ))
        return try await send(request)
    }

    func imageURL(_ file: String) -> URL {
        baseURL.appendingPathComponent("outputs").appendingPathComponent(file)
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        struct ErrorBody: Decodable { let error: String }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = try? JSONDecoder().decode(ErrorBody.self, from: data).error
            throw APIError.server(message ?? "Server error (\(http.statusCode)).")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

extension UIImage {
    // Phone photos are often 12+ MP. Shrinking to ~1536px keeps uploads fast and well
    // under the server's size limit, and drawing the image bakes in its rotation so the
    // model never sees a sideways yard.
    func jpegForUpload(maxDimension: CGFloat = 1536) -> Data? {
        let longest = max(size.width, size.height)
        guard longest > 0 else { return nil }
        let scale = min(1, maxDimension / longest)
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: 0.8)
    }
}
