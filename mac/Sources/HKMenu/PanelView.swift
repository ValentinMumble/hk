import AppKit
import ServiceManagement
import SwiftUI

/// The panel under the menu bar icon: Spotify, then the amp, the lights and the lyrics.
struct PanelView: View {
    @Bindable var store: Store

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if store.isEditingSettings || !store.isConfigured {
                SettingsView(store: store)
            } else {
                spotify
                Divider()
                amp
                Divider()
                lights
                Divider()
                LyricsView(
                    lyrics: store.lyrics, error: store.lyricsError, playback: store.playback,
                    readAt: store.playbackReadAt)
            }

            if let message = store.message {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(2)
            }
        }
        .padding(14)
        .frame(width: 300)
        // The panel becomes key each time it opens: the one moment the playback is read
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            store.panelOpened()
        }
    }

    private var spotify: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                // Only brings the Spotify app forward: opening the song itself would start it over
                Button {
                    if let spotify = URL(string: "spotify:") { NSWorkspace.shared.open(spotify) }
                } label: {
                    HStack(spacing: 10) {
                        artwork
                        VStack(alignment: .leading, spacing: 2) {
                            Text(store.playback?.track?.name ?? "Nothing playing")
                                .font(.headline)
                                .lineLimit(1)
                            Text(store.playback?.track?.artists ?? store.playback?.device?.name ?? " ")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Open Spotify")
                Spacer()
                glassIcon("gearshape", help: "Settings", size: 12) { store.isEditingSettings = true }
            }

            GlassEffectContainer(spacing: 14) {
                HStack(spacing: 14) {
                    glassIcon("backward.fill", help: "Previous", action: store.previous)
                    Button(action: store.togglePlay) {
                        Image(systemName: store.playback?.isPlaying == true ? "pause.fill" : "play.fill")
                            .font(.system(size: 20))
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.circle)
                    .help("Play or pause")
                    glassIcon("forward.fill", help: "Next", action: store.next)
                    glassIcon(store.playback?.track?.saved == true ? "heart.fill" : "heart", help: "Like",
                        action: store.toggleLike)
                        .disabled(store.playback?.track == nil)
                }
            }
            .frame(maxWidth: .infinity)

            HStack {
                volumeStep("speaker.fill", help: "Spotify volume down", by: -5)
                Slider(value: $store.volume, in: 0...100) { isEditing in
                    if !isEditing { store.commitVolume() }
                }
                volumeStep("speaker.wave.3.fill", help: "Spotify volume up", by: 5)
            }
            .disabled(store.playback?.device == nil)
        }
    }

    private var artwork: some View {
        AsyncImage(url: store.playback?.track?.artwork.flatMap(URL.init(string:))) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Image(systemName: "music.note")
                .font(.system(size: 20))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.quaternary)
        }
        .frame(width: 48, height: 48)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private var amp: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 16) {
                Text("🔊 HK").font(.headline)
                Spacer()
                glassIcon("speaker.slash.fill", help: "Mute", size: 12) { store.amp("mute") }
                glassIcon("power", help: "Amp off", size: 12) { store.amp("off") }
            }

            HStack(spacing: 8) {
                Button {
                    store.amp("volume-down")
                } label: {
                    Image(systemName: "speaker.minus.fill").frame(maxWidth: .infinity)
                }
                .help("Amp volume down")
                Button {
                    store.amp("volume-up")
                } label: {
                    Image(systemName: "speaker.plus.fill").frame(maxWidth: .infinity)
                }
                .help("Amp volume up")
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)

            if !store.sources.isEmpty {
                buttonGrid(store.sources, id: \.self, label: { $0 }) { store.ampSource($0) }
            }
        }
    }

    /// The everyday scene, shown big beside "Off": the bridge's scene named "Main".
    private var mainScene: HueScene? {
        store.scenes.first { $0.name.localizedCaseInsensitiveCompare("Main") == .orderedSame }
    }

    private var lights: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("💡 Hue").font(.headline)

            HStack(spacing: 8) {
                if let mainScene {
                    Button {
                        store.recall(mainScene)
                    } label: {
                        Label(sceneLabel(mainScene), systemImage: "lightbulb.fill").frame(maxWidth: .infinity)
                    }
                    .tint(.orange)
                }
                Button(action: store.lightsOff) {
                    Image(systemName: "power").frame(maxWidth: .infinity)
                }
                .tint(.gray)
                .help("All lights off")
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)

            let otherScenes = store.scenes.filter { $0.id != mainScene?.id }

            if !otherScenes.isEmpty {
                buttonGrid(otherScenes, id: \.id, label: sceneLabel) { store.recall($0) }
            }
        }
    }

    /// A scene's name, with its room when another scene has the same name.
    private func sceneLabel(_ scene: HueScene) -> String {
        guard let room = scene.room, store.scenes.contains(where: { $0.id != scene.id && $0.name == scene.name }) else {
            return scene.name
        }

        return "\(scene.name) · \(room)"
    }

    private func volumeStep(_ symbol: String, help: String, by delta: Double) -> some View {
        Button {
            store.stepVolume(by: delta)
        } label: {
            Image(systemName: symbol).foregroundStyle(.secondary)
        }
        .buttonStyle(.borderless)
        .help(help)
    }

    /// A round glass button around an icon.
    private func glassIcon(_ symbol: String, help: String, size: CGFloat = 15, action: @escaping () -> Void)
        -> some View
    {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size))
                .frame(width: size + 14, height: size + 14)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .help(help)
    }

    private func buttonGrid<Item, ID: Hashable>(
        _ items: [Item], id: KeyPath<Item, ID>, label: @escaping (Item) -> String, action: @escaping (Item) -> Void
    ) -> some View {
        GlassEffectContainer(spacing: 6) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 6)], spacing: 6) {
                ForEach(items, id: id) { item in
                    Button {
                        action(item)
                    } label: {
                        Text(label(item)).lineLimit(1).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                }
            }
        }
    }
}

/// The agent's address and token, asked for on first launch and behind the gear button.
struct SettingsView: View {
    @Bindable var store: Store
    @State private var url = ""
    @State private var token = ""
    @State private var opensAtLogin = SMAppService.mainApp.status == .enabled

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("HK agent").font(.headline)
            Text("Paste the setup link, or the agent's URL and its token.")
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField("Agent URL or setup link", text: $url)
            SecureField(store.isConfigured ? "Token (leave empty to keep it)" : "Token", text: $token)
            Toggle("Open at login", isOn: $opensAtLogin)
                .onChange(of: opensAtLogin) { _, isOn in
                    do {
                        if isOn { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                    } catch {
                        store.message = error.localizedDescription
                        opensAtLogin = SMAppService.mainApp.status == .enabled
                    }
                }
            HStack {
                Button("Quit") { NSApp.terminate(nil) }
                Spacer()
                if store.isConfigured {
                    Button("Cancel") { store.isEditingSettings = false }
                }
                Button("Save") {
                    store.save(url: url, token: token)
                    token = ""
                }
                .keyboardShortcut(.defaultAction)
                .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .onAppear { url = store.agentURL }
    }
}
