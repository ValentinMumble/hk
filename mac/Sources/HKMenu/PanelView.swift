import AppKit
import ServiceManagement
import SwiftUI

/// The panel under the menu bar icon: one card each for Spotify, the amp, the lights and the lyrics.
struct PanelView: View {
    @Bindable var store: Store

    var body: some View {
        VStack(spacing: 10) {
            if store.isEditingSettings || !store.isConfigured {
                SettingsView(store: store)
            } else {
                spotify
                amp
                lights
                LyricsView(
                    lyrics: store.lyrics, error: store.lyricsError, playback: store.playback,
                    readAt: store.playbackReadAt, accent: store.accent
                )
                .padding(.vertical, 10)
                .padding(.horizontal, 12)
                .background(.quinary, in: cardShape)
            }
        }
        .padding(12)
        .frame(width: 340)
        .overlay(alignment: .top) { banner }
        .animation(.easeInOut(duration: 0.25), value: [store.message, store.notice])
        // An error or a notice shows for a few seconds, then goes
        .task(id: [store.message, store.notice]) {
            guard store.message != nil || store.notice != nil else { return }

            try? await Task.sleep(for: .seconds(4))
            store.message = nil
            store.notice = nil
        }
        // The panel becomes key each time it opens: the one moment the playback is read
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            store.panelOpened()
        }
    }

    private let cardShape = RoundedRectangle(cornerRadius: 18, style: .continuous)

    @ViewBuilder private var banner: some View {
        if let message = store.message {
            bannerText(Label(message, systemImage: "exclamationmark.triangle.fill"), tint: .red.opacity(0.35))
        } else if let notice = store.notice {
            bannerText(Text(notice), tint: nil)
        }
    }

    private func bannerText(_ content: some View, tint: Color?) -> some View {
        content
            .font(.caption)
            .lineLimit(2)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .glassEffect(.regular.tint(tint), in: .capsule)
            .padding(.top, 6)
            .padding(.horizontal, 16)
            .transition(.move(edge: .top).combined(with: .opacity))
    }

    // MARK: Spotify

    private var spotify: some View {
        VStack(spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                // Only brings the Spotify app forward: opening the song itself would start it over
                Button {
                    if let spotify = URL(string: "spotify:") { NSWorkspace.shared.open(spotify) }
                } label: {
                    HStack(spacing: 12) {
                        coverView
                        VStack(alignment: .leading, spacing: 3) {
                            Text(store.playback?.track?.name ?? "Nothing playing")
                                .font(.headline)
                                .lineLimit(2)
                            Text(store.playback?.track?.artists ?? " ")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Open Spotify")
                VStack(spacing: 8) {
                    glassIcon("gearshape", help: "Settings", size: 11) { store.isEditingSettings = true }
                    glassIcon(
                        store.playback?.track?.saved == true ? "heart.fill" : "heart", help: "Like", size: 11,
                        action: store.toggleLike
                    )
                    .disabled(store.playback?.track == nil)
                }
            }

            SeekBar(playback: store.playback, readAt: store.playbackReadAt, accent: accent, onSeek: store.seek)

            GlassEffectContainer(spacing: 16) {
                HStack(spacing: 16) {
                    radioButton
                    glassIcon("backward.fill", help: "Previous", action: store.previous)
                    Button(action: store.togglePlay) {
                        Image(systemName: store.playback?.isPlaying == true ? "pause.fill" : "play.fill")
                            .font(.system(size: 22))
                            .frame(width: 40, height: 40)
                    }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.circle)
                    .tint(accent)
                    .help("Play or pause")
                    glassIcon("forward.fill", help: "Next", action: store.next)
                    playlistMenu
                }
            }

            VStack(spacing: 6) {
                HStack {
                    volumeStep("speaker.fill", help: "Spotify volume down", by: -5)
                    Slider(value: $store.volume, in: 0...100) { isEditing in
                        if !isEditing { store.commitVolume() }
                    }
                    .tint(accent)
                    volumeStep("speaker.wave.3.fill", help: "Spotify volume up", by: 5)
                }
                .disabled(store.playback?.device == nil)

                deviceMenu
            }
        }
        .padding(14)
        .background { coverBackdrop }
        .clipShape(cardShape)
    }

    /// The cover's colour, or grey when the cover has none.
    private var accent: Color { store.accent ?? .gray }

    /// The cover, blurred behind the Spotify card, like the web app's backdrop.
    private var coverBackdrop: some View {
        ZStack {
            Rectangle().fill(.quinary)
            if let cover = store.cover {
                Image(nsImage: cover)
                    .resizable()
                    .scaledToFill()
                    .scaleEffect(1.6)
                    .blur(radius: 36)
                    .opacity(0.55)
            }
        }
        .animation(.easeInOut(duration: 0.4), value: store.cover)
    }

    private var coverView: some View {
        Group {
            if let cover = store.cover {
                Image(nsImage: cover).resizable().scaledToFill()
            } else {
                Image(systemName: "music.note")
                    .font(.system(size: 24))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.quaternary)
            }
        }
        .frame(width: 68, height: 68)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .shadow(color: .black.opacity(0.25), radius: 6, y: 3)
    }

    /// Queues songs like this one; spins while the agent finds them.
    private var radioButton: some View {
        Button(action: store.startRadio) {
            Group {
                if store.isRadioBusy {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "dot.radiowaves.left.and.right").font(.system(size: 13))
                }
            }
            .foregroundStyle(.primary)
            .frame(width: 27, height: 27)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .disabled(store.playback?.track == nil || store.isRadioBusy)
        .help("Queue songs like this one")
    }

    /// Plays a playlist or Liked Songs; the list is read when the pointer reaches it.
    private var playlistMenu: some View {
        Menu {
            if store.playlists.isEmpty {
                Text("Loading playlists…")
            }
            ForEach(store.playlists) { playlist in
                Button(playlist.name) { store.play(playlist) }
            }
        } label: {
            Image(systemName: "music.note.list")
                .font(.system(size: 13))
                .foregroundStyle(.primary)
                .frame(width: 27, height: 27)
        }
        .menuStyle(.button)
        .menuIndicator(.hidden)
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .fixedSize()
        .help("Playlists")
        .onHover { isInside in
            if isInside { store.loadPlaylists() }
        }
    }

    /// The playing device as a native menu of the others; the list is read when the pointer reaches it.
    private var deviceMenu: some View {
        Menu {
            if store.devices.isEmpty {
                Text("Looking for devices…")
            }
            ForEach(store.devices) { device in
                Button {
                    store.transfer(to: device)
                } label: {
                    if device.isActive {
                        Label(device.name, systemImage: "checkmark")
                    } else {
                        Text(device.name)
                    }
                }
            }
        } label: {
            Label(store.playback?.device?.name ?? "No device", systemImage: "hifispeaker")
        }
        .menuStyle(.button)
        .buttonStyle(.borderless)
        .fixedSize()
        .font(.caption)
        .foregroundStyle(.secondary)
        .tint(.secondary)
        .help("Spotify device")
        .onHover { isInside in
            if isInside { store.loadDevices() }
        }
    }

    // MARK: Amp

    private var amp: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                sectionLabel("🔊 HK")
                Spacer()
                glassIcon("speaker.slash.fill", help: "Mute", size: 11) { store.amp("mute") }
                glassIcon("power", help: "Amp off", size: 11) { store.amp("off") }
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
            .tint(.gray)
            .controlSize(.large)

            if !store.sources.isEmpty {
                buttonGrid(store.sources, id: \.self, label: { $0 }) { store.ampSource($0) }
            }
        }
        .padding(12)
        .background(.quinary, in: cardShape)
    }

    // MARK: Lights

    /// The everyday scene, shown big beside "Off": the bridge's scene named "Main".
    private var mainScene: HueScene? {
        store.scenes.first { $0.name.localizedCaseInsensitiveCompare("Main") == .orderedSame }
    }

    private var lights: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("💡 Hue")

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
        .padding(12)
        .background(.quinary, in: cardShape)
    }

    /// A scene's name, with its room when another scene has the same name.
    private func sceneLabel(_ scene: HueScene) -> String {
        guard let room = scene.room, store.scenes.contains(where: { $0.id != scene.id && $0.name == scene.name }) else {
            return scene.name
        }

        return "\(scene.name) · \(room)"
    }

    // MARK: Pieces

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.secondary)
    }

    private func volumeStep(_ symbol: String, help: String, by delta: Double) -> some View {
        glassIcon(symbol, help: help, size: 13) { store.stepVolume(by: delta) }
    }

    /// A round, neutral glass button around an icon.
    private func glassIcon(_ symbol: String, help: String, size: CGFloat = 15, action: @escaping () -> Void)
        -> some View
    {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size))
                .foregroundStyle(.primary)
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
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 6)], spacing: 6) {
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
