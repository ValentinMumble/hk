import Foundation
import Security

/// The agent token lives in the login keychain, never in the app's settings file.
enum Keychain {
    private static var item: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "dev.vumble.hk",
            kSecAttrAccount as String: "agent-token",
        ]
    }

    static func token() -> String? {
        var query = item
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?

        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) {
        SecItemDelete(item as CFDictionary)
        var entry = item
        entry[kSecValueData as String] = Data(token.utf8)
        SecItemAdd(entry as CFDictionary, nil)
    }
}
