// Content script: adds a beforeunload warning when bulk screenshot capture is active.
// ARM/DISARM messages are sent by thumbnail.js via chrome.tabs.sendMessage.

let guarded = false;

function beforeUnloadHandler(e) {
    e.preventDefault();
    e.returnValue = '';
}

chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message.type === 'BULK_CAPTURE_ARM') {
        if (!guarded) {
            window.addEventListener('beforeunload', beforeUnloadHandler);
            guarded = true;
        }
        sendResponse({ ok: true });
    } else if (message.type === 'BULK_CAPTURE_DISARM') {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        guarded = false;
        sendResponse({ ok: true });
    }
    return false;
});
