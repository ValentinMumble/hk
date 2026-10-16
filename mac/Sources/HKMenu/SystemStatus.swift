import Darwin
import Foundation
import IOKit.ps
import Observation
import SystemConfiguration

/// The menu bar text, like the SwiftBar plugin it replaces: download speed, and the charger's wattage when one is
/// plugged in. Read from this Mac every few seconds; nothing goes over the network.
@MainActor
@Observable
final class SystemStatus {
    private(set) var text = "⬇ …"

    private static let interval: Duration = .seconds(5)
    @ObservationIgnored private let network = SCDynamicStoreCreate(nil, "HK" as CFString, nil, nil)
    @ObservationIgnored private var previous: (interface: String, bytes: UInt32, time: ContinuousClock.Instant)?

    init() {
        Task { [weak self] in
            while let self {
                self.sample()
                try? await Task.sleep(for: Self.interval)
            }
        }
    }

    private func sample() {
        let speed = downloadSpeed().map(Self.format) ?? "…"
        let charger = chargerWatts().map { "  ⚡️\($0)W" } ?? ""
        text = "⬇ \(speed)\(charger)"
    }

    /// Bytes per second received on the interface the Mac uses for the internet, since the last sample.
    private func downloadSpeed() -> Double? {
        guard let interface = primaryInterface(), let bytes = receivedBytes(on: interface) else { return nil }

        let now = ContinuousClock.now
        defer { previous = (interface, bytes, now) }

        guard let previous, previous.interface == interface else { return nil }

        // The counter is 32 bits wide and wraps around after 4 GB
        let received = UInt64(bytes &- previous.bytes)
        let elapsed = now - previous.time
        let seconds = Double(elapsed.components.seconds) + Double(elapsed.components.attoseconds) / 1e18

        return seconds > 0 ? Double(received) / seconds : nil
    }

    private static func format(_ bytesPerSecond: Double) -> String {
        bytesPerSecond >= 1_048_576
            ? String(format: "%.1f MB/s", bytesPerSecond / 1_048_576)
            : String(format: "%.0f KB/s", bytesPerSecond / 1024)
    }

    private func primaryInterface() -> String? {
        guard let network,
            let global = SCDynamicStoreCopyValue(network, "State:/Network/Global/IPv4" as CFString) as? [String: Any]
        else { return nil }

        return global["PrimaryInterface"] as? String
    }

    private func receivedBytes(on interface: String) -> UInt32? {
        var list: UnsafeMutablePointer<ifaddrs>?

        guard getifaddrs(&list) == 0 else { return nil }
        defer { freeifaddrs(list) }

        var cursor = list
        while let entry = cursor?.pointee {
            if entry.ifa_addr?.pointee.sa_family == UInt8(AF_LINK), String(cString: entry.ifa_name) == interface,
                let data = entry.ifa_data?.assumingMemoryBound(to: if_data.self)
            {
                return data.pointee.ifi_ibytes
            }
            cursor = entry.ifa_next
        }

        return nil
    }

    /// The plugged-in charger's rating in watts, or nil on battery.
    private func chargerWatts() -> Int? {
        guard let details = IOPSCopyExternalPowerAdapterDetails()?.takeRetainedValue() as? [String: Any] else {
            return nil
        }

        return details[kIOPSPowerAdapterWattsKey] as? Int
    }
}
