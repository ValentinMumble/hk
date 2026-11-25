import SwiftUI

/// HK in the Mac menu bar: a panel of quick controls for the HK agent, with no Dock icon. Beside the icon, the
/// download speed and the charger's wattage, read from this Mac.
@main
struct HKMenuApp: App {
    @State private var store = Store()
    @State private var status = SystemStatus()

    /// The floating window the panel moves to when pinned.
    static let pinnedWindowID = "pinned"

    var body: some Scene {
        MenuBarExtra {
            PanelView(store: store)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "speaker.wave.1.fill")
                Text(status.text).monospacedDigit()
            }
        }
        .menuBarExtraStyle(.window)

        // The same panel, kept above other windows until unpinned; it opens only from the pin button. No title bar
        // and no window backing: the panel draws its own glass, and the pin button closes it
        Window("HK", id: Self.pinnedWindowID) {
            PanelView(store: store, isPinned: true)
                .containerBackground(.clear, for: .window)
        }
        .windowLevel(.floating)
        .windowStyle(.plain)
        .windowResizability(.contentSize)
        .windowBackgroundDragBehavior(.enabled)
        .defaultLaunchBehavior(.suppressed)
        .restorationBehavior(.disabled)
    }
}
