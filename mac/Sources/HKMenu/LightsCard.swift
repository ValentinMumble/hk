import SwiftUI

/// The Hue lights: whether the bridge answers, each light as a tile like Apple's Home app (a click toggles it), the
/// everyday scene and "off" in big, and the other scenes.
struct LightsCard: View {
    @Bindable var store: Store

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                SectionLabel("💡 Hue")
                StatusPill(text: statusText, isOnline: store.isHueReachable) { Task { await store.loadLights() } }
            }

            Group {
                if !store.lights.isEmpty {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 6)], spacing: 6) {
                        ForEach(store.lights) { light in
                            LightTile(light: light) { store.toggle(light) }
                        }
                    }
                }

                HStack(spacing: 8) {
                    if let mainScene {
                        Button {
                            store.recall(mainScene)
                        } label: {
                            Label(sceneLabel(mainScene), systemImage: "lightbulb.fill").frame(maxWidth: .infinity)
                        }
                        .tint(.orange)
                    }
                    Button(action: store.lightsOff) {
                        Image(systemName: "power").frame(maxWidth: .infinity)
                    }
                    .tint(.gray)
                    .help("All lights off")
                }
                .buttonStyle(.glassProminent)
                .controlSize(.large)

                let otherScenes = store.scenes.filter { $0.id != mainScene?.id }

                if !otherScenes.isEmpty {
                    ButtonGrid(items: otherScenes, id: \.id, label: sceneLabel) { store.recall($0) }
                }
            }
            // Clicks would not reach a bridge that does not answer
            .opacity(store.isHueReachable == false ? 0.4 : 1)
        }
        .padding(12)
        .background(.quinary, in: .card)
    }

    private var statusText: String {
        guard let isReachable = store.isHueReachable else { return "Checking" }
        guard isReachable else { return "Offline" }

        let onCount = store.lights.filter(\.on).count

        return onCount == 0 ? "All off" : "\(onCount) on"
    }

    /// The everyday scene, shown big beside "Off": the bridge's scene named "Main".
    private var mainScene: HueScene? {
        store.scenes.first { $0.name.localizedCaseInsensitiveCompare("Main") == .orderedSame }
    }

    /// A scene's name, with its room when another scene has the same name.
    private func sceneLabel(_ scene: HueScene) -> String {
        guard let room = scene.room, store.scenes.contains(where: { $0.id != scene.id && $0.name == scene.name }) else {
            return scene.name
        }

        return "\(scene.name) · \(room)"
    }
}

/// One light: its icon in a circle, its name and its state. A lit tile turns white, its icon in the light's colour.
private struct LightTile: View {
    let light: HueLight
    let action: () -> Void

    private let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: light.on ? "lightbulb.fill" : "lightbulb")
                    .font(.system(size: 13))
                    .foregroundStyle(light.on ? Color.black : Color.secondary)
                    .frame(width: 28, height: 28)
                    .background(light.on ? Color(hex: light.color) : Color.white.opacity(0.12), in: .circle)
                VStack(alignment: .leading, spacing: 1) {
                    Text(light.name)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                    Text(state)
                        .font(.caption2)
                        .monospacedDigit()
                        .opacity(0.6)
                }
                .foregroundStyle(light.on ? Color.black : Color.primary)
                Spacer(minLength: 0)
            }
            .padding(6)
            .background(light.on ? Color.white.opacity(0.92) : Color.clear, in: shape)
            .glassEffect(.regular, in: shape)
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .opacity(light.reachable ? 1 : 0.4)
        .help(light.on ? "Turn \(light.name) off" : "Turn \(light.name) on")
    }

    private var state: String {
        guard light.reachable else { return "Unreachable" }

        return light.on ? "\(light.brightness)%" : "Off"
    }
}
