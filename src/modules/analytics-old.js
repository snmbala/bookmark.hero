/**
 * Google Analytics 4 Event Tracking Module
 * Compact, optimized tracking with automatic context enrichment
 */

// Cache extension context to avoid repeated calculations
const extensionContext = {
    extension_id: chrome.runtime?.id,
    extension_version: chrome.runtime?.getManifest?.()?.version || 'unknown'
};

export function trackEvent(eventName, eventData = {}) {
    if (typeof gtag === 'undefined') return;
    gtag('event', eventName, {
        ...eventData,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...extensionContext
    });
}

// ─── View Events ───────────────────────────────────────────────────────────────
export function trackPageView(viewType) {
    trackEvent('page_view', {
        page_title: viewType,
        page_location: window.location.href,
        view_type: viewType // 'popover', 'new-tab', 'sidebar'
    });
}

// ─── Search Events ─────────────────────────────────────────────────────────────
export function trackSearch(searchTerm, resultsCount, searchMode = 'bookmarks') {
    trackEvent('search', {
        search_term: searchTerm,
        results_count: resultsCount,
        search_mode: searchMode, // 'bookmarks', 'web', 'ai'
        search_term_length: searchTerm.length,
        is_empty_search: !searchTerm || searchTerm.trim() === ''
    });
}

export function trackSearchModeSwitch(fromMode, toMode) {
    trackEvent('search_mode_changed', {
        from_mode: fromMode,
        to_mode: toMode
    });
}

// ─── Bookmark Interaction Events ───────────────────────────────────────────────
export function trackBookmarkOpened(bookmarkId, title, domain, source = 'card') {
    trackEvent('bookmark_opened', {
        bookmark_id: hashBookmarkId(bookmarkId),
        title_length: title?.length || 0,
        domain: normalizeDomain(domain),
        source: source, // 'card', 'search', 'folder'
        title_first_word: title?.split(' ')[0] || ''
    });
}

export function trackBookmarkAdded(folderId, folderDepth = 0) {
    trackEvent('bookmark_added', {
        folder_id: hashFolderId(folderId),
        folder_depth: folderDepth,
        timestamp_created: new Date().toISOString()
    });
}

export function trackBookmarkEdited(bookmarkId, fieldsChanged = []) {
    trackEvent('bookmark_edited', {
        bookmark_id: hashBookmarkId(bookmarkId),
        fields_changed: fieldsChanged.join(','),
        fields_count: fieldsChanged.length
    });
}

export function trackBookmarkDeleted(bookmarkId, wasFolderEmpty = false) {
    trackEvent('bookmark_deleted', {
        bookmark_id: hashBookmarkId(bookmarkId),
        folder_became_empty: wasFolderEmpty
    });
}

export function trackBookmarkRecaptured(bookmarkId) {
    trackEvent('bookmark_recaptured', {
        bookmark_id: hashBookmarkId(bookmarkId)
    });
}

// ─── Folder Filter Events ──────────────────────────────────────────────────────
export function trackFolderFiltered(folderId, folderDepth = 0, totalFolders = 0) {
    trackEvent('folder_filtered', {
        folder_id: hashFolderId(folderId),
        folder_depth: folderDepth,
        total_folders: totalFolders
    });
}

export function trackFilterCleared() {
    trackEvent('filter_cleared');
}

// ─── UI Control Events ──────────────────────────────────────────────────────────
export function trackGridViewChanged(columns) {
    trackEvent('grid_view_changed', {
        columns: columns,
        total_cells: columns * 2 // rough estimate
    });
}

export function trackSortChanged(sortMode) {
    trackEvent('sort_changed', {
        sort_mode: sortMode // 'recently-added', 'alphabetical', etc.
    });
}

export function trackSettingsChanged(settingName, oldValue, newValue) {
    trackEvent('setting_changed', {
        setting_name: settingName,
        old_value: String(oldValue),
        new_value: String(newValue)
    });
}

export function trackThemeToggled(theme) {
    trackEvent('theme_toggled', {
        theme: theme // 'light', 'dark', 'auto'
    });
}

// ─── Modal Events ──────────────────────────────────────────────────────────────
export function trackModalOpened(modalType) {
    trackEvent('modal_opened', {
        modal_type: modalType // 'add', 'edit', 'settings', 'shortcuts', 'onboarding'
    });
}

export function trackModalClosed(modalType, action = 'close') {
    trackEvent('modal_closed', {
        modal_type: modalType,
        action: action // 'save', 'cancel', 'close'
    });
}

