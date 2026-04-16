/**
 * Analytics Integration Guide & Event Tracking Hub
 * 
 * This module provides a centralized way to track analytics events throughout the app.
 * It wraps the analytics functions to add context and ensure consistent tracking.
 */

import {
    trackEvent,
    trackPageView,
    trackSearch,
    trackSearchModeSwitch,
    trackBookmarkOpened,
    trackBookmarkAdded,
    trackBookmarkEdited,
    trackBookmarkDeleted,
    trackBookmarkRecaptured,
    trackFolderFiltered,
    trackFilterCleared,
    trackGridViewChanged,
    trackSortChanged,
    trackSettingsChanged,
    trackThemeToggled,
    trackModalOpened,
    trackModalClosed,
    trackScreenshotCapture,
    trackKeyboardShortcut,
    trackButtonClicked,
    trackError,
    trackTaskCompletion,
    trackGoalConversion,
    trackUserAction,
    trackPerformanceMetric,
    trackFeatureUsage,
    trackBulkOperation,
    trackBulkCapture,
    trackFolderOperation,
    trackDuplicateDetection,
    trackSameDomainGrouping,
    initSessionTracking,
    trackSessionDuration,
    flushAnalytics,
    setUserProperties,
    trackUserProfile,
    trackException,
    updateGA4Config
} from './analytics.js';

// ─── Session Management ────────────────────────────────────────────────────────
export function initializeAnalytics() {
    console.log('📊 Initializing analytics...');
    initSessionTracking();
    
    // Track if user has enabled analytics
    chrome.storage.sync.get(['analyticsEnabled'], (result) => {
        const enabled = result.analyticsEnabled !== false; // default to true
        if (!enabled) {
            console.log('ℹ Analytics disabled by user');
        }
    });
}

// ─── Safe wrapper for event tracking (respects user's analytics preferences) ────
export function safeTrackEvent(eventName, eventData = {}) {
    chrome.storage.sync.get(['analyticsEnabled'], (result) => {
        const enabled = result.analyticsEnabled !== false;
        if (enabled) {
            trackEvent(eventName, eventData);
        }
    });
}

// ─── Search Analytics ──────────────────────────────────────────────────────────
export function trackBookmarkSearch(searchTerm, resultsCount) {
    safeTrackEvent('search_performed', {
        search_term: searchTerm?.substring(0, 100) || '',
        results_count: resultsCount,
        search_term_length: searchTerm?.length || 0,
        timestamp: new Date().toISOString()
    });
}

export function trackWebSearch(searchTerm, engine) {
    safeTrackEvent('web_search_performed', {
        search_term: searchTerm?.substring(0, 100) || '',
        search_engine: engine,
        timestamp: new Date().toISOString()
    });
}

export function trackAIChat(messageCount, hasImage) {
    safeTrackEvent('ai_chat_interaction', {
        message_count: messageCount,
        included_image: hasImage,
        timestamp: new Date().toISOString()
    });
}

// ─── Bookmark Interaction Analytics ────────────────────────────────────────────
export function trackBookmarkClick(bookmarkId, title, domain, source = 'grid') {
    safeTrackEvent('bookmark_clicked', {
        bookmark_id: bookmarkId?.substring(0, 20) || 'unknown',
        source_component: source, // 'grid', 'duplicate_panel', 'duplicate_list', etc.
        domain: domain?.substring(0, 100) || 'unknown',
        timestamp: new Date().toISOString()
    });
}

export function trackBookmarkContextMenu(action, bookmarkId) {
    safeTrackEvent('bookmark_context_menu_action', {
        action_type: action, // 'open', 'edit', 'delete', 'recapture', etc.
        bookmark_id: bookmarkId?.substring(0, 20) || 'unknown',
        timestamp: new Date().toISOString()
    });
}

// ─── UI/UX Analytics ──────────────────────────────────────────────────────────
export function trackGridColumnChange(columnCount) {
    safeTrackEvent('grid_columns_changed', {
        columns: columnCount,
        timestamp: new Date().toISOString()
    });
}

