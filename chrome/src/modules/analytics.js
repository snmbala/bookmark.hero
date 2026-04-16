/**
 * Google Analytics 4 — Measurement Protocol
 * Uses direct HTTP fetch instead of gtag.js (CSP-compliant for MV3 extensions)
 *
 * To complete setup:
 *  1. Go to GA4 → Admin → Data Streams → your stream
 *  2. Click "Measurement Protocol API secrets" → Create
 *  3. Update the config in src/config/ga4-config.js with your credentials
 */

// Import credentials from the canonical config file
import _defaultConfig from '../config/ga4-config.js';

// Dynamic config loading for GA4
let GA4_CONFIG = {
    MEASUREMENT_ID: _defaultConfig.MEASUREMENT_ID || 'G-LKJ6035SVE',
    API_SECRET: _defaultConfig.API_SECRET || '',
    BATCH_SIZE: _defaultConfig.BATCH_SIZE || 50,
    FLUSH_INTERVAL: _defaultConfig.FLUSH_INTERVAL || 5000
};

// Load config from storage or use defaults
async function loadGA4Config() {
    try {
        const stored = await chrome.storage.local.get(['ga4_config']);
        if (stored.ga4_config) {
            GA4_CONFIG = { ...GA4_CONFIG, ...stored.ga4_config };
        }
    } catch (e) {
        console.warn('Could not load GA4 config from storage:', e);
    }
}

loadGA4Config();

// Build endpoint dynamically
function getGA4Endpoint() {
    if (!GA4_CONFIG.API_SECRET) return null;
    return `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_CONFIG.MEASUREMENT_ID}&api_secret=${GA4_CONFIG.API_SECRET}`;
}

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

// ─── Event Queue for Batching ──────────────────────────────────────────────────
const eventQueue = [];
let batchTimer = null;

function flushEventBatch() {
    if (eventQueue.length === 0) return;
    
    const endpoint = getGA4Endpoint();
    if (!endpoint) {
        console.warn('GA4 API secret not configured');
        eventQueue.length = 0;
        return;
    }

    const batch = eventQueue.splice(0, GA4_CONFIG.BATCH_SIZE);
    const payload = {
        client_id: getClientId(),
        events: batch
    };

    fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch((err) => {
        console.debug('Analytics batch send failed:', err);
    });
}

function scheduleFlush() {
    if (batchTimer) clearTimeout(batchTimer);
    if (eventQueue.length >= GA4_CONFIG.BATCH_SIZE) {
        flushEventBatch();
    } else if (eventQueue.length > 0) {
        batchTimer = setTimeout(flushEventBatch, GA4_CONFIG.FLUSH_INTERVAL);
    }
}

// Public flush function for critical events
export function flushAnalytics() {
    flushEventBatch();
}

// ─── Per-session client ID (stored in session storage for GA4 identity) ────────
function getClientId() {
    // Try to get from session storage first
    let cid = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ga4_cid') : null;
    
    if (!cid) {
        // Check localStorage as fallback
        try {
            cid = chrome.storage?.local?.get?.('ga4_cid')?.[0]?.ga4_cid;
        } catch (e) {
            // Fallback to random generation
        }
        
        if (!cid) {
            cid = `${Date.now()}.${Math.floor(Math.random() * 1e9)}`;
        }
        
        // Store for future use
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('ga4_cid', cid);
        }
    }
    
    return cid;
}

// Cache static context once on load
const getStaticContext = () => ({
    extension_id: chrome.runtime?.id,
    extension_version: chrome.runtime?.getManifest?.()?.version || 'unknown',
    user_agent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: navigator.platform,
    screen_resolution: `${screen.width}x${screen.height}`
});

/**
 * Base event tracker — sends directly to GA4 Measurement Protocol
 * Uses batching for better performance and reliability.
 */
export function trackEvent(eventName, eventData = {}) {
    const endpoint = getGA4Endpoint();
    if (!endpoint) return; // Skip if not configured

    eventQueue.push({
        name: eventName,
        params: {
            ...eventData,
            ...getStaticContext(),
            timestamp_micros: Date.now() * 1000,
            event_timestamp: new Date().toISOString()
        }
    });

    scheduleFlush();
}

// ─── View Events ───────────────────────────────────────────────────────────────
export function trackPageView(viewType) {
    trackEvent('page_view', {
        page_title: viewType,
        page_location: window.location.href,
        view_type: viewType,
        is_session_start: isFirstPageView()
    });
}

