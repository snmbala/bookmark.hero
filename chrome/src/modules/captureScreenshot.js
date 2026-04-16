import { captureScreenshot, updateThumbnail } from './thumbnail.js';

/**
 * Centralized screenshot capture function with UI updates
 * @param {string} url - The URL to capture
 * @param {string} title - The bookmark title
 * @param {HTMLElement} captureButtonElement - Optional specific capture button to remove
 */
export function handleScreenshotCapture(url, title, captureButtonElement = null) {
    captureScreenshot(url, title, function(capturedUrl, newThumbnailUrl) {
        if (newThumbnailUrl) {
            updateThumbnail(url, newThumbnailUrl);
        } else {
            document.dispatchEvent(new CustomEvent('thumbmark:capture-failed', { detail: { url } }));
        }
        document.querySelectorAll('.card').forEach(card => {
            const cardLink = card.querySelector('a[href="' + url + '"]');
            if (cardLink) removeCaptureButtonFromCard(card, url);
        });

        if (captureButtonElement && captureButtonElement.parentNode) {
            captureButtonElement.parentNode.removeChild(captureButtonElement);
        }
    });
}

function removeCaptureButtonFromCard(card, url) {
    const captureButton = card.querySelector('#capture-' + url.replace(/[^a-zA-Z0-9]/g, ''));
    if (captureButton) {
        captureButton.remove();
        return;
    }
    card.querySelectorAll('button').forEach(btn => {
        if (btn.textContent === 'Capture Thumbnail') {
            btn.remove();
        }
    });
}
