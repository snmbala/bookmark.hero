/**
 * AI Chat module — provider selection, message streaming, conversation history,
 * and image attachments. All AI-specific state lives here.
 *
 * Initialised via initAiChat({ setHeroCompact, isPopoverMode }).
 * main.js calls onSearchModeSet(mode) whenever the search mode changes.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Provider config ────────────────────────────────────────────────────────────
const AI_PROVIDERS = {
    groq:    { name: 'Groq',    hint: 'Free key — sign up at groq.com, get key at console.groq.com/keys' },
    chatgpt: { name: 'ChatGPT', hint: 'Get your key at platform.openai.com/api-keys' },
    gemini:  { name: 'Gemini',  hint: 'Get key at aistudio.google.com/apikey (may require billing)' }
};

let AI_PROVIDER = 'groq';
let AI_API_KEY  = '';

// ─── Chat state ─────────────────────────────────────────────────────────────────
let _aiMessages     = [];
let _aiStreaming     = false;
let _aiAutoScroll   = true;
let _aiPendingImage = null; // { dataUrl, mimeType, name }
let _currentConvId  = null;

const AI_HISTORY_KEY = 'aiChatHistory';
const AI_HISTORY_MAX = 50;

// ─── Injected deps ──────────────────────────────────────────────────────────────
let _setHeroCompact = () => {};
let _isPopoverMode  = false;

export function initAiChat({ setHeroCompact, isPopoverMode }) {
    _setHeroCompact = setHeroCompact;
    _isPopoverMode  = isPopoverMode;
}

export function hasAiMessages() {
    return _aiMessages.length > 0;
}

// ─── Called by main.js setSearchMode ───────────────────────────────────────────
export function onSearchModeSet(mode) {
    if (mode !== 'ai') {
        document.body.classList.remove('ai-chat-active');
        document.getElementById('ai-chat-fixed-bar')?.classList.add('hidden');
        return;
    }
    if (_aiMessages.length > 0) {
        document.body.classList.add('ai-chat-active');
        document.getElementById('ai-chat-fixed-bar')?.classList.remove('hidden');
        _setHeroCompact(true);
        setTimeout(() => document.getElementById('ai-chat-fixed-input')?.focus(), 50);
    } else {
        _setHeroCompact(false);
        const aiInput = document.getElementById('ai-chat-input');
        if (aiInput) setTimeout(() => aiInput.focus(), 50);
    }
}

// ─── Provider selection ─────────────────────────────────────────────────────────
export function setAiProvider(provider) {
    AI_PROVIDER = provider;
    const cfg = AI_PROVIDERS[provider];
    if (!cfg) return;
    const select    = document.getElementById('ai-provider-select');
    const keyWrap   = document.getElementById('ai-key-wrap');
    const keyInput  = document.getElementById('ai-api-key');
    const keyHint   = document.getElementById('ai-key-hint');
    const label     = document.getElementById('ai-provider-label');
    const labelBot  = document.getElementById('ai-provider-label-bottom');

    if (select)   select.value = provider;
    if (keyWrap)  keyWrap.classList.remove('hidden');
    if (keyHint)  keyHint.textContent = cfg.hint || '';
    if (label)    label.textContent    = 'Powered by ' + cfg.name;
    if (labelBot) labelBot.textContent = 'Powered by ' + cfg.name;

    chrome.storage.local.get(['aiKeys'], function (result) {
        const keys = result.aiKeys || {};
        AI_API_KEY = keys[provider] || '';
        if (keyInput) keyInput.value = AI_API_KEY;
        const onboarding = document.getElementById('ai-onboarding');
        if (onboarding) {
            onboarding.classList.toggle('hidden', !!AI_API_KEY);
            const ob = document.getElementById('ai-onboarding-key');
            if (ob) ob.value = '';
        }
    });

    chrome.storage.sync.set({ aiProvider: provider });
}

function saveAiApiKey(provider, key) {
    chrome.storage.local.get(['aiKeys'], function (result) {
        const keys = result.aiKeys || {};
        keys[provider] = key;
        chrome.storage.local.set({ aiKeys: keys });
        if (key) {
            document.getElementById('ai-onboarding')?.classList.add('hidden');
            const keyInput = document.getElementById('ai-api-key');
            if (keyInput) keyInput.value = key;
        }
    });
}

// ─── Image attachment helpers ───────────────────────────────────────────────────
function splitDataUrl(dataUrl) {
    const parts     = (dataUrl || '').split(',');
    const header    = parts[0] || '';
    const data      = parts[1] || '';
    const mimeMatch = header.match(/^data:([^;]+);base64$/);
    return { mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg', base64: data };
}

function updateAttachmentPreviewUI() {
    const preview = document.getElementById('ai-attachment-preview');
    const thumb   = document.getElementById('ai-attachment-thumb');
    const name    = document.getElementById('ai-attachment-name');
    if (!preview || !thumb || !name) return;
    if (_aiPendingImage?.dataUrl) {
        preview.classList.remove('hidden');
        thumb.src = _aiPendingImage.dataUrl;
        name.textContent = _aiPendingImage.name || 'Attached image';
    } else {
        preview.classList.add('hidden');
        thumb.src = '';
        name.textContent = '';
    }
}

export function clearPendingImage() {
    _aiPendingImage = null;
    const input = document.getElementById('ai-image-input');
    if (input) input.value = '';
    updateAttachmentPreviewUI();
}

function handleImagePick(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = function () {
        const dataUrl = String(reader.result || '');
        const split   = splitDataUrl(dataUrl);
        _aiPendingImage = { dataUrl, mimeType: split.mimeType, name: file.name || 'image' };
        updateAttachmentPreviewUI();
    };
    reader.readAsDataURL(file);
}

// ─── Markdown renderer ──────────────────────────────────────────────────────────
function parseMarkdown(text) {
    // ── 1. Extract fenced code blocks (protect from inline processing) ──────
    const codeBlocks = [];
    let s = text.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        codeBlocks.push({ lang: lang.trim(), code });
        return `\x00CODE${codeBlocks.length - 1}\x00`;
    });

    // ── 2. Escape HTML in remaining text ────────────────────────────────────
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // ── 3. Images before links  ![alt](url) ─────────────────────────────────
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
        '<img class="ai-md-img" src="$2" alt="$1" loading="lazy">');

    // ── 4. Markdown links  [text](url) ──────────────────────────────────────
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // ── 5. Auto-link bare URLs not already inside an <a> ────────────────────
    s = s.replace(/(?<!['"=(>])(https?:\/\/[^\s<"')\]]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

    // ── 6. Inline code ───────────────────────────────────────────────────────
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // ── 7. Bold + italic, bold, italic, strikethrough ───────────────────────
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
    s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    s = s.replace(/~~(.+?)~~/g,         '<del>$1</del>');

    // ── 8. Headings ─────────────────────────────────────────────────────────
    s = s.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    s = s.replace(/^### (.+)$/gm,  '<h3>$1</h3>');
    s = s.replace(/^## (.+)$/gm,   '<h2>$1</h2>');
    s = s.replace(/^# (.+)$/gm,    '<h1>$1</h1>');

    // ── 9. Blockquote  (> is now &gt; after escaping) ───────────────────────
    s = s.replace(/^(&gt;) (.+)$/gm, '<blockquote>$2</blockquote>');

    // ── 10. Task lists  - [x] / - [ ] (allow leading whitespace for indented items) ─
    s = s.replace(/^[ \t]*[\-\*\+] \[x\] (.+)$/gim,
        '<li class="ai-task-done"><span class="ai-cb ai-cb-done"></span><span>$1</span></li>');
    s = s.replace(/^[ \t]*[\-\*\+] \[ \] (.+)$/gm,
        '<li class="ai-task"><span class="ai-cb"></span><span>$1</span></li>');

    // ── 11. Regular lists (allow leading whitespace for indented items) ──────
    s = s.replace(/^[ \t]*[\-\*\+] (.+)$/gm, '<li>$1</li>');
    s = s.replace(/^[ \t]*\d+\. (.+)$/gm,    '<li data-ol="1">$1</li>');

    // ── 12. HR ───────────────────────────────────────────────────────────────
    s = s.replace(/^---+$/gm, '<hr>');

    // ── 13. Block-level grouping (paragraphs, lists, tables) ─────────────────
    s = s.split(/\n{2,}/).map(block => {
        block = block.trim();
        if (!block) return '';
        if (/^\x00CODE/.test(block)) return block;
        if (/^<(h[1-4]|hr|img|blockquote|table)/.test(block)) return block;

        // Table block: lines with pipes
        if (/^\|.+\|/.test(block)) {
            const table = _mdTable(block);
            if (table) return table;
        }

        // If no list items, simple paragraph
        if (!block.includes('<li')) {
            return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
        }

        // Mixed content (intro text + list, or pure list): group line-by-line
        const lines = block.split('\n');
        let out = '', liBuffer = [], isOlBuffer = false, textBuffer = [];
        const flushLi = () => {
            if (!liBuffer.length) return;
            const tag = isOlBuffer ? 'ol' : 'ul';
            out += `<${tag}>${liBuffer.map(l => l.replace(/ data-ol="1"/g, '')).join('')}</${tag}>`;
            liBuffer = [];
        };
        const flushText = () => {
            if (!textBuffer.length) return;
            out += '<p>' + textBuffer.join('<br>') + '</p>';
            textBuffer = [];
        };
        for (const line of lines) {
            if (/^<li/.test(line)) {
                flushText();
                const isOl = /data-ol/.test(line);
                if (liBuffer.length && isOl !== isOlBuffer) flushLi();
                isOlBuffer = isOl;
                liBuffer.push(line);
            } else {
                flushLi();
                if (line.trim()) textBuffer.push(line);
            }
        }
        flushLi();
        flushText();
        return out;
    }).join('');

    // ── 14. Restore code blocks with language badge ──────────────────────────
    s = s.replace(/\x00CODE(\d+)\x00/g, (_, i) => {
        const { lang, code } = codeBlocks[+i];
        const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const badge = lang ? `<span class="ai-code-lang">${lang}</span>` : '';
        return `<div class="ai-pre-wrap">${badge}<pre><code>${esc}</code></pre></div>`;
    });

    return s;
}

function _mdTable(block) {
    const rows = block.trim().split('\n').filter(Boolean);
    if (rows.length < 2 || !rows[0].includes('|')) return null;
    const sepIdx = rows.findIndex(r => /^\|?[\s\-:|]+\|/.test(r));
    if (sepIdx < 0) return null;
    const parseRow = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const heads = parseRow(rows[0]).map(h => `<th>${h}</th>`).join('');
    const body  = rows.filter((_, i) => i !== 0 && i !== sepIdx)
        .map(r => '<tr>' + parseRow(r).map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
    return `<div class="ai-table-wrap"><table class="ai-table"><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// ─── Conversation history ───────────────────────────────────────────────────────
function saveCurrentConversation() {
    const userMsgs = _aiMessages.filter(m => m.role === 'user' && (m.text || m.imageDataUrl));
    if (userMsgs.length === 0) return;
    const firstUser = userMsgs[0];
    const title = (firstUser.text || (firstUser.imageDataUrl ? '[Image]' : '')).slice(0, 72) || 'Conversation';
    const storedMessages = _aiMessages.map(m => ({
        role: m.role, text: m.text || '',
        imageMimeType: m.imageDataUrl ? m.imageMimeType : null,
        _hadImage: !!m.imageDataUrl
    }));

    chrome.storage.local.get([AI_HISTORY_KEY], function (result) {
        const history = result[AI_HISTORY_KEY] || [];
        if (_currentConvId) {
            const idx = history.findIndex(c => c.id === _currentConvId);
            if (idx !== -1) {
                history[idx].messages  = storedMessages;
                history[idx].timestamp = Date.now();
                history[idx].title     = title;
            } else {
                history.unshift({ id: _currentConvId, title, timestamp: Date.now(), provider: AI_PROVIDER, messages: storedMessages });
            }
        } else {
            _currentConvId = 'conv_' + Date.now();
            history.unshift({ id: _currentConvId, title, timestamp: Date.now(), provider: AI_PROVIDER, messages: storedMessages });
        }
        if (history.length > AI_HISTORY_MAX) history.splice(AI_HISTORY_MAX);
        chrome.storage.local.set({ [AI_HISTORY_KEY]: history });
    });
}

function deleteConversation(id) {
    chrome.storage.local.get([AI_HISTORY_KEY], function (result) {
        const history = (result[AI_HISTORY_KEY] || []).filter(c => c.id !== id);
        chrome.storage.local.set({ [AI_HISTORY_KEY]: history }, function () {
            if (_currentConvId === id) _currentConvId = null;
            renderHistoryPanel();
        });
    });
}

function loadConversation(conv) {
    _aiMessages = conv.messages.map(m => ({
        role: m.role, text: m.text || '',
        imageDataUrl: null, imageMimeType: m.imageMimeType || null
    }));
    _currentConvId  = conv.id;
    _aiAutoScroll   = true;
    renderAiMessages();
    const container = document.getElementById('ai-chat-messages');
    if (container) container.scrollTop = container.scrollHeight;
    document.getElementById('ai-history-panel')?.classList.add('hidden');
}

export function renderHistoryPanel() {
    const list  = document.getElementById('ai-history-list');
    const empty = document.getElementById('ai-history-empty');
    if (!list) return;

    chrome.storage.local.get([AI_HISTORY_KEY], function (result) {
        const history = result[AI_HISTORY_KEY] || [];
        list.innerHTML = '';

        if (history.length === 0) {
            list.classList.add('hidden');
            empty?.classList.remove('hidden');
            return;
        }
        list.classList.remove('hidden');
        empty?.classList.add('hidden');

        const sorted    = [...history].sort((a, b) => b.timestamp - a.timestamp);
        const now       = new Date();
        const todayStr  = now.toDateString();
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        const yestStr   = yesterday.toDateString();

        function dateBucket(ts) {
            const d = new Date(ts), s = d.toDateString();
            if (s === todayStr) return 'Today';
            if (s === yestStr)  return 'Yesterday';
            const sameYear = d.getFullYear() === now.getFullYear();
            return d.toLocaleDateString([], sameYear
                ? { day: 'numeric', month: 'short' }
                : { day: 'numeric', month: 'short', year: 'numeric' });
        }

        const groups = [], groupMap = {};
        sorted.forEach(function (conv) {
            const bucket = dateBucket(conv.timestamp);
            if (!groupMap[bucket]) { groupMap[bucket] = []; groups.push({ label: bucket, items: groupMap[bucket] }); }
            groupMap[bucket].push(conv);
        });

        const TRASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

        groups.forEach(function (group, gi) {
            const header = document.createElement('div');
            header.className = 'flex items-center gap-2 px-4 pt-' + (gi === 0 ? '3' : '4') + ' pb-1.5';
            const lbl = document.createElement('span');
            lbl.className = 'text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500';
            lbl.textContent = group.label;
            header.appendChild(lbl);
            list.appendChild(header);

            group.items.forEach(function (conv) {
                const row = document.createElement('div');
                row.className = 'flex items-center gap-3 px-4 py-2.5 mx-2 mb-0.5 rounded-xl cursor-pointer transition-colors group' +
                    ' hover:bg-zinc-50 dark:hover:bg-zinc-800' +
                    (_currentConvId === conv.id ? ' bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-50 dark:hover:bg-indigo-950/40' : '');

                const meta     = document.createElement('div');
                meta.className = 'flex-1 min-w-0';
                const titleEl  = document.createElement('p');
                titleEl.className = 'text-[13px] text-zinc-800 dark:text-zinc-100 truncate' +
                    (_currentConvId === conv.id ? ' font-semibold text-indigo-700 dark:text-indigo-300' : ' font-medium');
                titleEl.textContent = conv.title;
                const timeEl = document.createElement('p');
                timeEl.className = 'text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 tabular-nums';
                const d = new Date(conv.timestamp);
                timeEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
                    (conv.provider ? '  ·  ' + conv.provider : '');
                meta.appendChild(titleEl);
                meta.appendChild(timeEl);

                const delBtn = document.createElement('button');
                delBtn.type = 'button'; delBtn.title = 'Delete';
                delBtn.className = 'flex-shrink-0 opacity-0 group-hover:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all';
                delBtn.innerHTML = TRASH_SVG;
                delBtn.addEventListener('click', function (e) { e.stopPropagation(); deleteConversation(conv.id); });

                row.appendChild(meta);
                row.appendChild(delBtn);
                row.addEventListener('click', function () { loadConversation(conv); });
                list.appendChild(row);
            });
        });

        const pad = document.createElement('div');
        pad.className = 'h-2';
        list.appendChild(pad);
    });
}

// ─── Message rendering ──────────────────────────────────────────────────────────
function isAiNearBottom(container, threshold = 48) {
    if (!container) return true;
    return container.scrollHeight - container.clientHeight - container.scrollTop <= threshold;
}

const _AI_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z"/><circle cx="19" cy="4" r="1.5"/><circle cx="5" cy="19" r="1"/></svg>`;

export function renderAiMessages() {
    const container = document.getElementById('ai-chat-messages');
    if (!container) return;
    container.innerHTML = '';
    _aiMessages.forEach(function (msg) {
        if (msg.role === 'user') {
            const div = document.createElement('div');
            div.className = 'ai-msg-user';
            if (msg.imageDataUrl) {
                const img = document.createElement('img');
                img.className = 'ai-msg-user-image';
                img.alt = 'Attached image';
                img.src = msg.imageDataUrl;
                div.appendChild(img);
            }
            if (msg.text) {
                const textEl = document.createElement('div');
                textEl.textContent = msg.text;
                div.appendChild(textEl);
            }
            if (!msg.text && !msg.imageDataUrl) div.textContent = '(empty message)';
            container.appendChild(div);
        } else {
            const wrap = document.createElement('div');
            wrap.className = 'ai-msg-ai-wrap';
            const icon = document.createElement('div');
            icon.className = 'ai-msg-ai-icon';
            icon.innerHTML = _AI_ICON_SVG;
            const content = document.createElement('div');
            content.className = 'ai-msg-ai';
            content.innerHTML = !msg.text ? '<span class="ai-typing"> </span>' : parseMarkdown(msg.text);
            wrap.appendChild(icon);
            wrap.appendChild(content);
            container.appendChild(wrap);
        }
    });
    // Scroll to bottom only when near bottom or just sent a new message
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (nearBottom || _aiAutoScroll) container.scrollTop = container.scrollHeight;

    if (_aiMessages.length > 0) {
        document.body.classList.add('ai-chat-active');
        const fixedBar = document.getElementById('ai-chat-fixed-bar');
        if (fixedBar) fixedBar.classList.remove('hidden');
        _setHeroCompact(true);
        const fixedInput = document.getElementById('ai-chat-fixed-input');
        if (fixedInput && document.activeElement !== fixedInput) fixedInput.focus();
    }
}

// ─── Send message ───────────────────────────────────────────────────────────────
export async function sendAiMessage(text) {
    if ((!text && !_aiPendingImage) || _aiStreaming) return;
    _aiAutoScroll = true;
    const sendingImage = _aiPendingImage;
    _aiMessages.push({ role: 'user', text: text || '', imageDataUrl: sendingImage?.dataUrl || null, imageMimeType: sendingImage?.mimeType || null });
    _aiMessages.push({ role: 'ai', text: '' });
    clearPendingImage();
    renderAiMessages();

    const sendBtn      = document.getElementById('ai-send-btn');
    const fixedSendBtn = document.getElementById('ai-chat-fixed-send');
    const chatInput    = document.getElementById('ai-chat-input');
    if (sendBtn)      sendBtn.disabled      = true;
    if (fixedSendBtn) fixedSendBtn.disabled = true;
    _aiStreaming = true;

    const aiIdx   = _aiMessages.length - 1;
    const userIdx = _aiMessages.length - 2;

    const onChunk = function (accumulated) {
        _aiMessages[aiIdx].text = accumulated;
        const msgContainer = document.getElementById('ai-chat-messages');
        const lastEl = msgContainer?.lastElementChild;
        const aiEl = lastEl?.classList.contains('ai-msg-ai-wrap')
            ? lastEl.querySelector('.ai-msg-ai')
            : (lastEl?.classList.contains('ai-msg-ai') ? lastEl : null);
        if (aiEl) {
            aiEl.innerHTML = parseMarkdown(accumulated);
            aiEl.classList.add('is-streaming');
            // Only scroll if user is already near the bottom (within 120px)
            const nearBottom = msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight < 120;
            if (nearBottom) msgContainer.scrollTop = msgContainer.scrollHeight;
        }
    };

    try {
        if (!AI_API_KEY) throw new Error(AI_PROVIDERS[AI_PROVIDER]?.hint || 'API key required');
        const messages = _aiMessages.slice(0, -1).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text || '',
            imageDataUrl: m.imageDataUrl || null,
            imageMimeType: m.imageMimeType || null
        }));

        let resultText = '';
        if (AI_PROVIDER === 'groq')    resultText = await _fetchGroq(messages, AI_API_KEY, onChunk);
        else if (AI_PROVIDER === 'chatgpt') resultText = await _fetchOpenAI(messages, AI_API_KEY, onChunk);
        else if (AI_PROVIDER === 'gemini')  resultText = await _fetchGemini(messages, AI_API_KEY, onChunk);

        if (!resultText) {
            _aiMessages[aiIdx].text = 'No response received. Check your API key in Settings.';
            renderAiMessages();
        }
    } catch (err) {
        const msg = err.message || 'Failed to connect';
        const isSetupMsg = !AI_API_KEY ||
            msg.includes('console.groq.com') || msg.includes('platform.openai.com') || msg.includes('aistudio.google.com/apikey');
        _aiMessages[aiIdx].text = isSetupMsg ? '📋 Setup Required:\n' + msg : 'Error: ' + msg;
        renderAiMessages();
    } finally {
        _aiStreaming = false;
        const _lastWrap = document.getElementById('ai-chat-messages')?.lastElementChild;
        (_lastWrap?.querySelector('.ai-msg-ai') ?? _lastWrap)?.classList.remove('is-streaming');
        if (sendBtn)      sendBtn.disabled      = false;
        if (fixedSendBtn) fixedSendBtn.disabled = false;
        saveCurrentConversation();
        const fixedBar = document.getElementById('ai-chat-fixed-bar');
        if (fixedBar && !fixedBar.classList.contains('hidden')) {
            document.getElementById('ai-chat-fixed-input')?.focus();
        } else if (chatInput) {
            chatInput.focus();
        }
    }
}

// ─── API fetchers ───────────────────────────────────────────────────────────────
async function _fetchGemini(messages, apiKey, onChunk) {
    if (!apiKey) throw new Error('Please add your Google API key in Settings');

    const genAI = new GoogleGenerativeAI(apiKey);

    // Build history (all but last message) and current prompt (last message)
    const history = messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: _buildGeminiParts(m)
    }));
    const lastMsg = messages[messages.length - 1];
    const prompt  = _buildGeminiParts(lastMsg);

    // Try models in order — fastest/cheapest first
    const modelNames = [
        'gemini-2.5-flash-preview-04-17',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
    ];

    const errors = [];
    for (const modelName of modelNames) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const chat  = model.startChat({ history });
            const result = await chat.sendMessageStream(prompt);

            let full = '';
            for await (const chunk of result.stream) {
                const delta = chunk.text();
                if (delta) { full += delta; onChunk(full); }
            }
            return full;
        } catch (e) {
            const msg = e.message || '';
            // Auth/quota errors: no point retrying other models
            if (msg.includes('API key') || msg.includes('403') || msg.includes('401') || msg.includes('429')) {
                throw new Error(`Gemini: ${msg}`);
            }
            errors.push(`${modelName}: ${msg.slice(0, 120)}`);
        }
    }
    throw new Error(`All Gemini models failed:\n${errors.join('\n')}\n\nCheck your API key at https://aistudio.google.com/app/api-keys`);
}

function _buildGeminiParts(m) {
    const parts = [];
    if (m.imageDataUrl) {
        const split = splitDataUrl(m.imageDataUrl);
        if (split.base64) parts.push({ inlineData: { mimeType: split.mimeType, data: split.base64 } });
    }
    parts.push({ text: m.content || m.text || '' });
    return parts;
}

async function _readSSE(response, onChunk) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', full = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') return full;
            try { const json = JSON.parse(data); const delta = json.choices?.[0]?.delta?.content; if (delta) { full += delta; onChunk(full); } } catch {}
        }
    }
    return full;
}

async function _fetchOpenAI(messages, apiKey, onChunk) {
    if (!apiKey) throw new Error('Please add your OpenAI API key in Settings');
    const payloadMessages = messages.map(m => {
        if (m.role === 'user' && m.imageDataUrl) {
            const content = [];
            if (m.content) content.push({ type: 'text', text: m.content });
            content.push({ type: 'image_url', image_url: { url: m.imageDataUrl } });
            return { role: m.role, content };
        }
        return { role: m.role, content: m.content || '' };
    });
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: payloadMessages, stream: true })
    });
    if (!res.ok) { const e = await res.text().catch(() => ''); throw new Error('OpenAI API error ' + res.status + (e ? ': ' + e.slice(0, 150) : '')); }
    return _readSSE(res, onChunk);
}

async function _fetchGroq(messages, apiKey, onChunk) {
    if (!apiKey) throw new Error('Free key — sign up at groq.com, get key at console.groq.com/keys');
    const hasImages = messages.some(m => m.role === 'user' && !!m.imageDataUrl);
    const payloadMessages = messages.map(m => {
        if (m.role === 'user' && m.imageDataUrl) {
            const content = [];
            if (m.content) content.push({ type: 'text', text: m.content });
            content.push({ type: 'image_url', image_url: { url: m.imageDataUrl } });
            return { role: m.role, content };
        }
        return { role: m.role, content: m.content || '' };
    });
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: hasImages ? 'llama-3.2-11b-vision-preview' : 'llama-3.1-8b-instant', messages: payloadMessages, stream: true })
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const msg     = errBody ? errBody.slice(0, 150) : '';
        if (res.status === 401) throw new Error('Invalid API key. Get one at console.groq.com/keys');
        if (hasImages && res.status === 400) throw new Error('This Groq model/account does not support image input yet. Try Gemini provider for image chat.');
        throw new Error('Groq API error ' + res.status + (msg ? ': ' + msg : ''));
    }
    return _readSSE(res, onChunk);
}

// ─── Wire all AI event listeners (called from main.js wireEventListeners) ───────
export function wireAiListeners() {
    const aiInput       = document.getElementById('ai-chat-input');
    const aiSendBtn     = document.getElementById('ai-send-btn');
    const aiImageInput  = document.getElementById('ai-image-input');
    const aiAttachBtn   = document.getElementById('ai-attach-btn');
    const aiFixedAttach = document.getElementById('ai-chat-fixed-attach');
    const aiAttachRm    = document.getElementById('ai-attachment-remove');

    if (aiInput) {
        aiInput.addEventListener('input', function () {
            aiInput.style.height = 'auto';
            aiInput.style.height = Math.min(aiInput.scrollHeight, 128) + 'px';
        });
        aiInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = aiInput.value.trim();
                if (text || _aiPendingImage) { aiInput.value = ''; aiInput.style.height = 'auto'; sendAiMessage(text); }
            }
        });
    }
    if (aiSendBtn) aiSendBtn.addEventListener('click', function () {
        if (!aiInput) return;
        const text = aiInput.value.trim();
        if (text || _aiPendingImage) { aiInput.value = ''; aiInput.style.height = 'auto'; sendAiMessage(text); }
    });

    if (aiAttachBtn   && aiImageInput) aiAttachBtn.addEventListener('click',   () => aiImageInput.click());
    if (aiFixedAttach && aiImageInput) aiFixedAttach.addEventListener('click', () => aiImageInput.click());
    if (aiImageInput) aiImageInput.addEventListener('change', () => handleImagePick(aiImageInput.files?.[0]));
    if (aiAttachRm)   aiAttachRm.addEventListener('click', clearPendingImage);

    const aiMessagesContainer = document.getElementById('ai-chat-messages');
    if (aiMessagesContainer) {
        aiMessagesContainer.addEventListener('scroll', function () {
            if (aiMessagesContainer.scrollTop <= 2) { _aiAutoScroll = false; return; }
            _aiAutoScroll = isAiNearBottom(aiMessagesContainer);
        });
    }

    // Onboarding — provider pills
    const _obPlaceholders = {
        groq:    'gsk_…  paste your Groq API key',
        gemini:  'AIza…  paste your Google AI key',
        chatgpt: 'sk-…   paste your OpenAI key',
    };
    const obKeyInput = document.getElementById('ai-onboarding-key');
    const obSaveBtn  = document.getElementById('ai-onboarding-save');
    let   _obProvider = AI_PROVIDER || 'groq';

    function _activateObProvider(p) {
        _obProvider = p;
        document.querySelectorAll('.ob-provider-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.provider === p);
        });
        document.querySelectorAll('.ob-steps').forEach(el => el.classList.add('hidden'));
        document.getElementById('ob-steps-' + p)?.classList.remove('hidden');
        if (obKeyInput) obKeyInput.placeholder = _obPlaceholders[p] || 'Paste your API key…';
    }

    document.querySelectorAll('.ob-provider-btn').forEach(btn => {
        btn.addEventListener('click', () => _activateObProvider(btn.dataset.provider));
    });

    // Activate the current provider by default
    _activateObProvider(_obProvider);

    function saveOnboardingKey() {
        const key = obKeyInput?.value?.trim();
        if (!key) { if (obKeyInput) { obKeyInput.focus(); obKeyInput.classList.add('ring-2', 'ring-red-400'); } return; }
        if (obKeyInput) obKeyInput.classList.remove('ring-2', 'ring-red-400');
        setAiProvider(_obProvider);
        AI_API_KEY = key;
        saveAiApiKey(_obProvider, key);
        setTimeout(() => document.getElementById('ai-chat-input')?.focus(), 50);
    }
    if (obSaveBtn)  obSaveBtn.addEventListener('click', saveOnboardingKey);
    if (obKeyInput) obKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveOnboardingKey(); } });

    // Fixed bottom input
    const fixedAiInput = document.getElementById('ai-chat-fixed-input');
    const fixedAiSend  = document.getElementById('ai-chat-fixed-send');
    const newChatBtn   = document.getElementById('ai-new-chat-btn');

    if (newChatBtn) newChatBtn.addEventListener('click', function () {
        _aiMessages = []; _currentConvId = null; _aiAutoScroll = true;
        renderAiMessages();
        document.body.classList.remove('ai-chat-active');
        document.getElementById('ai-chat-fixed-bar')?.classList.add('hidden');
        document.getElementById('ai-history-panel')?.classList.add('hidden');
        _setHeroCompact(false);
        const inp = document.getElementById('ai-chat-input');
        if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 50); }
    });

    if (fixedAiInput) fixedAiInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const text = fixedAiInput.value.trim();
            if (text || _aiPendingImage) { fixedAiInput.value = ''; sendAiMessage(text); }
        }
    });
    if (fixedAiSend) fixedAiSend.addEventListener('click', function () {
        const text = fixedAiInput?.value?.trim();
        if (text || _aiPendingImage) { if (fixedAiInput) fixedAiInput.value = ''; sendAiMessage(text); }
    });

    // History panel
    const historyBtn       = document.getElementById('ai-history-btn');
    const historyInlineBtn = document.getElementById('ai-history-inline-btn');
    const historyPanel     = document.getElementById('ai-history-panel');
    const historyClose     = document.getElementById('ai-history-close');
    const historyClearAll  = document.getElementById('ai-history-clear-all');

    if (historyBtn)       historyBtn.addEventListener('click', () => { const h = historyPanel?.classList.toggle('hidden'); if (!h) renderHistoryPanel(); });
    if (historyInlineBtn) historyInlineBtn.addEventListener('click', () => { const h = historyPanel?.classList.toggle('hidden'); if (!h) renderHistoryPanel(); });
    if (historyClose)     historyClose.addEventListener('click', () => historyPanel?.classList.add('hidden'));
    if (historyClearAll)  historyClearAll.addEventListener('click', function () {
        if (!confirm('Delete all conversation history?')) return;
        chrome.storage.local.set({ [AI_HISTORY_KEY]: [] }, function () { _currentConvId = null; renderHistoryPanel(); });
    });
    document.addEventListener('click', function (e) {
        if (!historyPanel || historyPanel.classList.contains('hidden')) return;
        const onBtn = (e.target === historyBtn) || historyBtn?.contains(e.target);
        const onInl = (e.target === historyInlineBtn) || historyInlineBtn?.contains(e.target);
        if (!historyPanel.contains(e.target) && !onBtn && !onInl) historyPanel.classList.add('hidden');
    });

    // Provider & API key settings
    const aiProviderSelect = document.getElementById('ai-provider-select');
    const aiApiKeyInput    = document.getElementById('ai-api-key');
    const aiKeyToggle      = document.getElementById('ai-key-toggle');

    if (aiProviderSelect) aiProviderSelect.addEventListener('change', function () {
        setAiProvider(aiProviderSelect.value);
        _aiMessages = []; _currentConvId = null; _aiAutoScroll = true;
        renderAiMessages();
    });
    if (aiApiKeyInput) aiApiKeyInput.addEventListener('change', function () {
        AI_API_KEY = aiApiKeyInput.value.trim();
        saveAiApiKey(AI_PROVIDER, AI_API_KEY);
    });
    if (aiKeyToggle && aiApiKeyInput) aiKeyToggle.addEventListener('click', function () {
        aiApiKeyInput.type = aiApiKeyInput.type === 'password' ? 'text' : 'password';
    });
}
