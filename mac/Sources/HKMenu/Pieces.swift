import SwiftUI

extension Shape where Self == RoundedRectangle {
    /// The shape of the panel's cards.
    static var card: RoundedRectangle { RoundedRectangle(cornerRadius: 18, style: .continuous) }
}

/// A card's title, like "🔊 HK".
struct SectionLabel: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.secondary)
    }
}

/// A round, neutral glass button around an icon.
struct GlassIcon: View {
    let symbol: String
    let help: String
    var size: CGFloat = 15
    let action: () -> Void

    var body: some View {
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
}

/// Whether a device answers, as a small coloured pill: grey while checking, green, or red. A click checks again.
struct StatusPill: View {
    let text: String
    let isOnline: Bool?
    let action: () -> Void

    private var color: Color {
        switch isOnline {
        case .none: .gray
        case .some(true): .green
        case .some(false): .red
        }
    }

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(color)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(color.opacity(0.18), in: .capsule)
        }
        .buttonStyle(.plain)
        .help("Check again")
    }
}

/// Glass buttons in a grid, as many columns as fit.
struct ButtonGrid<Item, ID: Hashable>: View {
    let items: [Item]
    let id: KeyPath<Item, ID>
    let label: (Item) -> String
    let action: (Item) -> Void

    var body: some View {
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

extension Color {
    /// A colour from "#rrggbb", as the agent sends a light's colour; grey when the text is not one.
    init(hex: String) {
        let digits = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))

        guard digits.count == 6, let value = UInt32(digits, radix: 16) else {
            self = .gray
            return
        }

        self.init(
            red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255)
    }
}
