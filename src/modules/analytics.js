/**
 * Google Analytics 4 — Measurement Protocol
 * Uses direct HTTP fetch instead of gtag.js (CSP-compliant for MV3 extensions)
 *
 * To complete setup:
 *  1. Go to GA4 → Admin → Data Streams → your stream
 *  2. Click "Measurement Protocol API secrets" → Create
 *  3. Paste the generated secret below as GA4_API_SECRET
 */

const GA4_MEASUREMENT_ID = 'G-LKJ6035SVE';
const GA4_API_SECRET = 'PASTE_YOUR_API_SECRET_HERE'; // TODO: fill this in from GA4 admin
const GA4_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

// ─── Helper functions ──────────────────────────────────────────────────────────
const hashId = (prefix, id) => `${prefix}_${id}`.substring(0, 20);
const truncate = (str, len = 50) => String(str || '').substring(0, len);

const normalizeDomain = (domain) => {
    if (!domain) return 'unknown';
    try {
        return new URL(domain).hostname || domain;
    } catch {
        return truncate(domain, 50);
    }
};

const hashBookmarkId = (id) => hashId('bm', id);
const hashFolderId = (id) => hashId('fld', id);

// ─── Per-session client ID (stored in session storage for GA4 identity) ────────
function getClientId() {
    let cid = sessionStorage.getItem('ga4_cid');
    if (!cid) {
        cid = `${Date.now()}.${Math.floor(Math.random() * 1e9)}`;
        sessionStorage.setItem('ga4_cid', cid);
    }
    return cid;
}

// Cache static context once on load
const staticContext = {
    extension_id: chrome.runtime?.id,
    extension_version: chrome.runtime?.getManifest?.()?.version || 'unknown',
    user_agent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
};

/**
 * Base event tracker — sends directly to GA4 Measurement Protocol
 * No external script, no CSP violations.
 */
export function trackEvent(eventName, eventData = {}) {
    if (!GA4_API_SECRET || GA4_API_SECRET === 'PASTE_YOUR_API_SECRET_HERE') return;
    const payload = {
        client_id: getClientId(),
        events: [{
            name: eventName,
            params: {
                ...eventData,
                ...staticContext,
                timestamp_micros: Date.now() * 1000
            }
        }]
    };
    // fire-and-forget, non-blocking
    fetch(GA4_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
    }).catch(() => {}); // silently ignore network errors
}

// ─── View Events ───────────────────────────────────────────────────────────────
export function trackPageView(viewType) {
    trackEvent('page_view', {
        page_title: viewType,
        page_location: window.location.href,
        view_type: viewType
    });
}

// ─── Search Events ─────────────────────────────────────────────────────────────
export function trackSearch(searchTerm, resultsCount, searchMode = 'bookmarks') {
    trackEvent('search', {
        search_term: searchTerm,
        results_count: resultsCount,
        search_mode: searchMode,
        search_term_length: searchTerm.length,
        is_empty_search: !searchTerm?.trim()
    });
}

export function trackSearchModeSwitch(fromMode, toMode) {
    trackEvent('search_mode_changed', { from_mode: fromMode, to_mode: toMode });
}

// ─── Bookmark Interaction Events ───────────────────────────────────────────────
export function trackBookmarkOpened(bookmarkId, title, domain, source = 'card') {
    trackEvent('bookmark_opened', {
        bookmark_id: hashBookmarkId(bookmarkId),
        title_length: title?.length || 0,
        domain: normalizeDomain(domain),
        source
    });
}

export function trackBookmarkAdded(folderId, folderDepth = 0) {
    trackEvent('bookmark_added', {
        folder_id: hashFolderId(folderId),
        folder_depth: folderDepth
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
    trackEvent('bookmark_recaptured', { bookmark_id: hashBookmarkId(bookmarkId) });
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
    trackEvent('grid_view_changed', { columns });
}

export function trackSortChanged(sortMode) {
    trackEvent('sort_changed', { sort_mode: sortMode });
}

export function trackSettingsChanged(settingName, oldValue, newValue) {
    trackEvent('setting_changed', {
        setting_name: settingName,
        old_value: String(oldValue),
        new_value: String(newValue)
    });
}

export function trackThemeToggled(theme) {
    trackEvent('theme_toggled', { theme });
}

// ─── Modal Events ──────────────────────────────────────────────────────────────
export function trackModalOpened(modalType) {
    trackEvent('modal_opened', { modal_type: modalType });
}

export function trackModalClosed(modalType, action = 'close') {
    trackEvent('modal_closed', { modal_type: modalType, action });
}

// ─── Feature Usage Events ──────────────────────────────────────────────────────
export function trackScreenshotCapture(bookmarkId, duration = 0) {
    trackEvent('screenshot_captured', {
        bookmark_id: hashBookmarkId(bookmarkId),
        capture_duration_ms: duration
    });
}

// ─── Keyboard Shortcuts ────────────────────────────────────────────────────────
export function trackKeyboardShortcut(shortcutKey, action) {
    trackEvent('keyboard_shortcut_used', { shortcut_key: shortcutKey, action });
}

// ─── Engagement Events ─────────────────────────────────────────────────────────
export function trackButtonClicked(buttonId, buttonText = '') {
    trackEvent('button_clicked', {
        button_id: buttonId,
        button_text: truncate(buttonText, 50)
    });
}

export function trackError(errorType, errorMessage, context = {}) {
    trackEvent('error_occurred', {
        error_type: errorType,
        error_message: truncate(errorMessage, 100),
        ...context
    });
}

// ─── Session Tracking ──────────────────────────────────────────────────────────
export function initSessionTracking() {
    trackEvent('session_start');

    const isPopover = new URLSearchParams(window.location.search).get('mode') === 'popover';
    trackPageView(isPopover ? 'popover' : 'new-tab');

    window.addEventListener('beforeunload', () => {
        trackEvent('session_end');
    });
}
