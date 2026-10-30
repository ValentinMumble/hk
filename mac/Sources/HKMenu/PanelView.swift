import AppKit
import SwiftUI

/// The panel under the menu bar icon: one card each for Spotify, the amp, the lights and the lyrics.
struct PanelView: View {
    @Bindable var store: Store

    var body: some View {
        VStack(spacing: 10) {
            if store.isEditingSettings || !store.isConfigured {
                SettingsView(store: store)
            } else {
                SpotifyCard(store: store)
                AmpCard(store: store)
                LightsCard(store: store)
                LyricsView(
                    lyrics: store.lyrics, error: store.lyricsError, playback: store.playback,
                    readAt: store.playbackReadAt, accent: store.accent
                )
                .padding(.vertical, 10)
                .padding(.horizontal, 12)
                .background(.quinary, in: .card)
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
        // The panel becomes key each time it opens: the playback and the devices' state are read again
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            store.panelOpened()
        }
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
