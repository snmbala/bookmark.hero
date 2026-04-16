
let bookmarkCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5000;

export function debounce(func, wait) {
    let timeout;
    const fn = (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
    fn.cancel = () => clearTimeout(timeout);
    return fn;
}

export function getCachedBookmarks() {
    const now = Date.now();
    if (bookmarkCache.data && now - bookmarkCache.timestamp < CACHE_TTL)
        return Promise.resolve(bookmarkCache.data);
    return new Promise(resolve =>
        chrome.bookmarks.getTree(bookmarks => {
            bookmarkCache = { data: bookmarks, timestamp: now };
            resolve(bookmarks);
        })
    );
}

export function invalidateCache() {
    bookmarkCache = { data: null, timestamp: 0 };
}

export function collectBookmarks(node, out, folderName = "") {
    if (node.children) {
        for (const child of node.children) collectBookmarks(child, out, node.title);
    } else {
        out.push({ bookmark: node, folder: folderName });
    }
}

function getDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

const SORT_COMPARATORS = {
    title:  (a, b) => (a.bookmark.title || "").localeCompare(b.bookmark.title || ""),
    domain: (a, b) => getDomain(a.bookmark.url).localeCompare(getDomain(b.bookmark.url)),
    "recently-added": (a, b) => (b.bookmark.dateAdded || 0) - (a.bookmark.dateAdded || 0),
};

function sortBookmarks(bookmarks, sortBy) {
    return [...bookmarks].sort(SORT_COMPARATORS[sortBy] || SORT_COMPARATORS["recently-added"]);
}

// Keep named exports for backward compatibility
export const sortBookmarksByTitle  = bm => sortBookmarks(bm, "title");
export const sortBookmarksByDomain = bm => sortBookmarks(bm, "domain");

export function containsSearchTerm(text, searchTerm) {
    if (!text || !searchTerm) return false;
    const lower = text.toLowerCase();
    return searchTerm.toLowerCase().split(" ").every(t => lower.includes(t));
}

export function filterBookmarks(allBookmarks, searchTerm, filterIds, sortBy = "recently-added") {
    const hasFilter = filterIds && filterIds.length > 0;
    return sortBookmarks(allBookmarks, sortBy).filter(({ bookmark }) => {
        const matchesSearch = !searchTerm ||
            containsSearchTerm(bookmark.title, searchTerm) ||
            containsSearchTerm(bookmark.url, searchTerm);
        return matchesSearch && (!hasFilter || filterIds.some(id => bookmark.parentId == id));
    });
}

export function expandFolderIds(filterIds, tree) {
    if (!filterIds || filterIds.length === 0) return new Set();
    const selected = new Set(filterIds.map(String));
    const result = new Set();
    const walk = (nodes, inherited) => {
        for (const node of nodes) {
            if (node.url) continue;
            const include = inherited || selected.has(String(node.id));
            if (include) result.add(String(node.id));
            if (node.children) walk(node.children, include);
        }
    };
    if (tree?.[0]) walk(tree[0].children, false);
    return result;
}

function groupEntries(allBookmarks, keyFn) {
    const map = new Map();
    for (const entry of allBookmarks) {
        const key = keyFn(entry);
        if (!key) continue;
        (map.get(key) || (map.set(key, []), map.get(key))).push(entry);
    }
    return [...map.values()].filter(g => g.length > 1);
}

export function findDuplicateBookmarks(allBookmarks) {
    return groupEntries(allBookmarks, e => e.bookmark.url);
}

export function findSameDomainGroups(allBookmarks) {
    const getHostname = url => { try { return new URL(url).hostname; } catch { return ""; } };
    return groupEntries(allBookmarks, e => getHostname(e.bookmark.url) || null)
        .map(g => g.slice().sort((a, b) => (a.bookmark.dateAdded || 0) - (b.bookmark.dateAdded || 0)));
}
