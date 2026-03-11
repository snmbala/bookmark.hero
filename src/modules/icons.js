// Lucide icon library — inline SVG strings
// All icons use stroke="currentColor" so they inherit CSS color automatically.
// Viewbox is 24×24; rendered at 16×16 by default.

const SVG_OPEN = (w = 16, h = 16) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`;
const SVG_CLOSE = `</svg>`;

const PATHS = {
    search:         `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`,
    x:              `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
    'chevron-down': `<path d="m6 9 6 6 6-6"/>`,
    'arrow-up-down':`<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>`,
    camera:         `<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>`,
    pencil:         `<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>`,
    'trash-2':      `<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>`,
    ellipsis:       `<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>`,
    folder:         `<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>`,
    settings:       `<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>`,
    image:          `<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>`,
    link:           `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
    download:       `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>`,
    upload:         `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>`,
    check:          `<path d="M20 6 9 17l-5-5"/>`,
    copy:           `<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`,
    bookmark:       `<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>`,
};

/**
 * Returns a live SVGElement for the given icon.
 * Useful for appending directly to the DOM from JavaScript.
 * @param {string} name  - icon key
 * @param {string} cls   - extra CSS classes
 * @param {number} size  - width/height in px (default 16)
 */
export function iconEl(name, cls = '', size = 16) {
    const paths = PATHS[name];
    if (!paths) {
        console.warn(`[icons] unknown icon: "${name}"`);
        return document.createElement('span');
    }
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    if (cls) svg.setAttribute('class', cls);

    // Parse inner SVG shapes via a temporary container
    const tmp = document.createElement('div');
    tmp.innerHTML = `<svg xmlns="${ns}">${paths}</svg>`;
    Array.from(tmp.firstElementChild.childNodes).forEach(child => {
        svg.appendChild(document.importNode(child, true));
    });
    return svg;
}
