// View management for grid/list modes and view controls

export function initializeViewMode() {
    // For now, default to grid view since there's no view-select in the HTML
    // The original code used different view buttons (recents-view, folder-view)
    const defaultViewMode = 'grid';
    applyViewMode(defaultViewMode);
}

export function setupViewControls(searchTerm, filterId, filterOptions, displayCallback) {
    // This function can be expanded later to handle the actual view buttons
    // For now, just ensure we have basic functionality
    console.log('View controls setup - using default grid view');
}

function applyViewMode(viewMode) {
    const bookmarksContainer = document.getElementById('bookmarks-container');
    const gridIcon = document.getElementById('grid-icon');
    const listIcon = document.getElementById('list-icon');
    
    if (bookmarksContainer) {
        bookmarksContainer.classList.remove('grid-view', 'list-view');
        bookmarksContainer.classList.add(`${viewMode}-view`);
    }
    
    if (gridIcon && listIcon) {
        if (viewMode === 'grid') {
            gridIcon.style.display = 'block';
            listIcon.style.display = 'none';
        } else {
            gridIcon.style.display = 'none';
            listIcon.style.display = 'block';
        }
    }
}