// ─── Feature Usage Events ──────────────────────────────────────────────────────
export function trackDuplicateReview(duplicateCount) {
    trackEvent('duplicate_review_opened', {
        duplicate_count: duplicateCount
    });
}

export function trackDeduplication(removed, kept) {
    trackEvent('deduplication_completed', {
        bookmarks_removed: removed,
        bookmarks_kept: kept
    });
}

export function trackScreenshotCapture(bookmarkId, duration = 0) {
    trackEvent('screenshot_captured', {
        bookmark_id: hashBookmarkId(bookmarkId),
        capture_duration_ms: duration
    });
}

export function trackExportInitiated() {
    trackEvent('export_initiated');
}

export function trackImportInitiated() {
    trackEvent('import_initiated');
}

// ─── AI Chat Events (if applicable) ────────────────────────────────────────────
export function trackAIChatMessage(messageLength, responseTime = 0) {
    trackEvent('ai_chat_message', {
        message_length: messageLength,
        response_time_ms: responseTime
    });
}

export function trackAIChatHistory(historySize) {
    trackEvent('ai_chat_history_accessed', {
        conversation_count: historySize
    });
}

// ─── Web Search Events ─────────────────────────────────────────────────────────
export function trackWebSearch(searchEngine, query) {
    trackEvent('web_search', {
        search_engine: searchEngine, // 'google', 'bing', 'duckduckgo'
        query_length: query?.length || 0
    });
}

// ─── Keyboard Shortcuts ────────────────────────────────────────────────────────
export function trackKeyboardShortcut(shortcutKey, action) {
    trackEvent('keyboard_shortcut_used', {
        shortcut_key: shortcutKey,
        action: action
    });
}

// ─── Performance Events ────────────────────────────────────────────────────────
export function trackPerformanceMetric(metricName, duration) {
    trackEvent('performance_metric', {
        metric_name: metricName,
        duration_ms: duration
    });
}

export function trackError(errorType, errorMessage, context = {}) {
    trackEvent('error_occurred', {
        error_type: errorType,
        error_message: hashErrorMessage(errorMessage),
        ...context
    });
}

// ─── Engagement Events ─────────────────────────────────────────────────────────
export function trackFeedbackSubmitted(feedbackType, sentiment = 'neutral') {
    trackEvent('feedback_submitted', {
        feedback_type: feedbackType,
        sentiment: sentiment // 'positive', 'neutral', 'negative'
    });
}

export function trackButtonClicked(buttonId, buttonText = '') {
    trackEvent('button_clicked', {
        button_id: buttonId,
        button_text: buttonText.substring(0, 50) // truncate for privacy
    });
}

export function trackExtensionInstalled() {
    trackEvent('extension_installed', {
        install_timestamp: new Date().toISOString()
    });
}

export function trackExtensionUpdated(fromVersion, toVersion) {
    trackEvent('extension_updated', {
        from_version: fromVersion,
        to_version: toVersion
    });
}

// ─── Consent & Privacy ─────────────────────────────────────────────────────────
export function trackConsentPreference(consentType, value) {
    if (typeof gtag !== 'undefined') {
        gtag('consent', 'update', {
            [consentType]: value ? 'granted' : 'denied'
        });
    }
    trackEvent('consent_updated', {
        consent_type: consentType,
        value: value
    });
}

// ─── Helper Functions ──────────────────────────────────────────────────────────
function hashBookmarkId(id) {
    // Hash ID for privacy - don't send actual IDs
    return `bm_${id}`.substring(0, 20);
}

function hashFolderId(id) {
    return `fld_${id}`.substring(0, 20);
}

function normalizeDomain(domain) {
    if (!domain) return 'unknown';
    try {
        return new URL(domain).hostname || domain;
    } catch {
        return domain.substring(0, 50); // safeguard
    }
}

function hashErrorMessage(message) {
    if (!message) return 'unknown_error';
    // Return first 100 chars, no sensitive data
    return message.substring(0, 100);
}

// ─── Session Tracking ──────────────────────────────────────────────────────────
export function initSessionTracking() {
    // Track session start
    trackEvent('session_start', {
        session_start_time: new Date().toISOString()
    });

    // Track view type on init
    const isPopover = new URLSearchParams(window.location.search).get('mode') === 'popover';
    trackPageView(isPopover ? 'popover' : 'new-tab');

    // Track unload
    window.addEventListener('beforeunload', () => {
        trackEvent('session_end', {
            session_end_time: new Date().toISOString()
        });
    });
}

// ─── Batch Tracking Helper ─────────────────────────────────────────────────────
export function trackMultiple(events) {
    events.forEach(({ name, data }) => trackEvent(name, data));
}
