/**
 * Centralized screenshot capture functionality
 * Handles all screenshot capture operations with consistent UI updates
 */

// Import the core screenshot capture function
import { captureScreenshot } from './thumbnail.js';

/**
 * Centralized screenshot capture function with UI updates
 * @param {string} url - The URL to capture
 * @param {string} title - The bookmark title
 * @param {HTMLElement} cardElement - Optional card element (for context)
 * @param {HTMLElement} captureButtonElement - Optional specific capture button to remove
 */
export function handleScreenshotCapture(url, title, cardElement = null, captureButtonElement = null) {
    console.log('📸 Starting centralized screenshot capture for:', title, 'URL:', url);
    
    captureScreenshot(url, title, function(capturedUrl, newThumbnailUrl) {
        console.log('📸 Screenshot capture completed for:', title);
        
        // Find and update all thumbnail images for this bookmark
        const bookmarkCards = document.querySelectorAll('.card');
        bookmarkCards.forEach(card => {
            const cardLink = card.querySelector('a[href="' + url + '"]');
            if (cardLink) {
                const thumbnailImg = card.querySelector('img[alt="' + url + '"]');
                if (thumbnailImg) {
                    thumbnailImg.src = newThumbnailUrl;
                    console.log('🖼️ Updated thumbnail for:', title);
                }
                
                // Remove capture button from this card
                removeCaptureButtonFromCard(card, url);
            }
        });
        
        // If a specific capture button was provided, remove it
        if (captureButtonElement && captureButtonElement.parentNode) {
            captureButtonElement.parentNode.removeChild(captureButtonElement);
            console.log('🗑️ Removed specific capture button for:', title);
        }
    });
}

/**
 * Helper function to remove capture button from a card
 * @param {HTMLElement} card - The card element
 * @param {string} url - The bookmark URL
 */
function removeCaptureButtonFromCard(card, url) {
    // Try to find capture button by ID first
    const captureButton = card.querySelector('#capture-' + url.replace(/[^a-zA-Z0-9]/g, ''));
    if (captureButton) {
        captureButton.remove();
        console.log('🗑️ Removed capture button by ID');
        return;
    }
    
    // Fallback: find button by text content
    const captureButtons = card.querySelectorAll('button');
    captureButtons.forEach(btn => {
        if (btn.textContent === 'Capture Thumbnail') {
            btn.remove();
            console.log('🗑️ Removed capture button by text content');
        }
    });
}
