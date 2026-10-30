import SwiftUI

/// The HK amp: whether it answers, its inputs (the last one picked here lit, as the amp cannot say), and its volume as
/// one rocker that keeps stepping while held, with sleep and mute on either side, like on a remote.
struct AmpCard: View {
    @Bindable var store: Store

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                SectionLabel("🔊 HK")
                StatusPill(text: statusText, isOnline: store.isAmpOnline) { Task { await store.checkAmp() } }
                Spacer()
                GlassIcon(symbol: "power", help: "Amp off", size: 11) { store.amp("off") }
            }

            Group {
                if !store.sources.isEmpty {
                    sources
                }

                HStack {
                    GlassIcon(symbol: "moon.fill", help: "Sleep timer", size: 13) { store.amp("sleep") }
                    Spacer()
                    rocker
                    Spacer()
                    GlassIcon(symbol: "speaker.slash.fill", help: "Mute", size: 13) { store.amp("mute") }
                }
            }
            // Taps would not reach an amp that does not answer
            .opacity(store.isAmpOnline == false ? 0.4 : 1)
        }
        .padding(12)
        .background(.quinary, in: .card)
    }

    private var statusText: String {
        switch store.isAmpOnline {
        case .none: "Checking"
        case .some(true): "Online"
        case .some(false): "Offline"
        }
    }

    private var sources: some View {
        GlassEffectContainer(spacing: 6) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 6)], spacing: 6) {
                ForEach(store.sources, id: \.self) { source in
                    let isLast = source == store.lastSource

                    Button {
                        store.ampSource(source)
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: Self.icon(for: source)).font(.system(size: 17))
                            Text(source).font(.caption.weight(.semibold)).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(isLast ? AnyPrimitiveButtonStyle(.glassProminent) : AnyPrimitiveButtonStyle(.glass))
                    .tint(isLast ? store.accent ?? .gray : nil)
                }
            }
        }
    }

    /// One capsule, − and +: holding a half keeps stepping the volume.
    private var rocker: some View {
        HStack(spacing: 0) {
            rockerHalf("minus", help: "Amp volume down, hold to keep going") { store.amp("volume-down") }
            Divider().frame(height: 18)
            rockerHalf("plus", help: "Amp volume up, hold to keep going") { store.amp("volume-up") }
        }
        .glassEffect(.regular, in: .capsule)
    }

    private func rockerHalf(_ symbol: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .frame(width: 58, height: 34)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .buttonRepeatBehavior(.enabled)
        .help(help)
    }

    private static func icon(for source: String) -> String {
        switch source.trimmingCharacters(in: .whitespaces).lowercased() {
        case "tv": "tv"
        case "radio": "radio"
        case "cable sat", "sat": "antenna.radiowaves.left.and.right"
        default: "hifispeaker"
        }
    }
}

/// A primitive button style chosen at run time (glass for an input, prominent glass for the last one picked).
struct AnyPrimitiveButtonStyle: PrimitiveButtonStyle {
    private let make: (Configuration) -> AnyView

    init<Style: PrimitiveButtonStyle>(_ style: Style) {
        make = { AnyView(style.makeBody(configuration: $0)) }
    }

    func makeBody(configuration: Configuration) -> some View {
        make(configuration)
    }
}
