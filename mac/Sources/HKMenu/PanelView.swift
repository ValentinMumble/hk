import AppKit
import SwiftUI

/// The panel under the menu bar icon, or in the floating window when pinned: one card each for Spotify, the amp, the
/// lights and the lyrics.
struct PanelView: View {
    @Bindable var store: Store
    var isPinned = false
    @AppStorage(Store.ampFoldedKey) private var isAmpFolded = false
    @AppStorage(Store.lightsFoldedKey) private var isLightsFolded = false
    @AppStorage("lyricsFolded") private var isLyricsFolded = false

    var body: some View {
        VStack(spacing: 10) {
            if store.isEditingSettings || !store.isConfigured {
                SettingsView(store: store)
            } else {
                SpotifyCard(store: store, isPinned: isPinned)
                if !isAmpFolded { AmpCard(store: store) }
                if !isLightsFolded { LightsCard(store: store) }
                // No lyrics card without a song: it would only say so
                if hasLyricsCard && !isLyricsFolded {
                    VStack(alignment: .leading, spacing: 6) {
                        FoldingLabel(text: "🎤 Lyrics", isFolded: $isLyricsFolded)
                        LyricsView(
                            lyrics: store.lyrics, error: store.lyricsError, playback: store.playback,
                            readAt: store.playbackReadAt, accent: store.accent, onSeek: { store.seek(to: $0) }
                        )
                    }
                    .padding(.vertical, 10)
                    .padding(.horizontal, 12)
                    .background(.quinary, in: .card)
                }
                foldedChips
            }
        }
        .padding(12)
        .frame(width: 340)
        .background { if isPinned { Color.clear.glassEffect(.regular, in: .rect(cornerRadius: 28)) } }
        .overlay(alignment: .top) { banner }
        .animation(.easeInOut(duration: 0.25), value: [store.message, store.notice])
        // An error or a notice shows for a few seconds, then goes
        .task(id: [store.message, store.notice]) {
            guard store.message != nil || store.notice != nil else { return }

            try? await Task.sleep(for: .seconds(4))
            store.message = nil
            store.notice = nil
        }
        // The panel becomes key each time it opens: the playback and the devices' state are read again
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            store.panelOpened()
        }
    }

    private var hasLyricsCard: Bool { store.playback?.track != nil }

    /// The folded cards, side by side in one row at the bottom. A device is checked again as its card unfolds: a
    /// folded card's device is not checked in the background.
    @ViewBuilder private var foldedChips: some View {
        if isAmpFolded || isLightsFolded || (hasLyricsCard && isLyricsFolded) {
            HStack(spacing: 6) {
                if isAmpFolded {
                    FoldedChip(text: "🔊 HK", isOnline: .some(store.isAmpOnline)) {
                        unfold { isAmpFolded = false }
                        Task { await store.checkAmp() }
                    }
                }
                if isLightsFolded {
                    FoldedChip(text: "💡 Hue", isOnline: .some(store.isHueReachable)) {
                        unfold { isLightsFolded = false }
                        Task { await store.loadLights() }
                    }
                }
                if hasLyricsCard && isLyricsFolded {
                    FoldedChip(text: "🎤 Lyrics") { unfold { isLyricsFolded = false } }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func unfold(_ change: () -> Void) {
        withAnimation(.easeInOut(duration: 0.2)) { change() }
    }

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
}
