/**
 * Síntesis TTS vía endpoint público de Google Translate (client=gtx).
 * Sin API key; sujeto a límites/CORS de Google. Para producción seria, usa un proveedor con clave.
 * Opcional: variaciones ♂/♀ del catálogo ajustan el tono con ffmpeg (asetrate+atempo).
 */
const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const CHUNK_SIZE = 165;
const MAX_INPUT = 900;

function resolveFfmpegBinary() {
    try {
        const ffmpegStatic = require('ffmpeg-static');
        if (ffmpegStatic && typeof ffmpegStatic === 'string') return ffmpegStatic;
    } catch {
        /* noop */
    }
    return process.env.FFMPEG_PATH || 'ffmpeg';
}

/**
 * Cambio de tono en semitonos (aprox. ♂/♀) sin API extra: asetrate + cadena de atempo.
 * @param {number} semitones
 */
function buildPitchAudioFilter(semitones) {
    const ratio = Math.pow(2, Number(semitones) / 12);
    const parts = [`asetrate=48000*${ratio}`, 'aresample=48000'];
    let tempo = 1 / ratio;
    for (let i = 0; i < 12 && Math.abs(tempo - 1) > 0.02; i += 1) {
        if (tempo > 2) {
            parts.push('atempo=2');
            tempo /= 2;
        } else if (tempo < 0.5) {
            parts.push('atempo=0.5');
            tempo /= 0.5;
        } else {
            parts.push(`atempo=${tempo}`);
            tempo = 1;
        }
    }
    return parts.join(',');
}

/**
 * @param {string} inputPath
 * @param {number} semitones
 * @returns {Promise<string>} ruta al MP3 resultante (borra la entrada solo si tiene éxito)
 */
function pitchShiftMp3File(inputPath, semitones) {
    const semi = Number(semitones);
    if (!semi || semi === 0) return Promise.resolve(inputPath);

    const filter = buildPitchAudioFilter(semi);
    const outPath = path.join(os.tmpdir(), `eyedbot-tts-pitch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);
    const bin = resolveFfmpegBinary();

    return new Promise((resolve, reject) => {
        const args = ['-nostdin', '-y', '-i', inputPath, '-af', filter, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', outPath];
        const ff = spawn(bin, args, { windowsHide: true });
        let err = '';
        ff.stderr?.on('data', (ch) => {
            err += String(ch || '').slice(0, 200);
        });
        ff.on('error', reject);
        ff.on('close', (code) => {
            if (code === 0 && fs.existsSync(outPath)) {
                try {
                    fs.unlink(inputPath, () => null);
                } catch {
                    /* noop */
                }
                resolve(outPath);
                return;
            }
            try {
                fs.unlink(outPath, () => null);
            } catch {
                /* noop */
            }
            reject(new Error(`ffmpeg pitch ${code}: ${err.slice(0, 120)}`));
        });
    });
}

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
    const tl = String(lang || 'es').trim().slice(0, 24) || 'es';
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
 * @param {string | { tl?: string; semitones?: number }} langOrVoice código `tl` o perfil desde el catálogo
 * @returns {Promise<string[]>}
 */
async function textToMp3TempFiles(fullText, langOrVoice = 'es') {
    const text = String(fullText || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!text.length) return [];

    let tl = 'es';
    let semitones = 0;
    if (langOrVoice && typeof langOrVoice === 'object') {
        tl = String(langOrVoice.tl || 'es').trim().slice(0, 24) || 'es';
        semitones = Number(langOrVoice.semitones || 0) || 0;
    } else {
        tl = String(langOrVoice || 'es').trim().slice(0, 24) || 'es';
    }

    const clipped = text.slice(0, MAX_INPUT);
    const parts = chunkText(clipped);
    const out = [];
    const base = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    for (let i = 0; i < parts.length; i += 1) {
        const mp3 = await fetchTtsMp3Chunk(parts[i], tl);
        let p = path.join(os.tmpdir(), `eyedbot-tts-${base}-${i}.mp3`);
        fs.writeFileSync(p, mp3);
        if (semitones) {
            try {
                p = await pitchShiftMp3File(p, semitones);
            } catch (e) {
                console.warn('⚠️ TTS pitch ffmpeg falló (se usa voz neutra):', e?.message || e);
            }
        }
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
