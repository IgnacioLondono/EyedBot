/**
 * Síntesis TTS vía endpoint público de Google Translate (client=gtx).
 * Sin API key; sujeto a límites/CORS de Google. Para producción seria, usa un proveedor con clave.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const CHUNK_SIZE = 165;
const MAX_INPUT = 900;

function chunkText(raw) {
    const t = String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!t.length) return [];

    const chunks = [];
    for (let i = 0; i < t.length; i += CHUNK_SIZE) {
        chunks.push(t.slice(i, i + CHUNK_SIZE));
    }
    return chunks;
}

/**
 * @param {string} text
 * @param {string} lang Código BCP-47 simple (es, en, pt, fr, ...)
 * @returns {Promise<Buffer>}
 */
async function fetchTtsMp3Chunk(text, lang = 'es') {
    const tl = String(lang || 'es').trim().slice(0, 12) || 'es';
    const q = String(text || '').trim();
    if (!q) throw new Error('texto_vacio');

    const url = `https://translate.google.com/translate_tts?client=gtx&ie=UTF-8&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`;
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20_000,
        maxContentLength: 2 * 1024 * 1024,
        headers: {
            'User-Agent': UA,
            Referer: 'https://translate.google.com/'
        },
        validateStatus: (s) => s === 200
    });
    const buf = Buffer.from(res.data || []);
    if (buf.length < 200) {
        throw new Error('audio_muy_corto');
    }
    return buf;
}

/**
 * Devuelve rutas a MP3 temporales (una o varias); el llamador debe borrarlas.
 * @param {string} fullText
 * @param {string} lang
 * @returns {Promise<string[]>}
 */
async function textToMp3TempFiles(fullText, lang = 'es') {
    const text = String(fullText || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!text.length) return [];

    const clipped = text.slice(0, MAX_INPUT);
    const parts = chunkText(clipped);
    const out = [];
    const base = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    for (let i = 0; i < parts.length; i += 1) {
        const mp3 = await fetchTtsMp3Chunk(parts[i], lang);
        const p = path.join(os.tmpdir(), `eyedbot-tts-${base}-${i}.mp3`);
        fs.writeFileSync(p, mp3);
        out.push(p);
        if (i < parts.length - 1) {
            await new Promise((r) => setTimeout(r, 150));
        }
    }

    return out;
}

module.exports = {
    chunkText,
    textToMp3TempFiles,
    MAX_INPUT,
    CHUNK_SIZE
};
