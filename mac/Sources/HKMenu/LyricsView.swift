import SwiftUI

/// The playing song's lyrics under the Spotify controls. Time-coded lines follow the song with a local clock while
/// the panel is open: the position comes from the last playback read, so following along costs no request.
struct LyricsView: View {
    let lyrics: LyricsResult?
    let error: String?
    let playback: PlaybackState?
    let readAt: Date
    /// The cover's colour, for the line being sung.
    let accent: Color?

    /// Lines light up a little early: reading takes a moment, and the position is only estimated.
    private static let leadMs = 300.0

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            Group {
                if let lyrics {
                    if lyrics.instrumental {
                        note("Instrumental")
                    } else if let lines = lyrics.synced, !lines.isEmpty {
                        TimelineView(.periodic(from: .now, by: 0.25)) { context in
                            SyncedLyrics(
                                lines: lines, current: currentLine(lines, at: position(at: context.date)),
                                accent: accent)
                        }
                    } else {
                        ScrollView {
                            Text(lyrics.lyrics)
                                .padding(.vertical, 20)
                                .font(.title3)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                        }
                    }
                } else if let error {
                    note(error)
                } else {
                    ProgressView().controlSize(.small).frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            // A fresh view for each song, so its lyrics start at the top
            .id(lyrics?.trackId)
            .frame(height: 160)
            // The lines fade out at the top and bottom edges
            .mask {
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0), .init(color: .black, location: 0.18),
                        .init(color: .black, location: 0.82), .init(color: .clear, location: 1),
                    ], startPoint: .top, endPoint: .bottom)
            }

            if let lyrics, let url = URL(string: lyrics.url) {
                Link("\(lyrics.source) ↗", destination: url).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func position(at date: Date) -> Double {
        guard let playback else { return 0 }

        return playback.positionMs(at: date, readAt: readAt) + Self.leadMs
    }

    /// Index of the line playing at `positionMs`, or -1 before the first one.
    private func currentLine(_ lines: [LyricsResult.Line], at positionMs: Double) -> Int {
        lines.lastIndex { Double($0.timeMs) <= positionMs } ?? -1
    }
}

/// Time-coded lines, the current one bright and kept in the middle.
private struct SyncedLyrics: View {
    let lines: [LyricsResult.Line]
    let current: Int
    let accent: Color?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(lines.indices, id: \.self) { index in
                        Text(lines[index].text.isEmpty ? "♪" : lines[index].text)
                            .font(.title3.weight(index == current ? .semibold : .regular))
                            .foregroundStyle(
                                index == current ? AnyShapeStyle(accent ?? .primary) : AnyShapeStyle(.secondary)
                            )
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                            .id(index)
                    }
                }
                .padding(.vertical, 60)
            }
            .onChange(of: current, initial: true) { _, line in
                guard line >= 0 else { return }

                withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(line, anchor: .center) }
            }
        }
    }
}
