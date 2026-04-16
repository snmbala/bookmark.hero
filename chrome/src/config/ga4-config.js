/**
 * Google Analytics 4 Configuration
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to Google Analytics → Create a new GA4 property (or use existing)
 * 2. In the Admin panel, go to: Data Streams → Select your web stream
 * 3. Copy the "Measurement ID" (format: G-XXXXXXXXXX)
 * 4. Click "Measurement Protocol API secrets" at the bottom
 * 5. Click "Create" to generate an API secret
 * 6. Copy the API secret and paste it below
 * 
 * TRACKING ID PROVIDED BY USER: CFokUdx8QYGvymNRNXLKNA
 * (If this is a Google Analytics property ID, verify it matches your GA4 setup)
 */

export const GA4_CONFIG = {
    // Your GA4 Measurement ID (from Data Streams)
    MEASUREMENT_ID: 'G-LK5VFTQHQV',
    
    // Your Measurement Protocol API Secret
    // Get this from: Admin → Data Streams → Measurement Protocol API secrets
    API_SECRET: 'CFokUdx8QYGvymNRNXLKNA', // TODO: Replace with your API secret
    
    // Alternative tracking ID (if applicable)
    // TRACKING_ID: 'CFokUdx8QYGvymNRNXLKNA',
    
    // Event batching configuration
    BATCH_SIZE: 50,              // Max events per batch
    FLUSH_INTERVAL: 5000,         // Auto-flush after 5 seconds
    
    // Enable debug mode for development
    DEBUG_MODE: false,
    
    // Track page views automatically
    auto_page_view: true,
    
    // Track exceptions/errors automatically
    auto_error_tracking: true,
    
    // Custom events to track
    TRACKED_EVENTS: {
        sessions: true,
        searches: true,
        bookmarks: true,
        performance: true,
        errors: true,
        features: true,
        tasks: true
    }
};

/**
 * Initialize GA4 with the configuration
 * Call this in your extension's background script or main entry point
 */
export async function initializeGA4() {
    try {
        // Load from storage first (allows runtime override)
        const stored = await chrome.storage.local.get(['ga4_config']);
        if (stored.ga4_config?.API_SECRET && stored.ga4_config.API_SECRET !== 'CONFIGURE_ME') {
            console.log('✓ Using GA4 config from storage');
            return stored.ga4_config;
        }
        
        // Fall back to hardcoded config
        if (GA4_CONFIG.API_SECRET && GA4_CONFIG.API_SECRET !== 'CONFIGURE_ME') {
            console.log('✓ GA4 Analytics configured and ready');
            return GA4_CONFIG;
        }
        
        console.warn('⚠ GA4 API Secret not configured. Analytics will be disabled.');
        console.warn('Configure at: src/config/ga4-config.js');
        return null;
    } catch (error) {
        console.error('Failed to initialize GA4:', error);
        return null;
    }
}

/**
 * Utility to update GA4 config at runtime
 * Useful for settings panel to allow users to enable/disable analytics
 */
export async function updateGA4ConfigRuntime(overrides = {}) {
    try {
        const updated = { ...GA4_CONFIG, ...overrides };
        await chrome.storage.local.set({ ga4_config: updated });
        console.log('GA4 config updated:', updated);
        return updated;
    } catch (error) {
        console.error('Failed to update GA4 config:', error);
        return null;
    }
}

/**
 * Helper to show setup instructions in console
 */
export function showGA4SetupGuide() {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║      Google Analytics 4 Setup Guide for Thumbmark         ║
╚════════════════════════════════════════════════════════════╝

1. Go to Google Analytics: https://analytics.google.com

2. Create a new GA4 property or select existing:
   - Click "Create" or select your property
   - Go to Admin → Data Streams → Web

3. Get your Measurement ID:
   - Copy the "Measurement ID" (e.g., G-XXXXXXXXXX)
   - Update GA4_CONFIG.MEASUREMENT_ID in this file

4. Create Measurement Protocol API Secret:
   - In Data Streams, scroll to bottom
   - Click "Measurement Protocol API secrets"
   - Click "Create" button
   - Copy the generated secret

5. Update this file:
   - Replace API_SECRET: 'CONFIGURE_ME' 
   - With your actual API secret

6. Verify:
   - Open extension
   - Check browser console for: "✓ GA4 Analytics configured"
   
For testing, enable DEBUG_MODE: true above.

Need help? See: https://developers.google.com/analytics/devguides/collection/protocol/ga4
    `);
}

export default GA4_CONFIG;
