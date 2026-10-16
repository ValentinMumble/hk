import Foundation

/// The HK agent's HTTP API: every request carries the bearer token, bodies are JSON.
struct Agent: Sendable {
    let baseURL: URL
    let token: String

    struct Failure: LocalizedError {
        let errorDescription: String?
    }

    func get<Value: Decodable & Sendable>(_ path: String) async throws -> Value {
        try JSONDecoder().decode(Value.self, from: try await send("GET", path, body: nil))
    }

    func post(_ path: String, _ body: Data = Data("{}".utf8)) async throws {
        _ = try await send("POST", path, body: body)
    }

    private func send(_ method: String, _ path: String, body: Data?) async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: path), timeoutInterval: 15)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        guard status < 400 else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw Failure(errorDescription: message ?? "HTTP \(status)")
        }

        return data
    }
}

/// A JSON body from a few plain values.
func json(_ values: [String: Any]) -> Data {
    (try? JSONSerialization.data(withJSONObject: values)) ?? Data("{}".utf8)
}

/// What the panel shows of the Spotify playback. The agent sends more; the rest is ignored.
struct PlaybackState: Decodable, Sendable {
    struct Device: Decodable, Sendable {
        let id: String
        let name: String
        let volume: Int
    }

    struct Track: Decodable, Sendable {
        let id: String
        let name: String
        let artists: String
        /// Album cover, about 300 px.
        let artwork: String?
        var saved: Bool
    }

    var isPlaying: Bool
    /// Where the song was when the agent read it.
    let progressMs: Int
    let device: Device?
    var track: Track?
}

/// The playing song's lyrics. `synced` holds time-coded lines when LRCLIB has them for this recording.
struct LyricsResult: Decodable, Sendable {
    struct Line: Decodable, Sendable {
        let timeMs: Int
        let text: String
    }

    let trackId: String?
    let source: String
    let url: String
    let lyrics: String
    let synced: [Line]?
    let instrumental: Bool
}

/// The agent's info: only the amp's inputs are needed here.
struct AgentInfo: Decodable, Sendable {
    let sources: [String]
}

struct HueScene: Decodable, Sendable, Identifiable {
    let id: String
    let name: String
    let room: String?
}

/// The setup link the web app uses (`https://hk.vumble.dev/#agent=…&token=…`), so pasting it fills both fields.
struct SetupLink {
    let agent: String
    let token: String

    init?(_ text: String) {
        guard let fragment = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines))?.fragment,
            let items = URLComponents(string: "?\(fragment)")?.queryItems,
            let agent = items.first(where: { $0.name == "agent" })?.value,
            let token = items.first(where: { $0.name == "token" })?.value
        else { return nil }

        self.agent = agent
        self.token = token
    }
}
