import Foundation
import Observation

/// Everything the panel shows and does. Nothing runs in the background: the playback is read when the panel opens,
/// the amp inputs and Hue scenes when the app starts or the settings change, and the rest only on a click.
@MainActor
@Observable
final class Store {
    private(set) var agentURL = UserDefaults.standard.string(forKey: "agentURL") ?? ""
    private var token = Keychain.token()

    var playback: PlaybackState?
    /// When the playback was read, to follow the song between reads.
    private(set) var playbackReadAt = Date()
    private(set) var lyrics: LyricsResult?
    private(set) var lyricsError: String?
    var volume = 50.0
    var sources: [String] = []
    var scenes: [HueScene] = []
    /// The last error, cleared by the next success.
    var message: String?
    var isEditingSettings = false

    init() {
        Task { await loadLists() }
    }

    private var agent: Agent? {
        guard let url = URL(string: agentURL), url.scheme?.hasPrefix("http") == true, let token, !token.isEmpty else {
            return nil
        }

        return Agent(baseURL: url, token: token)
    }

    var isConfigured: Bool { agent != nil }

    // MARK: Reads

    func panelOpened() {
        Task {
            await refreshPlayback()
            if sources.isEmpty || scenes.isEmpty { await loadLists() }
        }
    }

    func refreshPlayback() async {
        guard let agent else { return }

        do {
            let state: PlaybackState = try await agent.get("/spotify/state")
            playback = state
            playbackReadAt = Date()
            if let device = state.device { volume = Double(device.volume) }
            message = nil

            // Lyrics are read again only for a new song
            if lyrics?.trackId == nil || lyrics?.trackId != state.track?.id { await loadLyrics() }
        } catch {
            message = error.localizedDescription
        }
    }

    private func loadLyrics() async {
        guard let agent else { return }

        do {
            let result: LyricsResult = try await agent.get("/lyrics")
            lyrics = result
            lyricsError = nil
        } catch {
            lyrics = nil
            lyricsError = error.localizedDescription
        }
    }

    private func loadLists() async {
        guard let agent else { return }

        async let info: AgentInfo = agent.get("/")
        async let bridgeScenes: [HueScene] = agent.get("/hue/scenes")

        if let info = try? await info { sources = info.sources }
        if let bridgeScenes = try? await bridgeScenes { scenes = bridgeScenes }
    }

    // MARK: Settings

    /// Saves the agent URL and, when one is typed, the token. A pasted setup link fills both.
    func save(url input: String, token newToken: String) {
        var url = input.trimmingCharacters(in: .whitespacesAndNewlines)
        var token = newToken.trimmingCharacters(in: .whitespacesAndNewlines)

        if let link = SetupLink(url) {
            url = link.agent
            token = link.token
        }

        agentURL = url
        UserDefaults.standard.set(url, forKey: "agentURL")

        if !token.isEmpty {
            Keychain.save(token)
            self.token = token
        }

        isEditingSettings = false
        Task {
            await loadLists()
            await refreshPlayback()
        }
    }

    // MARK: Actions

    /// Runs one agent call; `refreshing` reads the playback again a moment later, for a new song.
    private func run(refreshing: Bool = false, _ action: @escaping @Sendable (Agent) async throws -> Void) {
        guard let agent else {
            isEditingSettings = true
            return
        }

        Task {
            do {
                try await action(agent)
                message = nil

                if refreshing {
                    try? await Task.sleep(for: .milliseconds(800))
                    await refreshPlayback()
                }
            } catch {
                message = error.localizedDescription
            }
        }
    }

    func togglePlay() {
        let isPlaying = playback?.isPlaying ?? false
        playback?.isPlaying = !isPlaying
        run { try await $0.post(isPlaying ? "/spotify/pause" : "/spotify/play") }
    }

    func next() {
        run(refreshing: true) { try await $0.post("/spotify/next") }
    }

    func previous() {
        run(refreshing: true) { try await $0.post("/spotify/previous") }
    }

    /// One step down or up from the speaker icons beside the slider.
    func stepVolume(by delta: Double) {
        volume = min(100, max(0, volume + delta))
        commitVolume()
    }

    func commitVolume() {
        let percent = Int(volume.rounded())
        run { try await $0.post("/spotify/volume", json(["percent": percent])) }
    }

    func toggleLike() {
        guard let track = playback?.track else { return }

        let saved = !track.saved
        playback?.track?.saved = saved
        run { try await $0.post("/spotify/like", json(["trackId": track.id, "saved": saved])) }
    }

    func amp(_ command: String) {
        run { try await $0.post("/hk/\(command)") }
    }

    func ampSource(_ source: String) {
        run { try await $0.post("/hk/source", json(["source": source])) }
    }

    func recall(_ scene: HueScene) {
        run { try await $0.post("/hue/scenes/\(scene.id)") }
    }

    func lightsOff() {
        run { try await $0.post("/hue/all", json(["on": false])) }
    }
}
