import AppKit
import ServiceManagement
import SwiftUI

/// The agent's address and token, asked for on first launch and behind the gear button.
struct SettingsView: View {
    @Bindable var store: Store
    @State private var url = ""
    @State private var token = ""
    @State private var opensAtLogin = SMAppService.mainApp.status == .enabled

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("HK agent").font(.headline)
            Text("Paste the setup link, or the agent's URL and its token.")
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField("Agent URL or setup link", text: $url)
            SecureField(store.isConfigured ? "Token (leave empty to keep it)" : "Token", text: $token)
            Toggle("Open at login", isOn: $opensAtLogin)
                .onChange(of: opensAtLogin) { _, isOn in
                    do {
                        if isOn { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                    } catch {
                        store.message = error.localizedDescription
                        opensAtLogin = SMAppService.mainApp.status == .enabled
                    }
                }
            HStack {
                Button("Quit") { NSApp.terminate(nil) }
                Spacer()
                if store.isConfigured {
                    Button("Cancel") { store.isEditingSettings = false }
                }
                Button("Save") {
                    store.save(url: url, token: token)
                    token = ""
                }
                .keyboardShortcut(.defaultAction)
                .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .onAppear { url = store.agentURL }
    }
}
