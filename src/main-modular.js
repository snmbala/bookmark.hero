// Import all modules
import { initializeTheme, toggleTheme } from './modules/theme.js';
import { populateFilterDropdown, updateClearFilterButton } from './modules/filter.js';
import { setupSearchListeners } from './modules/search.js';
import { initializeViewMode, setupViewControls } from './modules/viewMode.js';
import { displayBookmarks } from './modules/uiRender.js';

// Main entry point
chrome.bookmarks.getTree(function (bookmarks) {
    const folderList = document.getElementById("folder-list");
    const searchInput = document.getElementById("search-input");
    const clearSearch = document.getElementById("clear-search");
    const searchIcon = document.getElementById("search-icon");
    const filterDropdown = document.getElementById("filter");
    const folderViewButton = document.getElementById("folder-view");
    const recentsViewButton = document.getElementById("recents-view");
    const recentsIconSvg = document.getElementById("recents-icon");
    const settingsButton = document.getElementById("settings-btn");

    let FILTER_ID = 0;
    let gridViewEnabled = true;
    let allBookmarks = [];
    let filterOptions = [];

    // Initialize theme handlers
    initializeTheme();

    // Settings modal handling
    let settingsModalOpen = false;
    const settingsModal = document.getElementById("settings-modal");
    settingsButton.addEventListener("click", function (event) {
        event.stopPropagation();
        settingsModal.classList.toggle("hidden");
        settingsModalOpen = !settingsModal.classList.contains("hidden");
    });
    settingsModal.addEventListener("click", function (event) {
        event.stopPropagation();
    });
    document.addEventListener("click", function () {
        if (settingsModalOpen && !settingsModal.classList.contains("hidden")) {
            settingsModal.classList.add("hidden");
            settingsModalOpen = false;
        }
    });

    // Collect bookmarks function
    function collectBookmarks(node, folderName = "") {
        if (node.children) {
            folderName = node.title;
            for (const child of node.children) {
                collectBookmarks(child, folderName);
            }
        } else {
            allBookmarks.push({ bookmark: node, folder: folderName });
        }
    }

    // Populate allBookmarks array
    for (const node of bookmarks[0].children) {
        collectBookmarks(node);
    }

    // Sort bookmarks based on recently used
    let sortedBookmarks = allBookmarks.sort((a, b) => {
        const lastVisitedA = a.bookmark.dateLastUsed || a.bookmark.dateAdded;
        const lastVisitedB = b.bookmark.dateLastUsed || b.bookmark.dateAdded;
        return lastVisitedB - lastVisitedA;
    });

    // Initialize filter dropdown and get filter options
    filterOptions = populateFilterDropdown(bookmarks);
    
    // Initialize display
    displayBookmarks('', 0, filterOptions);
    initializeViewMode();

    // Setup event listeners
    setupEventListeners();

    function setupEventListeners() {
        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }

        // Search functionality
        setupSearchListeners(filterOptions);

        // Filter functionality
        const filterSelect = document.getElementById('filter-select');
        if (filterSelect) {
            filterSelect.addEventListener('change', function() {
                const filterId = this.value;
                const searchTerm = document.getElementById('search-input')?.value || '';
                displayBookmarks(searchTerm, filterId, filterOptions);
                updateClearFilterButton(filterId);
            });
        }

        // Clear filter button
        const clearFilterBtn = document.getElementById('clear-filter');
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function() {
                const filterSelect = document.getElementById('filter-select');
                if (filterSelect) {
                    filterSelect.value = 0;
                    const searchTerm = document.getElementById('search-input')?.value || '';
                    displayBookmarks(searchTerm, 0, filterOptions);
                    updateClearFilterButton(0);
                }
            });
        }

        // View mode controls
        setupViewControls('', 0, filterOptions);

        // Search input handling (legacy compatibility)
        if (searchInput) {
            searchInput.addEventListener("input", function () {
                if (searchInput.value) {
                    clearSearch.classList.remove("hidden");
                    if (document.activeElement === searchInput) {
                        searchIcon.src = "assets/icons/search-blue.svg";
                    } else {
                        searchIcon.src = "assets/icons/search.svg";
                    }
                    const searchTerm = searchInput.value.trim().toLowerCase();
                    displayBookmarks(searchTerm, FILTER_ID, filterOptions);
                } else {
                    clearSearch.classList.add("hidden");
                    searchIcon.src = "assets/icons/search.svg";
                    displayBookmarks('', FILTER_ID, filterOptions);
                }
            });
        }

        if (clearSearch) {
            clearSearch.addEventListener("click", function () {
                searchInput.value = "";
                clearSearch.classList.add("hidden");
                searchIcon.src = "assets/icons/search.svg";
                displayBookmarks('', FILTER_ID, filterOptions);
            });
        }

        // Keyboard shortcuts
        document.addEventListener("keydown", function (event) {
            if (event.key === "/" && document.activeElement !== searchInput) {
                event.preventDefault();
                searchInput.focus();
            }
            if (event.key === "Escape" && document.activeElement === searchInput) {
                searchInput.blur();
            }
        });

        // Initialize filter state
        updateClearFilterButton(0);
    }

    // Legacy filter update function for compatibility
    function updateFilterIcon() {
        const filterSelect = document.getElementById('filter');
        const chevron = document.getElementById('filter-dropdown-arrow');
        const clearIcon = document.getElementById('filter-clear');
        
        if (filterSelect && chevron && clearIcon) {
            if (filterSelect.value && filterSelect.value !== 'all') {
                chevron.classList.add('hidden');
                clearIcon.classList.remove('hidden');
            } else {
                chevron.classList.remove('hidden');
                clearIcon.classList.add('hidden');
            }
        }
    }

    // Initialize legacy filter icon and add clear functionality
    setTimeout(() => {
        const filterSelect = document.getElementById('filter');
        const clearIcon = document.getElementById('filter-clear');
        
        updateFilterIcon();
        
        if (clearIcon) {
            clearIcon.addEventListener('click', function () {
                if (filterSelect) {
                    filterSelect.value = 'all';
                    FILTER_ID = 0;
                    updateFilterIcon();
                    
                    const searchTerm = searchInput.value.trim().toLowerCase();
                    displayBookmarks(searchTerm, 0, filterOptions);
                }
            });
        }
    }, 100);
});
