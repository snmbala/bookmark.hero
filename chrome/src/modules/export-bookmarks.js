// ─── Bookmark export helpers ──────────────────────────────────────────────────

export function exportAsJSON(allBookmarks) {
    const data = allBookmarks.map(b => ({
        id:           b.bookmark.id,
        title:        b.bookmark.title,
        url:          b.bookmark.url,
        folder:       b.folder,
        dateAdded:    b.bookmark.dateAdded,
        dateLastUsed: b.bookmark.dateLastUsed
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    triggerDownload(blob, 'bookmarks.json');
}

export function exportAsHTML(allBookmarks) {
    const lines = [
        '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        '<TITLE>Bookmarks</TITLE>',
        '<H1>Bookmarks</H1>',
        '<DL><p>'
    ];
    allBookmarks.forEach(b => {
        const addDate = b.bookmark.dateAdded ? Math.floor(b.bookmark.dateAdded / 1000) : '';
        lines.push(`    <DT><A HREF="${b.bookmark.url}" ADD_DATE="${addDate}">${b.bookmark.title || ''}</A>`);
    });
    lines.push('</DL><p>');
    const blob = new Blob([lines.join('\n')], { type: 'text/html' });
    triggerDownload(blob, 'bookmarks.html');
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
