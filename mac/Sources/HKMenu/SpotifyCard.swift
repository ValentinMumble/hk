import AppKit
import SwiftUI

/// The playing song over its blurred cover: controls, seek bar, volume and the Connect device.
struct SpotifyCard: View {
    @Bindable var store: Store

    var body: some View {
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
                    GlassIcon(symbol: "gearshape", help: "Settings", size: 11) { store.isEditingSettings = true }
                    GlassIcon(
                        symbol: store.playback?.track?.saved == true ? "heart.fill" : "heart", help: "Like", size: 11,
                        action: store.toggleLike
                    )
                    .disabled(store.playback?.track == nil)
                }
            }

            SeekBar(playback: store.playback, readAt: store.playbackReadAt, accent: accent, onSeek: store.seek)

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
                    GlassIcon(symbol: "speaker.fill", help: "Spotify volume down", size: 13) {
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
}
