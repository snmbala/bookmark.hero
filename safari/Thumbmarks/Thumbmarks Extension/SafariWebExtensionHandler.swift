//
//  SafariWebExtensionHandler.swift
//  Thumbmarks Extension
//
//  Created by balamm on 28/03/26.
//

import SafariServices
import os.log
import Foundation

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let storageKey = "nativeBookmarks.v1"

    private struct StoredNode: Codable {
        var id: String
        var parentId: String
        var title: String
        var url: String?
        var dateAdded: Double
        var index: Int
    }

    private struct BridgeError: Error {
        let message: String
    }

    private func nowMs() -> Double {
        Date().timeIntervalSince1970 * 1000
    }

    private func loadNodes() -> [StoredNode] {
        let defaults = UserDefaults.standard
        guard let data = defaults.data(forKey: storageKey) else {
            return defaultNodes()
        }
        do {
            let decoded = try JSONDecoder().decode([StoredNode].self, from: data)
            return ensureRootStructure(decoded)
        } catch {
            os_log(.error, "Failed to decode native bookmark store: %@", String(describing: error))
            return defaultNodes()
        }
    }

    private func saveNodes(_ nodes: [StoredNode]) {
        do {
            let data = try JSONEncoder().encode(nodes)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            os_log(.error, "Failed to encode native bookmark store: %@", String(describing: error))
        }
    }

    private func defaultNodes() -> [StoredNode] {
        let ts = nowMs()
        return [
            StoredNode(id: "0", parentId: "-1", title: "root", url: nil, dateAdded: ts, index: 0),
            StoredNode(id: "1", parentId: "0", title: "Bookmarks Bar", url: nil, dateAdded: ts, index: 0),
            StoredNode(id: "2", parentId: "0", title: "Other Bookmarks", url: nil, dateAdded: ts, index: 1),
            StoredNode(id: "3", parentId: "0", title: "Mobile Bookmarks", url: nil, dateAdded: ts, index: 2)
        ]
    }

    private func ensureRootStructure(_ input: [StoredNode]) -> [StoredNode] {
        var nodes = input
        let required: [(String, String, String, Int)] = [
            ("0", "-1", "root", 0),
            ("1", "0", "Bookmarks Bar", 0),
            ("2", "0", "Other Bookmarks", 1),
            ("3", "0", "Mobile Bookmarks", 2)
        ]
        let ts = nowMs()
        for (id, parentId, title, idx) in required {
            if !nodes.contains(where: { $0.id == id }) {
                nodes.append(StoredNode(id: id, parentId: parentId, title: title, url: nil, dateAdded: ts, index: idx))
            }
        }
        return nodes
    }

    private func toTree(_ nodes: [StoredNode], rootId: String = "0") -> [[String: Any]] {
        let byParent = Dictionary(grouping: nodes, by: { $0.parentId })
        func build(_ id: String) -> [String: Any]? {
            guard let current = nodes.first(where: { $0.id == id }) else { return nil }
            var dict: [String: Any] = [
                "id": current.id,
                "parentId": current.parentId,
                "title": current.title,
                "dateAdded": current.dateAdded,
                "index": current.index
            ]
            if let url = current.url {
                dict["url"] = url
            }
            let children = (byParent[id] ?? []).sorted(by: { $0.index < $1.index }).compactMap { build($0.id) }
            if !children.isEmpty {
                dict["children"] = children
            }
            return dict
        }

        guard let root = build(rootId) else { return [] }
        return [root]
    }

    private func nodeById(_ nodes: [StoredNode], _ id: String) -> StoredNode? {
        nodes.first(where: { $0.id == id })
    }

    private func subtreeIds(_ nodes: [StoredNode], rootId: String) -> Set<String> {
        let byParent = Dictionary(grouping: nodes, by: { $0.parentId })
        var visited = Set<String>()
        func dfs(_ id: String) {
            if visited.contains(id) { return }
            visited.insert(id)
            for child in byParent[id] ?? [] {
                dfs(child.id)
            }
        }
        dfs(rootId)
        return visited
    }

    private func nextId(_ nodes: [StoredNode]) -> String {
        let maxId = nodes.compactMap { Int($0.id) }.max() ?? 3
        return String(maxId + 1)
    }

    private func normalizeSiblings(_ nodes: inout [StoredNode], parentId: String) {
        let siblingIds = nodes.enumerated().filter { $0.element.parentId == parentId }.map { $0.offset }
        let sorted = siblingIds.sorted { nodes[$0].index < nodes[$1].index }
        for (i, idx) in sorted.enumerated() {
            nodes[idx].index = i
        }
    }

    private func performAction(_ action: String, payload: [String: Any]?) throws -> Any {
        var nodes = loadNodes()

        switch action {
        case "bookmarks.getTree":
            return toTree(nodes)

        case "bookmarks.get":
            guard let id = payload?["id"] as? String else {
                throw BridgeError(message: "Missing id")
            }
            guard let node = nodeById(nodes, id) else { return [] }
            let tree = toTree([node], rootId: id)
            return tree

        case "bookmarks.search":
            let query = (payload?["query"] as? String ?? "").lowercased()
            if query.isEmpty { return [] }
            let matches = nodes.filter { node in
                let t = node.title.lowercased()
                let u = (node.url ?? "").lowercased()
                return t.contains(query) || u.contains(query)
            }
            return matches.map { node in
                var d: [String: Any] = [
                    "id": node.id,
                    "parentId": node.parentId,
                    "title": node.title,
                    "dateAdded": node.dateAdded,
                    "index": node.index
                ]
                if let url = node.url { d["url"] = url }
                return d
            }

        case "bookmarks.create":
            let parentId = payload?["parentId"] as? String ?? "2"
            let title = payload?["title"] as? String ?? ""
            let url = payload?["url"] as? String
            let requestedIndex = payload?["index"] as? Int

            guard nodeById(nodes, parentId) != nil else {
                throw BridgeError(message: "Parent folder not found")
            }

            let siblings = nodes.filter { $0.parentId == parentId }
            let insertionIndex = max(0, min(requestedIndex ?? siblings.count, siblings.count))

            for i in 0..<nodes.count where nodes[i].parentId == parentId && nodes[i].index >= insertionIndex {
                nodes[i].index += 1
            }

            let newNode = StoredNode(
                id: nextId(nodes),
                parentId: parentId,
                title: title,
                url: url,
                dateAdded: nowMs(),
                index: insertionIndex
            )
            nodes.append(newNode)
            saveNodes(nodes)

            var result: [String: Any] = [
                "id": newNode.id,
                "parentId": newNode.parentId,
                "title": newNode.title,
                "dateAdded": newNode.dateAdded,
                "index": newNode.index
            ]
            if let u = newNode.url { result["url"] = u }
            return result

        case "bookmarks.update":
            guard let id = payload?["id"] as? String else {
                throw BridgeError(message: "Missing id")
            }
            guard let idx = nodes.firstIndex(where: { $0.id == id }) else {
                throw BridgeError(message: "Bookmark not found")
            }
            if let title = payload?["title"] as? String { nodes[idx].title = title }
            if let url = payload?["url"] as? String { nodes[idx].url = url }
            saveNodes(nodes)

            var result: [String: Any] = [
                "id": nodes[idx].id,
                "parentId": nodes[idx].parentId,
                "title": nodes[idx].title,
                "dateAdded": nodes[idx].dateAdded,
                "index": nodes[idx].index
            ]
            if let u = nodes[idx].url { result["url"] = u }
            return result

        case "bookmarks.move":
            guard let id = payload?["id"] as? String else {
                throw BridgeError(message: "Missing id")
            }
            guard let idx = nodes.firstIndex(where: { $0.id == id }) else {
                throw BridgeError(message: "Bookmark not found")
            }

            let oldParent = nodes[idx].parentId
            let newParent = payload?["parentId"] as? String ?? oldParent
            if nodeById(nodes, newParent) == nil {
                throw BridgeError(message: "Target parent not found")
            }

            let currentIndex = nodes[idx].index
            for i in 0..<nodes.count where nodes[i].parentId == oldParent && nodes[i].index > currentIndex {
                nodes[i].index -= 1
            }

            let siblingCount = nodes.filter { $0.parentId == newParent && $0.id != id }.count
            let desired = payload?["index"] as? Int ?? siblingCount
            let insertion = max(0, min(desired, siblingCount))

            for i in 0..<nodes.count where nodes[i].parentId == newParent && nodes[i].index >= insertion {
                nodes[i].index += 1
            }

            nodes[idx].parentId = newParent
            nodes[idx].index = insertion
            normalizeSiblings(&nodes, parentId: oldParent)
            normalizeSiblings(&nodes, parentId: newParent)
            saveNodes(nodes)

            var result: [String: Any] = [
                "id": nodes[idx].id,
                "parentId": nodes[idx].parentId,
                "title": nodes[idx].title,
                "dateAdded": nodes[idx].dateAdded,
                "index": nodes[idx].index
            ]
            if let u = nodes[idx].url { result["url"] = u }
            return result

        case "bookmarks.remove":
            guard let id = payload?["id"] as? String else {
                throw BridgeError(message: "Missing id")
            }
            let protect = Set(["0", "1", "2", "3"])
            if protect.contains(id) {
                throw BridgeError(message: "Cannot remove system folders")
            }
            guard let node = nodeById(nodes, id) else { return true }

            let descendants = subtreeIds(nodes, rootId: id)
            nodes.removeAll { descendants.contains($0.id) }
            normalizeSiblings(&nodes, parentId: node.parentId)
            saveNodes(nodes)
            return true

        case "bookmarks.removeTree":
            guard let id = payload?["id"] as? String else {
                throw BridgeError(message: "Missing id")
            }
            let protect = Set(["0", "1", "2", "3"])
            if protect.contains(id) {
                throw BridgeError(message: "Cannot remove system folders")
            }
            guard let node = nodeById(nodes, id) else { return true }
            let descendants = subtreeIds(nodes, rootId: id)
            nodes.removeAll { descendants.contains($0.id) }
            normalizeSiblings(&nodes, parentId: node.parentId)
            saveNodes(nodes)
            return true

        default:
            throw BridgeError(message: "Unknown action: \(action)")
        }
    }

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(.default, "Received native message: %@ (profile: %@)", String(describing: message), profile?.uuidString ?? "none")

        var bridgeResponse: [String: Any] = ["ok": false]
        if let body = message as? [String: Any], let action = body["action"] as? String {
            do {
                let payload = body["payload"] as? [String: Any]
                let result = try performAction(action, payload: payload)
                bridgeResponse = ["ok": true, "result": result]
            } catch let err as BridgeError {
                bridgeResponse = ["ok": false, "error": err.message]
            } catch {
                bridgeResponse = ["ok": false, "error": String(describing: error)]
            }
        } else {
            bridgeResponse = ["ok": false, "error": "Invalid message format"]
        }

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: bridgeResponse]
        } else {
            response.userInfo = ["message": bridgeResponse]
        }

        context.completeRequest(returningItems: [ response ], completionHandler: nil)
    }

}
