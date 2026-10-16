import SwiftUI

/// HK in the Mac menu bar: a panel of quick controls for the HK agent, with no Dock icon. Beside the icon, the
/// download speed and the charger's wattage, read from this Mac.
@main
struct HKMenuApp: App {
    @State private var store = Store()
    @State private var status = SystemStatus()

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
    }
}
