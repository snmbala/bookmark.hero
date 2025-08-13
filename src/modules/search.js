// Search functionality
import { containsSearchTerm } from './bookmarkUtils.js';

export function initializeSearch(searchInput, clearSearch, searchIcon, refreshCallback) {
    searchInput.addEventListener("input", function () {
        if (searchInput.value) {
            clearSearch.classList.remove("hidden");
            if (document.activeElement === searchInput) {
                searchIcon.src = "../assets/icons/search-blue.svg";
            } else {
                searchIcon.src = "../assets/icons/search.svg";
            }
            const searchTerm = searchInput.value.trim().toLowerCase();
            refreshCallback(searchTerm);
        } else {
            clearSearch.classList.add("hidden");
            searchIcon.src = "../assets/icons/search.svg";
            refreshCallback("");
        }
    });

    clearSearch.addEventListener("click", function () {
        searchInput.value = "";
        clearSearch.classList.add("hidden");
        searchIcon.src = "../assets/icons/search.svg";
        refreshCallback("");
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "/" && document.activeElement !== searchInput) {
            event.preventDefault();
            searchInput.focus();
        }
    });
}

export function setupSearchListeners(filterOptions, displayCallback) {
    const searchInput = document.getElementById('search-input');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value;
            const filterId = document.getElementById('filter-select')?.value || 0;
            if (displayCallback) {
                displayCallback(searchTerm, filterId, filterOptions);
            }
        });
        
        // Clear search on Escape
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                this.value = '';
                const filterId = document.getElementById('filter-select')?.value || 0;
                if (displayCallback) {
                    displayCallback('', filterId, filterOptions);
                }
            }
        });
    }
}
