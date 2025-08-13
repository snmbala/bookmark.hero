// Bookmark utilities
export function collectBookmarks(node, folderName = "") {
    const bookmarks = [];
    if (node.children) {
        folderName = node.title;
        for (const child of node.children) {
            bookmarks.push(...collectBookmarks(child, folderName));
        }
    } else {
        bookmarks.push({ bookmark: node, folder: folderName });
    }
    return bookmarks;
}

export function sortBookmarksByRecent(allBookmarks) {
    return allBookmarks.sort((a, b) => {
        const lastVisitedA = a.bookmark.dateLastUsed || a.bookmark.dateAdded;
        const lastVisitedB = b.bookmark.dateLastUsed || b.bookmark.dateAdded;
        return lastVisitedB - lastVisitedA;
    });
}

export function countBookmarksRecursive(node, searchTerm) {
    let count = 0;
    if (node.children) {
        for (const child of node.children) {
            count += countBookmarksRecursive(child, searchTerm);
        }
    } else if (node.url) {
        const matchesSearch = !searchTerm ||
            containsSearchTerm(node.title, searchTerm) ||
            containsSearchTerm(node.url, searchTerm);
        if (matchesSearch) count++;
    }
    return count;
}

export function countItemsInFolder(folderNode, searchTerm, filterId, filterOptions) {
    let count = 0;
    
    if (!folderNode.children) {
        return 0;
    }
    
    if (filterId && filterId !== 0 && filterId !== "all") {
        const filterOption = filterOptions.find(option => option.value == filterId);
        if (filterOption) {
            if (folderNode.id !== filterId) {
                const isParentOfFilter = filterOption.id && filterOption.id.includes(`-${folderNode.id}-`);
                if (!isParentOfFilter) {
                    return 0;
                }
            }
        }
    }
    
    folderNode.children.forEach(child => {
        if (child.children) {
            count += countItemsInFolder(child, searchTerm, filterId, filterOptions);
        } else if (child.url) {
            const matchesSearch = !searchTerm || 
                containsSearchTerm(child.title, searchTerm) || 
                containsSearchTerm(child.url, searchTerm);
            
            if (matchesSearch) {
                count++;
            }
        }
    });
    
    return count;
}

export function containsSearchTerm(text, searchTerm) {
    const searchTerms = searchTerm.split(" ");
    return searchTerms.every((term) => text.toLowerCase().includes(term));
}

export function matchesSearch(bookmark, searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') return true;
    
    const term = searchTerm.toLowerCase();
    const title = (bookmark.title || '').toLowerCase();
    const url = (bookmark.url || '').toLowerCase();
    
    return title.includes(term) || url.includes(term);
}

export function highlightText(text, searchTerm) {
    if (!searchTerm || !text) {
        return text;
    }

    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    
    let highlightedText = text;
    
    searchWords.forEach(word => {
        const regex = new RegExp(`(${word})`, 'gi');
        highlightedText = highlightedText.replace(regex, 
            '<mark class="bg-yellow-200 dark:bg-yellow-600 dark:text-zinc-100 px-0.5 rounded-sm">$1</mark>'
        );
    });
    
    return highlightedText;
}

export function deleteBookmark(bookmarkNode, allBookmarks, refreshCallback) {
    const key = bookmarkNode.url;
    chrome.bookmarks.remove(bookmarkNode.id, function() {
        console.log(`Deleted bookmark: ${bookmarkNode.title}`);

        chrome.storage.local.remove([key], function() {
            // Remove from allBookmarks array
            const updatedBookmarks = allBookmarks.filter(b => 
                b.bookmark.id !== bookmarkNode.id
            );
            
            refreshCallback(updatedBookmarks);
        });
    });
}