let _firstPageViewTracked = false;
function isFirstPageView() {
    if (_firstPageViewTracked) return false;
    _firstPageViewTracked = true;
    return true;
}

// ─── Session & Engagement Events ──────────────────────────────────────────────────
export function initSessionTracking() {
    trackEvent('session_start', {
        entry_point: new URLSearchParams(window.location.search).get('mode') || 'new-tab'
    });

    const isPopover = new URLSearchParams(window.location.search).get('mode') === 'popover';
    trackPageView(isPopover ? 'popover' : 'new-tab');

    // Track engagement time
    let engageTimer = null;
    const resetEngageTimer = () => {
        clearTimeout(engageTimer);
        engageTimer = setTimeout(() => {
            trackEvent('user_engagement', {
                engagement_type: 'active_session',
                duration_minutes: 5
            });
        }, 5 * 60 * 1000);
    };

    // Reset timer on user interaction
    ['click', 'keydown', 'scroll'].forEach(evt => {
        document.addEventListener(evt, resetEngageTimer);
    });

    window.addEventListener('beforeunload', () => {
        clearTimeout(engageTimer);
        trackEvent('session_end', {
            exit_point: 'unload'
        });
        flushAnalytics();
    });

    // Periodic activity check
    setInterval(() => {
        trackEvent('session_heartbeat', {
            timestamp: Date.now()
        });
    }, 60000);
}

// ─── Session Duration Tracking ─────────────────────────────────────────────────
let sessionStartTime = Date.now();

export function trackSessionDuration() {
    const duration = Math.round((Date.now() - sessionStartTime) / 1000);
    trackEvent('session_duration', {
        duration_seconds: duration,
        duration_minutes: Math.round(duration / 60)
    });
}

