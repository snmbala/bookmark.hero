// Main UI rendering functions for bookmarks display
import { getDynamicTitle, getDynamicSectionTitle, computeId } from './uiUtils.js';
import { countBookmarksRecursive, matchesSearch, highlightText } from './bookmarkUtils.js';
import { createPopupMenu, addContextMenuToBookmark } from './popup.js';

export function displayBookmarks(searchTerm = '', filterId = 0, filterOptions = []) {
    chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
        const bookmarksContainer = document.getElementById('folder-list');
        
        if (!bookmarksContainer) {
            console.error('Required DOM elements not found - folder-list container');
            return;
        }
        
        bookmarksContainer.innerHTML = '';
        
        const rootNode = bookmarkTreeNodes[0];
        let currentCount = 0;
        
        // Default to grid view for now since there's no view-select dropdown
        const currentViewMode = 'grid';
        
        if (filterId && filterId !== 0 && filterId !== "all") {
            chrome.bookmarks.getSubTree(filterId.toString(), function(subtree) {
                if (subtree && subtree.length > 0) {
                    const folderNode = subtree[0];
                    currentCount = countBookmarksRecursive(folderNode, searchTerm);
                    
                    // Create and add dynamic title
                    const titleElement = document.createElement('h1');
                    titleElement.textContent = getDynamicTitle(searchTerm, filterId, currentCount, filterOptions);
                    titleElement.className = "flex-start w-full font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50";
                    bookmarksContainer.appendChild(titleElement);
                    
                    renderFolderContents(bookmarksContainer, folderNode, searchTerm, currentViewMode);
                }
            });
        } else {
            currentCount = renderAllBookmarks(bookmarksContainer, rootNode, searchTerm, filterId, currentViewMode);
            
            // Create and add dynamic title  
            const titleElement = document.createElement('h1');
            titleElement.textContent = getDynamicTitle(searchTerm, filterId, currentCount, filterOptions);
            titleElement.className = "flex-start w-full font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50";
            bookmarksContainer.insertBefore(titleElement, bookmarksContainer.firstChild);
        }
    });
}

function renderAllBookmarks(container, rootNode, searchTerm, filterId, viewMode) {
    let totalCount = 0;
    
    function traverseNodes(nodes, currentPath = '') {
        nodes.forEach(node => {
            if (node.children) {
                if (node.title && node.title !== 'Bookmarks Bar' && node.title !== 'Other Bookmarks' && node.title !== 'Mobile Bookmarks') {
                    const sectionTitle = getDynamicSectionTitle(node, searchTerm, filterId);
                    if (sectionTitle) {
                        const sectionElement = createSectionElement(sectionTitle);
                        container.appendChild(sectionElement);
                    }
                }
                traverseNodes(node.children, currentPath ? `${currentPath} > ${node.title}` : node.title);
            } else if (node.url && matchesSearch(node, searchTerm)) {
                const bookmarkElement = createBookmarkElement(node, searchTerm, viewMode);
                container.appendChild(bookmarkElement);
                totalCount++;
            }
        });
    }
    
    traverseNodes(rootNode.children);
    return totalCount;
}

function renderFolderContents(container, folderNode, searchTerm, viewMode) {
    let count = 0;
    
    function renderBookmarks(nodes) {
        nodes.forEach(node => {
            if (node.children) {
                if (node.title) {
                    const sectionTitle = getDynamicSectionTitle(node, searchTerm, null);
                    if (sectionTitle) {
                        const sectionElement = createSectionElement(sectionTitle);
                        container.appendChild(sectionElement);
                    }
                }
                renderBookmarks(node.children);
            } else if (node.url && matchesSearch(node, searchTerm)) {
                const bookmarkElement = createBookmarkElement(node, searchTerm, viewMode);
                container.appendChild(bookmarkElement);
                count++;
            }
        });
    }
    
    if (folderNode.children) {
        renderBookmarks(folderNode.children);
    }
    
    return count;
}

function createSectionElement(title) {
    const sectionElement = document.createElement('div');
    sectionElement.className = 'section-title text-xl font-bold text-gray-800 dark:text-white mb-4 mt-8 first:mt-0';
    sectionElement.textContent = title;
    return sectionElement;
}

function createBookmarkElement(bookmark, searchTerm, viewMode) {
    const bookmarkElement = document.createElement('div');
    bookmarkElement.className = getBookmarkElementClass(viewMode);
    bookmarkElement.setAttribute('data-id', bookmark.id);
    
    const isGridView = viewMode === 'grid';
    
    bookmarkElement.innerHTML = `
        <div class="bookmark-thumbnail-container">
            ${createThumbnailHTML(bookmark, isGridView)}
        </div>
        <div class="bookmark-content ${isGridView ? 'p-3' : 'flex-1 ml-3'}">
            <div class="bookmark-title ${isGridView ? 'text-sm font-medium text-gray-900 dark:text-white mb-1' : 'text-base font-medium text-gray-900 dark:text-white'} line-clamp-2">
                ${highlightText(bookmark.title, searchTerm)}
            </div>
            <div class="bookmark-url ${isGridView ? 'text-xs text-gray-500 dark:text-gray-400' : 'text-sm text-gray-500 dark:text-gray-400 mt-1'} truncate">
                ${highlightText(bookmark.url, searchTerm)}
            </div>
        </div>
        <div class="bookmark-actions">
            <button class="more-btn p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <img src="assets/icons/more.svg" alt="More" class="w-4 h-4 dark:invert">
            </button>
        </div>
    `;
    
    // Add click handler for opening bookmark
    bookmarkElement.addEventListener('click', function(e) {
        if (!e.target.closest('.more-btn') && !e.target.closest('.popup-menu')) {
            chrome.tabs.create({ url: bookmark.url });
        }
    });
    
    // Add context menu
    addContextMenuToBookmark(bookmarkElement, bookmark);
    
    return bookmarkElement;
}

function getBookmarkElementClass(viewMode) {
    const baseClasses = 'bookmark-item cursor-pointer transition-all duration-200 hover:shadow-md';
    
    if (viewMode === 'grid') {
        return `${baseClasses} bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600`;
    } else {
        return `${baseClasses} bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 flex items-center p-3 mb-2`;
    }
}

function createThumbnailHTML(bookmark, isGridView) {
    const thumbnailSize = isGridView ? 'w-full h-32' : 'w-12 h-12 flex-shrink-0';
    const cornerRadius = isGridView ? 'rounded-t-lg' : 'rounded-lg';
    
    return `
        <div class="bookmark-thumbnail ${thumbnailSize} ${cornerRadius} bg-gray-100 dark:bg-gray-700 overflow-hidden relative">
            <img 
                src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(bookmark.url)}&sz=64" 
                alt="Favicon" 
                class="bookmark-favicon ${isGridView ? 'w-8 h-8 absolute top-2 left-2' : 'w-full h-full object-contain'} rounded"
                loading="lazy"
            >
            ${isGridView ? '<div class="absolute inset-0 bg-gradient-to-b from-transparent to-black/10"></div>' : ''}
        </div>
    `;
}
