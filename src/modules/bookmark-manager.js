
// Bookmark tree cache for performance
let bookmarkCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5000; // 5 seconds

// Performance optimization: Debounce function with cancellation support
export function debounce(func, wait) {
    let timeout;
    const executedFunction = function (...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };

    executedFunction.cancel = function () {
        clearTimeout(timeout);
    };

    return executedFunction;
}

// Performance optimization: Cached bookmark retrieval
export function getCachedBookmarks() {
    const now = Date.now();
    if (bookmarkCache.data && (now - bookmarkCache.timestamp) < CACHE_TTL) {
        return Promise.resolve(bookmarkCache.data);
    }

    return new Promise((resolve) => {
        chrome.bookmarks.getTree((bookmarks) => {
            bookmarkCache.data = bookmarks;
            bookmarkCache.timestamp = now;
            resolve(bookmarks);
        });
    });
}

// Force-invalidate cache so next getCachedBookmarks() fetches fresh data
export function invalidateCache() {
    bookmarkCache = { data: null, timestamp: 0 };
}

export function collectBookmarks(node, allBookmarks, folderName = "") {
    if (node.children) {
        folderName = node.title;
        for (const child of node.children) {
            collectBookmarks(child, allBookmarks, folderName);
        }
    } else {
        allBookmarks.push({ bookmark: node, folder: folderName });
    }
}

// Sort by most recently added (dateAdded DESC)
function sortByRecentlyAdded(bookmarks) {
    return [...bookmarks].sort((a, b) =>
        (b.bookmark.dateAdded || 0) - (a.bookmark.dateAdded || 0)
    );
}

// Sort alphabetically A → Z
export function sortBookmarksByTitle(bookmarks) {
    return [...bookmarks].sort((a, b) =>
        (a.bookmark.title || "").localeCompare(b.bookmark.title || "")
    );
}

// Sort by domain (hostname)
export function sortBookmarksByDomain(bookmarks) {
    return [...bookmarks].sort((a, b) => {
        let domainA = "", domainB = "";
        try { domainA = new URL(a.bookmark.url).hostname.replace(/^www\./, ""); } catch (_) { }
        try { domainB = new URL(b.bookmark.url).hostname.replace(/^www\./, ""); } catch (_) { }
        return domainA.localeCompare(domainB);
    });
}

export function containsSearchTerm(text, searchTerm) {
    if (!text || !searchTerm) return false;
    const searchTerms = searchTerm.toLowerCase().split(" ");
    return searchTerms.every((term) => text.toLowerCase().includes(term));
}

// sortBy: "recently-added" | "title" | "domain"
// filterIds: string[] of folder ids (empty array = no filter)
export function filterBookmarks(allBookmarks, searchTerm, filterIds, sortBy = "recently-added") {
    let sorted;
    switch (sortBy) {
        case "title":           sorted = sortBookmarksByTitle(allBookmarks); break;
        case "domain":          sorted = sortBookmarksByDomain(allBookmarks); break;
        default:                sorted = sortByRecentlyAdded(allBookmarks); break;
    }

    return sorted.filter((bookmark) => {
        const matchesSearch = !searchTerm ||
            containsSearchTerm(bookmark.bookmark.title, searchTerm) ||
            containsSearchTerm(bookmark.bookmark.url, searchTerm);

        if (filterIds && filterIds.length > 0) {
            const matchesFolder = filterIds.some(id => bookmark.bookmark.parentId == id);
            return matchesSearch && matchesFolder;
        }

        return matchesSearch;
    });
}

// Returns a Set containing every folder ID that is equal to or a descendant of
// any ID in filterIds. Used so that selecting a parent folder also shows bookmarks
// that live inside its sub-folders.
export function expandFolderIds(filterIds, tree) {
    if (!filterIds || filterIds.length === 0) return new Set();
    const selected = new Set(filterIds.map(String));
    const result = new Set();

    function walk(nodes, parentIncluded) {
        for (const node of nodes) {
            if (node.url) continue; // leaf bookmark, not a folder
            const include = parentIncluded || selected.has(String(node.id));
            if (include) result.add(String(node.id));
            if (node.children) walk(node.children, include);
        }
    }

    if (tree && tree[0]) walk(tree[0].children, false);
    return result;
}

// Returns groups of bookmarks that share the same URL
// Returns: Array of arrays — each inner array has 2+ {bookmark, folder} entries
export function findDuplicateBookmarks(allBookmarks) {
    const urlMap = new Map();
    for (const entry of allBookmarks) {
        const url = entry.bookmark.url;
        if (!url) continue;
        if (!urlMap.has(url)) urlMap.set(url, []);
        urlMap.get(url).push(entry);
    }
    return Array.from(urlMap.values()).filter(group => group.length > 1);
}

// Returns groups of bookmarks that share the same domain (hostname)
// Each group is sorted by dateAdded ascending (oldest first)
export function findSameDomainGroups(allBookmarks) {
    const domainMap = new Map();
    for (const entry of allBookmarks) {
        const url = entry.bookmark.url;
        if (!url) continue;
        try {
            const hostname = new URL(url).hostname;
            if (!domainMap.has(hostname)) domainMap.set(hostname, []);
            domainMap.get(hostname).push(entry);
        } catch (e) { /* skip invalid URLs */ }
    }
    return Array.from(domainMap.values())
        .filter(group => group.length > 1)
        .map(group => group.slice().sort((a, b) => (a.bookmark.dateAdded || 0) - (b.bookmark.dateAdded || 0)));
}