// ─── Search Events ─────────────────────────────────────────────────────────────
export function trackSearch(searchTerm, resultsCount, searchMode = 'bookmarks') {
    trackEvent('search', {
        search_term: truncate(searchTerm, 100),
        results_count: resultsCount,
        search_mode: searchMode,
        search_term_length: searchTerm?.length || 0,
        is_empty_search: !searchTerm?.trim(),
        has_results: resultsCount > 0
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

// ─── Task Completion & Goal Events ────────────────────────────────────────────
export function trackTaskCompletion(taskType, taskName, duration = 0, metadata = {}) {
    trackEvent('task_completed', {
        task_type: taskType, // 'bookmark_management', 'search', 'organization', etc.
        task_name: taskName,
        duration_ms: duration,
        ...metadata
    });
}

export function trackGoalConversion(goalName, goalValue = 1, metadata = {}) {
    trackEvent('goal_conversion', {
        goal_name: goalName,
        goal_value: goalValue,
        ...metadata
    });
}

// ─── User Action Tracking ─────────────────────────────────────────────────────
export function trackUserAction(actionType, actionName, actionDetails = {}) {
    trackEvent('user_action', {
        action_type: actionType,
        action_name: actionName,
        ...actionDetails
    });
}

// ─── Performance Metrics ──────────────────────────────────────────────────────
export function trackPerformanceMetric(metricName, metricValue, unit = 'ms') {
    trackEvent('performance_metric', {
        metric_name: metricName,
        metric_value: metricValue,
        metric_unit: unit
    });
}

export function trackLoadTime(componentName, loadTime) {
    trackEvent('component_load_time', {
        component_name: componentName,
        load_time_ms: loadTime
    });
}

export function trackApiLatency(endpoint, latency, success = true) {
    trackEvent('api_latency', {
        endpoint: truncate(endpoint, 100),
        latency_ms: latency,
        success
    });
}

// ─── Feature Adoption & Usage ─────────────────────────────────────────────────
export function trackFeatureUsage(featureName, usageCount = 1, metadata = {}) {
    trackEvent('feature_usage', {
        feature_name: featureName,
        usage_count: usageCount,
        ...metadata
    });
}

export function trackFeatureDiscovery(featureName, discoveryMethod = 'organic') {
    trackEvent('feature_discovered', {
        feature_name: featureName,
        discovery_method: discoveryMethod // 'organic', 'onboarding', 'notification', etc.
    });
}

// ─── Bookmark Bulk Operations ─────────────────────────────────────────────────
export function trackBulkOperation(operationType, itemCount, duration = 0) {
    trackEvent('bulk_operation', {
        operation_type: operationType, // 'add', 'delete', 'move', 'recapture', etc.
        item_count: itemCount,
        duration_ms: duration,
        avg_time_per_item: itemCount > 0 ? Math.round(duration / itemCount) : 0
    });
}

export function trackBulkCapture(bookmarkCount, successCount, failureCount, totalDuration) {
    trackEvent('bulk_capture_completed', {
        bookmarks_attempted: bookmarkCount,
        bookmarks_success: successCount,
        bookmarks_failed: failureCount,
        success_rate: Math.round((successCount / bookmarkCount) * 100),
        total_duration_ms: totalDuration,
        avg_capture_time_ms: Math.round(totalDuration / bookmarkCount)
    });
}

// ─── Organization & Management ────────────────────────────────────────────────
export function trackFolderOperation(operationType, folderDepth = 0, itemsAffected = 0) {
    trackEvent('folder_operation', {
        operation_type: operationType, // 'create', 'rename', 'move', 'delete'
        folder_depth: folderDepth,
        items_affected: itemsAffected
    });
}

export function trackDuplicateDetection(duplicateCount, actionTaken = 'detected') {
    trackEvent('duplicate_detection', {
        duplicate_count: duplicateCount,
        action_taken: actionTaken, // 'detected', 'removed', 'merged'
    });
}

export function trackSameDomainGrouping(groupCount, totalBookmarks) {
    trackEvent('same_domain_grouping', {
        group_count: groupCount,
        total_bookmarks: totalBookmarks,
        avg_group_size: Math.round(totalBookmarks / groupCount)
    });
}

// ─── Custom User Properties ───────────────────────────────────────────────────
export async function setUserProperties(properties = {}) {
    try {
        const stored = await chrome.storage.local.get(['user_properties']);
        const userProps = stored.user_properties || {};
        const updated = { ...userProps, ...properties, last_updated: Date.now() };
        await chrome.storage.local.set({ user_properties: updated });
    } catch (e) {
        console.warn('Could not set user properties:', e);
    }
}

export async function trackUserProfile(userDataSnapshot) {
    const properties = {
        total_bookmarks: userDataSnapshot.totalBookmarks || 0,
        total_folders: userDataSnapshot.totalFolders || 0,
        avg_bookmarks_per_folder: userDataSnapshot.avgBookmarksPerFolder || 0,
        extension_usage_days: userDataSnapshot.usageDays || 0,
        last_active: new Date().toISOString(),
        preferences: userDataSnapshot.preferences || {}
    };
    await setUserProperties(properties);
    trackEvent('user_profile_snapshot', properties);
}

// ─── Exception / Error Tracking ────────────────────────────────────────────────
export function trackException(description, fatal = false) {
    trackEvent('exception', {
        description: truncate(description, 200),
        fatal_error: fatal
    });
}

export function trackValidationError(fieldName, errorReason, userInput = '') {
    trackEvent('validation_error', {
        field_name: fieldName,
        error_reason: errorReason,
        had_user_input: userInput?.length > 0
    });
}

// ─── Configuration Sync & Updates ──────────────────────────────────────────────
export async function updateGA4Config(newConfig) {
    GA4_CONFIG = { ...GA4_CONFIG, ...newConfig };
    try {
        await chrome.storage.local.set({ ga4_config: GA4_CONFIG });
        trackEvent('analytics_config_updated', {
            has_api_secret: !!GA4_CONFIG.API_SECRET,
            batch_size: GA4_CONFIG.BATCH_SIZE,
            flush_interval: GA4_CONFIG.FLUSH_INTERVAL
        });
    } catch (e) {
        console.error('Failed to update GA4 config:', e);
    }
}

// ─── Analytics Export & Diagnostics ────────────────────────────────────────────
export async function getAnalyticsDiagnostics() {
    return {
        config: {
            measurement_id: GA4_CONFIG.MEASUREMENT_ID,
            has_api_secret: !!GA4_CONFIG.API_SECRET,
            batch_size: GA4_CONFIG.BATCH_SIZE,
            flush_interval: GA4_CONFIG.FLUSH_INTERVAL
        },
        session: {
            client_id: getClientId(),
            session_start: new Date(sessionStartTime).toISOString(),
            is_configured: !!getGA4Endpoint()
        },
        queue: {
            pending_events: eventQueue.length,
            batch_timer_active: !!batchTimer
        }
    };
}
