import re

with open('src/main.js', 'r') as f:
    code = f.read()

# ── 1. Replace _fetchGemini ──────────────────────────────────────────────────
gemini_start = code.index('async function _fetchGemini(messages, apiKey) {')
# find the closing } by counting braces
depth = 0
i = gemini_start
while i < len(code):
    if code[i] == '{': depth += 1
    elif code[i] == '}':
        depth -= 1
        if depth == 0:
            gemini_end = i + 1
            break
    i += 1

gemini_new = '''async function _fetchGemini(messages, apiKey, onChunk) {
    if (!apiKey) throw new Error('Please add your Google API key in Settings');
    const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));
    const models = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'];
    const endpoints = ['v1', 'v1beta'];
    let lastError = '';
    for (const endpoint of endpoints) {
        for (const model of models) {
            const url = 'https://generativelanguage.googleapis.com/' + endpoint + '/models/' + model
                + ':streamGenerateContent?alt=sse&key=' + encodeURIComponent(apiKey);
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents })
                });
                if (res.status === 404) { lastError = model + ' (' + endpoint + ')'; continue; }
                if (!res.ok) {
                    const errBody = await res.text().catch(() => '');
                    throw new Error('Gemini API error ' + res.status + (errBody ? ': ' + errBody.slice(0, 200) : ''));
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '', full = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\\n');
                    buffer = lines.pop();
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data: ')) continue;
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            const delta = json.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (delta) { full += delta; onChunk(full); }
                        } catch {}
                    }
                }
                return full;
            } catch (e) {
                if (e.message?.includes('API error')) throw e;
                lastError = model + ': ' + e.message;
                continue;
            }
        }
    }
    throw new Error('No Gemini models available. Verify your API key at https://aistudio.google.com/apikey');
}'''

code = code[:gemini_start] + gemini_new + code[gemini_end:]
print('✓ _fetchGemini replaced')

# ── 2. Replace _fetchOpenAI ──────────────────────────────────────────────────
openai_start = code.index('async function _fetchOpenAI(messages, apiKey) {')
depth = 0
i = openai_start
while i < len(code):
    if code[i] == '{': depth += 1
    elif code[i] == '}':
        depth -= 1
        if depth == 0:
            openai_end = i + 1
            break
    i += 1

openai_new = '''// Shared SSE reader for OpenAI-compatible APIs
async function _readSSE(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', full = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop();
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') return full;
            try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) { full += delta; onChunk(full); }
            } catch {}
        }
    }
    return full;
}

async function _fetchOpenAI(messages, apiKey, onChunk) {
    if (!apiKey) throw new Error('Please add your OpenAI API key in Settings');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages, stream: true })
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error('OpenAI API error ' + res.status + (errBody ? ': ' + errBody.slice(0, 150) : ''));
    }
    return _readSSE(res, onChunk);
}'''

code = code[:openai_start] + openai_new + code[openai_end:]
print('✓ _fetchOpenAI + _readSSE replaced')

# ── 3. Replace _fetchGroq ─────────────────────────────────────────────────────
groq_start = code.index('async function _fetchGroq(messages, apiKey) {')
depth = 0
i = groq_start
while i < len(code):
    if code[i] == '{': depth += 1
    elif code[i] == '}':
        depth -= 1
        if depth == 0:
            groq_end = i + 1
            break
    i += 1

groq_new = '''async function _fetchGroq(messages, apiKey, onChunk) {
    if (!apiKey) throw new Error('Free key \u2014 sign up at groq.com, get key at console.groq.com/keys');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages, stream: true })
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const msg = errBody ? errBody.slice(0, 150) : '';
        if (res.status === 401) throw new Error('Invalid API key. Get one at console.groq.com/keys');
        throw new Error('Groq API error ' + res.status + (msg ? ': ' + msg : ''));
    }
    return _readSSE(res, onChunk);
}'''

code = code[:groq_start] + groq_new + code[groq_end:]
print('✓ _fetchGroq replaced')

with open('src/main.js', 'w') as f:
    f.write(code)

print('All done — src/main.js updated')
