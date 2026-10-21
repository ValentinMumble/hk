import SwiftUI

/// Where the song is, with the time gone and the time left; dragging or clicking it jumps in the song. Like the
/// lyrics, it follows the song with a local clock between playback reads.
struct SeekBar: View {
    let playback: PlaybackState?
    let readAt: Date
    let accent: Color
    let onSeek: (Int) -> Void

    /// The position under the pointer while dragging, so the clock does not pull the knob back.
    @State private var draggedMs: Double?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let durationMs = Double(playback?.track?.durationMs ?? 0)
            let positionMs = min(
                durationMs, max(0, draggedMs ?? playback?.positionMs(at: context.date, readAt: readAt) ?? 0))

            VStack(spacing: 0) {
                Slider(
                    value: Binding(get: { positionMs }, set: { draggedMs = $0 }), in: 0...max(durationMs, 1)
                ) { isEditing in
                    guard !isEditing, let draggedMs else { return }

                    onSeek(Int(draggedMs))
                    self.draggedMs = nil
                }
                .controlSize(.small)
                .tint(accent)

                HStack {
                    Text(Self.format(positionMs))
                    Spacer()
                    Text("-\(Self.format(durationMs - positionMs))")
                }
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(.secondary)
            }
        }
        .disabled(playback?.track == nil)
    }

    private static func format(_ milliseconds: Double) -> String {
        let seconds = max(0, Int(milliseconds / 1000))

        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}
