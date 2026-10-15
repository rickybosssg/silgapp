import Foundation
import Security
import Capacitor

// Native registration preparation; auth remains disabled by the JavaScript gates.
@objc(SilgappAuthSecureStorePlugin)
public class SilgappAuthSecureStorePlugin: CAPPlugin {
    private static let storageQueue = DispatchQueue(label: "silgapp.auth.pending.keychain.v1")
    private let appId = "6a0ec08f3af5e1d1284254c1"
    private let fields: Set<String> = ["appId", "returnUrl", "provider", "id", "state", "verifier", "expiresAt"]
    private let maximumBytes = 2048

    private var query: [String: Any] {
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "silgapp") + ".auth-pending.v1",
                kSecAttrAccount as String: appId,
                kSecAttrSynchronizable as String: false]
    }

    private func reject(_ call: CAPPluginCall) {
        // Never attach a Security error or the rejected record to a bridge error.
        call.reject("Secure pending authentication storage unavailable.", "NATIVE_AUTH_STORE_UNAVAILABLE")
    }

    private func authorized(_ call: CAPPluginCall) -> Bool {
        return call.getString("appId") == appId
    }

    private func opaque(_ value: Any?) -> Bool {
        guard let string = value as? String, string.utf8.count == 43 else { return false }
        return string.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil
    }

    private func record(_ data: Data, requireLive: Bool = true) -> [String: Any]? {
        guard data.count <= maximumBytes,
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(value.keys) == fields,
              value["appId"] as? String == appId,
              value["returnUrl"] as? String == "silgapp://auth-callback",
              let provider = value["provider"] as? String, ["google", "apple"].contains(provider),
              opaque(value["id"]), opaque(value["state"]), opaque(value["verifier"]),
              let expires = value["expiresAt"] as? NSNumber,
              CFGetTypeID(expires) != CFBooleanGetTypeID() else { return nil }
        let expiry = expires.doubleValue
        let now = Date().timeIntervalSince1970 * 1000
        guard expiry.isFinite, expiry.rounded(.towardZero) == expiry, abs(expiry) <= 9007199254740991,
              (!requireLive || (expiry > now && expiry <= now + 300000)) else { return nil }
        return value
    }

    private func read() throws -> Data? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw StoreError.unavailable }
        return data
    }

    private func delete() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw StoreError.unavailable }
    }

    private enum StoreError: Error { case unavailable }

    @objc func setPending(_ call: CAPPluginCall) {
        guard authorized(call), let value = call.getString("value"),
              let data = value.data(using: .utf8), record(data) != nil else { reject(call); return }
        Self.storageQueue.async {
            // Queueing cannot extend the original five-minute validity window.
            guard self.record(data) != nil else { self.reject(call); return }
            let attributes: [String: Any] = [kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
            var status = SecItemUpdate(self.query as CFDictionary, attributes as CFDictionary)
            if status == errSecItemNotFound {
                var item = self.query
                attributes.forEach { item[$0.key] = $0.value }
                status = SecItemAdd(item as CFDictionary, nil)
            }
            guard status == errSecSuccess else { self.reject(call); return }
            call.resolve()
        }
    }

    @objc func getPending(_ call: CAPPluginCall) {
        guard authorized(call) else { reject(call); return }
        Self.storageQueue.async {
            do {
                guard let data = try self.read() else { call.resolve(["value": NSNull()]); return }
                guard self.record(data) != nil, let value = String(data: data, encoding: .utf8) else {
                    try self.delete()
                    call.resolve(["value": NSNull()])
                    return
                }
                call.resolve(["value": value])
            } catch { self.reject(call) }
        }
    }

    @objc func removePending(_ call: CAPPluginCall) {
        guard authorized(call), let id = call.getString("id"), opaque(id) else { reject(call); return }
        Self.storageQueue.async {
            do {
                guard let data = try self.read() else { call.resolve(["removed": false]); return }
                guard let record = self.record(data, requireLive: false) else {
                    try self.delete()
                    call.resolve(["removed": true])
                    return
                }
                let matches = record["id"] as? String == id
                if matches { try self.delete() }
                call.resolve(["removed": matches])
            } catch { self.reject(call) }
        }
    }

    @objc func clearPending(_ call: CAPPluginCall) {
        guard authorized(call) else { reject(call); return }
        Self.storageQueue.async {
            do { try self.delete(); call.resolve() } catch { self.reject(call) }
        }
    }
}