export function trackSortOrderChange(sortMode) {
    safeTrackEvent('sort_order_changed', {
        sort_mode: sortMode,
        timestamp: new Date().toISOString()
    });
}

export function trackModeSwitch(fromMode, toMode) {
    safeTrackEvent('search_mode_switched', {
        from_mode: fromMode,
        to_mode: toMode,
        timestamp: new Date().toISOString()
    });
}

// ─── Feature Usage Analytics ──────────────────────────────────────────────────
export function trackSettingToggle(settingName, enabled) {
    safeTrackEvent('setting_toggled', {
        setting_name: settingName,
        enabled: enabled,
        timestamp: new Date().toISOString()
    });
}

export function trackThemeChange(theme) {
    safeTrackEvent('theme_changed', {
        theme: theme, // 'light', 'dark', 'auto'
        timestamp: new Date().toISOString()
    });
}

export function trackModalInteraction(modalType, action) {
    safeTrackEvent('modal_interaction', {
        modal_type: modalType,
        action: action, // 'opened', 'closed', 'submitted', etc.
        timestamp: new Date().toISOString()
    });
}

// ─── Duplicate/Organization Features ───────────────────────────────────────────
export function trackDuplicateFound(count) {
    safeTrackEvent('duplicates_detected', {
        duplicate_count: count,
        timestamp: new Date().toISOString()
    });
}

export function trackDuplicateAction(action, count) {
    safeTrackEvent('duplicate_action', {
        action: action, // 'dismiss', 'delete_all', 'review'
        count: count,
        timestamp: new Date().toISOString()
    });
}

// ─── Screenshot/Thumbnail Analytics ────────────────────────────────────────────
export function trackScreenshotAction(action, duration, success = true) {
    safeTrackEvent('screenshot_action', {
        action_type: action, // 'capture_single', 'capture_bulk', 'recapture'
        duration_ms: duration,
        success: success,
        timestamp: new Date().toISOString()
    });
}

// ─── Keyboard Shortcut Analytics ──────────────────────────────────────────────
export function trackShortcutUsed(shortcutKey, action) {
    safeTrackEvent('keyboard_shortcut', {
        key: shortcutKey,
        action: action,
        timestamp: new Date().toISOString()
    });
}

// ─── Error & Exception Tracking ────────────────────────────────────────────────
export function trackAppError(errorType, errorMessage, context = {}) {
    safeTrackEvent('app_error', {
        error_type: errorType,
        error_message: errorMessage?.substring(0, 100) || 'unknown',
        context: context,
        timestamp: new Date().toISOString()
    });
}

// ─── Performance Analytics ────────────────────────────────────────────────────
export function trackLoadingTime(componentName, duration) {
    safeTrackEvent('component_performance', {
        component: componentName,
        load_time_ms: duration,
        timestamp: new Date().toISOString()
    });
}

// ─── User Property Tracking ────────────────────────────────────────────────────
export function trackUserEngagement(totalBookmarks, totalFolders, sessionDuration) {
    safeTrackEvent('user_engagement_metrics', {
        total_bookmarks: totalBookmarks,
        total_folders: totalFolders,
        session_duration_seconds: Math.round(sessionDuration / 1000),
        timestamp: new Date().toISOString()
    });
}

// ─── Batch Flush ──────────────────────────────────────────────────────────────
export function flushPendingAnalytics() {
    console.log('📤 Flushing pending analytics events...');
    flushAnalytics();
}

export default {
    initializeAnalytics,
    safeTrackEvent,
    trackBookmarkSearch,
    trackWebSearch,
    trackAIChat,
    trackBookmarkClick,
    trackBookmarkContextMenu,
    trackGridColumnChange,
    trackSortOrderChange,
    trackModeSwitch,
    trackSettingToggle,
    trackThemeChange,
    trackModalInteraction,
    trackDuplicateFound,
    trackDuplicateAction,
    trackScreenshotAction,
    trackShortcutUsed,
    trackAppError,
    trackLoadingTime,
    trackUserEngagement,
    flushPendingAnalytics
};
