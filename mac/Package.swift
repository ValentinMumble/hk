// swift-tools-version: 6.2
import PackageDescription

// The HK menu bar app. Build it into HK.app with build.sh next to this file.
let package = Package(
    name: "HKMenu",
    platforms: [.macOS(.v26)],
    targets: [
        .executableTarget(name: "HKMenu", path: "Sources/HKMenu")
    ]
)
