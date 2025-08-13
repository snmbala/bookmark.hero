// Popup menu functionality for bookmark context actions
export function createPopupMenu(bookmark) {
    const existingPopup = document.querySelector('.popup-menu');
    if (existingPopup) {
        existingPopup.remove();
    }

    const popup = document.createElement('div');
    popup.className = 'popup-menu absolute right-0 top-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2 z-50 min-w-[150px]';
    
    popup.innerHTML = `
        <button class="popup-item w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" data-action="open">
            <img src="assets/icons/chrome.svg" alt="Open" class="w-4 h-4 mr-2 dark:invert">
            Open
        </button>
        <button class="popup-item w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" data-action="new-tab">
            <img src="assets/icons/chrome.svg" alt="New Tab" class="w-4 h-4 mr-2 dark:invert">
            Open in New Tab
        </button>
        <button class="popup-item w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" data-action="edit">
            <img src="assets/icons/edit.svg" alt="Edit" class="w-4 h-4 mr-2 dark:invert">
            Edit
        </button>
        <div class="border-t border-gray-200 dark:border-gray-600 my-1"></div>
        <button class="popup-item w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center" data-action="delete">
            <img src="assets/icons/trash.svg" alt="Delete" class="w-4 h-4 mr-2">
            Delete
        </button>
    `;

    // Add event listeners for popup actions
    popup.addEventListener('click', function(e) {
        const action = e.target.closest('.popup-item')?.getAttribute('data-action');
        if (action) {
            handlePopupAction(action, bookmark);
            popup.remove();
        }
    });

    return popup;
}

export function addContextMenuToBookmark(bookmarkElement, bookmark) {
    const moreBtn = bookmarkElement.querySelector('.more-btn');
    
    if (moreBtn) {
        moreBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Close any existing popups
            const existingPopup = document.querySelector('.popup-menu');
            if (existingPopup) {
                existingPopup.remove();
                return;
            }
            
            const popup = createPopupMenu(bookmark);
            
            // Position popup relative to the more button
            const btnRect = moreBtn.getBoundingClientRect();
            const bookmarkActions = bookmarkElement.querySelector('.bookmark-actions');
            bookmarkActions.style.position = 'relative';
            bookmarkActions.appendChild(popup);
            
            // Close popup when clicking outside
            setTimeout(() => {
                document.addEventListener('click', function closePopup(e) {
                    if (!popup.contains(e.target) && !moreBtn.contains(e.target)) {
                        popup.remove();
                        document.removeEventListener('click', closePopup);
                    }
                });
            }, 0);
        });
    }
}

function handlePopupAction(action, bookmark) {
    switch (action) {
        case 'open':
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                chrome.tabs.update(tabs[0].id, { url: bookmark.url });
            });
            break;
            
        case 'new-tab':
            chrome.tabs.create({ url: bookmark.url });
            break;
            
        case 'edit':
            showEditDialog(bookmark);
            break;
            
        case 'delete':
            showDeleteConfirmation(bookmark);
            break;
    }
}

function showEditDialog(bookmark) {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    
    dialog.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-[90vw]">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit Bookmark</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                    <input type="text" id="edit-title" value="${bookmark.title}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL</label>
                    <input type="url" id="edit-url" value="${bookmark.url}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                </div>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button id="cancel-edit" class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
                <button id="save-edit" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Save</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Focus on title input
    document.getElementById('edit-title').focus();
    
    // Handle save
    document.getElementById('save-edit').addEventListener('click', function() {
        const newTitle = document.getElementById('edit-title').value;
        const newUrl = document.getElementById('edit-url').value;
        
        chrome.bookmarks.update(bookmark.id, {
            title: newTitle,
            url: newUrl
        }, function() {
            dialog.remove();
            // Refresh the display
            window.location.reload();
        });
    });
    
    // Handle cancel
    document.getElementById('cancel-edit').addEventListener('click', function() {
        dialog.remove();
    });
    
    // Close on outside click
    dialog.addEventListener('click', function(e) {
        if (e.target === dialog) {
            dialog.remove();
        }
    });
}

function showDeleteConfirmation(bookmark) {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    
    dialog.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-[90vw]">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Delete Bookmark</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-6">Are you sure you want to delete "${bookmark.title}"? This action cannot be undone.</p>
            <div class="flex justify-end space-x-3">
                <button id="cancel-delete" class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
                <button id="confirm-delete" class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Delete</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Handle delete
    document.getElementById('confirm-delete').addEventListener('click', function() {
        chrome.bookmarks.remove(bookmark.id, function() {
            dialog.remove();
            // Refresh the display
            window.location.reload();
        });
    });
    
    // Handle cancel
    document.getElementById('cancel-delete').addEventListener('click', function() {
        dialog.remove();
    });
    
    // Close on outside click
    dialog.addEventListener('click', function(e) {
        if (e.target === dialog) {
            dialog.remove();
        }
    });
}
