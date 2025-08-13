// UI utilities and helper functions
import { highlightText, countBookmarksRecursive } from './bookmarkUtils.js';

export function getDynamicTitle(searchTerm, filterId, currentCount, filterOptions) {
    const hasSearch = searchTerm && searchTerm.trim().length > 0;
    const hasFilter = filterId && filterId !== 0 && filterId !== "all";
    
    let folderName = "";
    let folderPath = "";
    
    if (hasFilter) {
        const filterOption = filterOptions.find(option => option.value == filterId);
        if (filterOption) {
            folderName = filterOption.label.replace(/^[\s\-]*/, '');
            folderPath = folderName.includes('- ') ? 
                folderName.replace(/\s*-\s*/g, ' > ') : 
                folderName;
        }
    }
    
    if (hasSearch && hasFilter) {
        if (currentCount === 0) {
            return `No results for "${searchTerm}" in ${folderPath}`;
        }
        return `Results for "${searchTerm}" in ${folderPath} (${currentCount})`;
    } else if (hasSearch) {
        if (currentCount === 0) {
            return `No results for "${searchTerm}"`;
        }
        return `Results for "${searchTerm}" (${currentCount})`;
    } else if (hasFilter) {
        return `Folder: ${folderPath} (${currentCount})`;
    } else {
        return `Bookmarks (${currentCount})`;
    }
}

export function getDynamicSectionTitle(folderNode, searchTerm, filterId) {
    const folderName = folderNode.title;
    const count = countBookmarksRecursive(folderNode, searchTerm);
    const hasSearch = searchTerm && searchTerm.trim().length > 0;
    const isFiltered = filterId && filterId !== 0 && filterId !== "all";
    
    if (count === 0) {
        return null;
    }
    if (hasSearch && isFiltered) {
        return `${folderName} - Results for "${searchTerm}" (${count})`;
    } else if (hasSearch) {
        return `${folderName} - Results for "${searchTerm}" (${count})`;
    } else if (isFiltered) {
        return `${folderName} (${count})`;
    } else {
        return `${folderName} (${count})`;
    }
}

export function computeId(id, filterOptions) {
    const option = filterOptions.find((option) => option.value === id);
    if (!option) {
        console.warn(`No filter option found for bookmark ID: ${id}`);
        return `fallback-${id}`;
    }
    return option.id;
}
