import AppKit
import SwiftUI

/// The playing song over its blurred cover: controls, seek bar, volume and the Connect device. Folds into a one-line
/// player, and can stay on screen in a floating window (pinned).
struct SpotifyCard: View {
    @Bindable var store: Store
    /// Shown in the floating window rather than under the menu bar icon.
    var isPinned = false
    @AppStorage("spotifyCompact") private var isCompact = false
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismissWindow) private var dismissWindow

    var body: some View {
        if isCompact { compactPlayer } else { fullPlayer }
    }

    /// One line with the cover, the song, and previous, play and next, then a thin volume line.
    private var compactPlayer: some View {
        VStack(spacing: 4) {
            HStack(spacing: 8) {
                compactTrackRow
            }
            HStack(spacing: 2) {
                compactControl("speaker.wave.1.fill", help: "Spotify volume down") { store.stepVolume(by: -5) }
                Slider(value: $store.volume, in: 0...100) { isEditing in
                    if !isEditing { store.commitVolume() }
                }
                .controlSize(.mini)
                .tint(accent)
                compactControl("speaker.wave.3.fill", help: "Spotify volume up") { store.stepVolume(by: 5) }
            }
            .disabled(store.playback?.device == nil)
        }
        .padding(8)
        .background { coverBackdrop }
        .clipShape(.card)
    }

    @ViewBuilder private var compactTrackRow: some View {
        openSpotifyButton {
            HStack(spacing: 8) {
                coverView(size: 34, radius: 7)
                VStack(alignment: .leading, spacing: 1) {
                    Text(store.playback?.track?.name ?? "Nothing playing")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(store.playback?.track?.artists ?? " ")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        HStack(spacing: 0) {
            compactControl("backward.fill", help: "Previous", action: store.previous)
            compactControl(
                store.playback?.isPlaying == true ? "pause.fill" : "play.fill", help: "Play or pause",
                action: store.togglePlay)
            compactControl("forward.fill", help: "Next", action: store.next)
        }
        GlassIcon(symbol: "arrow.up.left.and.arrow.down.right", help: "Full player", size: 9) {
            withAnimation(.easeInOut(duration: 0.2)) { isCompact = false }
        }
        pinButton(size: 9)
    }

    private func compactControl(_ symbol: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13))
                .frame(width: 26, height: 26)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }

    private var fullPlayer: some View {
        VStack(spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                openSpotifyButton {
                    HStack(spacing: 12) {
                        coverView(size: 68, radius: 10)
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
                }
                Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                    GridRow {
                        pinButton(size: 11)
                        GlassIcon(symbol: "gearshape", help: "Settings", size: 11) { store.isEditingSettings = true }
                    }
                    GridRow {
                        GlassIcon(symbol: "arrow.down.right.and.arrow.up.left", help: "Small player", size: 11) {
                            withAnimation(.easeInOut(duration: 0.2)) { isCompact = true }
                        }
                        GlassIcon(
                            symbol: store.playback?.track?.saved == true ? "heart.fill" : "heart", help: "Like",
                            size: 11, action: store.toggleLike
                        )
                        .disabled(store.playback?.track == nil)
                    }
                }
            }

            SeekBar(playback: store.playback, readAt: store.playbackReadAt, accent: accent, onSeek: store.seek)

            if let upNext = store.upNext {
                Text("Next · \(upNext.name) · \(upNext.artists)")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .glassEffect(.regular, in: .capsule)
                    .help("Up next: \(upNext.name), \(upNext.artists)")
            }

            GlassEffectContainer(spacing: 16) {
                HStack(spacing: 16) {
                    radioButton
                    GlassIcon(symbol: "backward.fill", help: "Previous", action: store.previous)
                    Button(action: store.togglePlay) {
                        Image(systemName: store.playback?.isPlaying == true ? "pause.fill" : "play.fill")
                            .font(.system(size: 22))
                            .frame(width: 40, height: 40)
                    }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.circle)
                    .tint(accent)
                    .help("Play or pause")
                    GlassIcon(symbol: "forward.fill", help: "Next", action: store.next)
                    playlistMenu
                }
            }

            VStack(spacing: 6) {
                HStack {
                    GlassIcon(symbol: "speaker.wave.1.fill", help: "Spotify volume down", size: 13) {
                        store.stepVolume(by: -5)
                    }
                    Slider(value: $store.volume, in: 0...100) { isEditing in
                        if !isEditing { store.commitVolume() }
                    }
                    .tint(accent)
                    GlassIcon(symbol: "speaker.wave.3.fill", help: "Spotify volume up", size: 13) {
                        store.stepVolume(by: 5)
                    }
                }
                .disabled(store.playback?.device == nil)

                deviceMenu
            }
        }
        .padding(14)
        .background { coverBackdrop }
        .clipShape(.card)
    }

    /// The cover's colour, or grey when the cover has none.
    private var accent: Color { store.accent ?? .gray }

    /// The cover, blurred behind the card, like the web app's backdrop.
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

    /// The cover and the song; a click only brings the Spotify app forward: opening the song would start it over.
    private func openSpotifyButton(@ViewBuilder label: () -> some View) -> some View {
        Button {
            if let spotify = URL(string: "spotify:") { NSWorkspace.shared.open(spotify) }
        } label: {
            label().contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("Open Spotify")
    }

    /// Keeps the panel on screen in a floating window, or closes that window.
    private func pinButton(size: CGFloat) -> some View {
        GlassIcon(symbol: isPinned ? "pin.fill" : "pin", help: isPinned ? "Unpin" : "Keep on screen", size: size) {
            if isPinned {
                dismissWindow(id: HKMenuApp.pinnedWindowID)
            } else {
                // The menu bar panel is the key window here: it closes, and the floating window takes its place
                let panel = NSApp.keyWindow
                openWindow(id: HKMenuApp.pinnedWindowID)
                NSApp.activate()
                panel?.close()
            }
        }
    }

    private func coverView(size: CGFloat, radius: CGFloat) -> some View {
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
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
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
            // Always there: Volumio needs it most when it stops answering, and the agent restarts it all the same
            Divider()
            Button(
                store.isRestartingVolumio ? "Restarting Volumio…" : "Restart Volumio", action: store.restartVolumio
            )
            .disabled(store.isRestartingVolumio)
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
}
