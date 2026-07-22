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
/** 0 = sin tope (el texto se trocea para Google); >0 limita caracteres totales por línea */
const MAX_INPUT = (() => {
    const n = Number.parseInt(process.env.TTS_MAX_INPUT || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
})();

/** Velocidad de reproducción global (1 = Google nativo). <1 más lento; >1 más rápido. */
const PLAYBACK_SPEED = (() => {
    const n = Number.parseFloat(process.env.TTS_PLAYBACK_SPEED || '0.9');
    if (!Number.isFinite(n)) return 0.9;
    return Math.min(1.35, Math.max(0.65, n));
})();

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
 * Encadena filtros atempo (ffmpeg solo admite 0.5–2.0 por paso).
 * @param {string[]} parts
 * @param {number} tempo
 */
function pushAtempoChain(parts, tempo) {
    let t = Number(tempo);
    if (!Number.isFinite(t) || t <= 0) return;
    for (let i = 0; i < 12 && Math.abs(t - 1) > 0.01; i += 1) {
        if (t > 2) {
            parts.push('atempo=2.0');
            t /= 2;
        } else if (t < 0.5) {
            parts.push('atempo=0.5');
            t /= 0.5;
        } else {
            parts.push(`atempo=${t.toFixed(4)}`);
            t = 1;
        }
    }
}

/**
 * Cambio de tono en semitonos + velocidad global.
 * Primero normaliza a 48 kHz: las MP3 de Google suelen ser ~24 kHz; si se aplica
 * asetrate=48000*ratio directo, la voz queda casi al doble de velocidad.
 * @param {number} semitones
 * @param {number} [speed=1]
 */
function buildPitchAudioFilter(semitones, speed = 1) {
    const semi = Number(semitones) || 0;
    const playback = Number.isFinite(Number(speed)) && Number(speed) > 0 ? Number(speed) : 1;
    const parts = [];

    if (semi) {
        const ratio = Math.pow(2, semi / 12);
        parts.push('aresample=48000', `asetrate=48000*${ratio}`, 'aresample=48000');
        pushAtempoChain(parts, (1 / ratio) * playback);
    } else if (Math.abs(playback - 1) > 0.01) {
        pushAtempoChain(parts, playback);
    }

    return parts.join(',');
}

/**
 * @param {string} inputPath
 * @param {number} semitones
 * @param {number} [speed]
 * @returns {Promise<string>} ruta al MP3 resultante (borra la entrada solo si tiene éxito)
 */
function pitchShiftMp3File(inputPath, semitones, speed = PLAYBACK_SPEED) {
    const filter = buildPitchAudioFilter(semitones, speed);
    if (!filter) return Promise.resolve(inputPath);

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
 * @param {string | { tl?: string; semitones?: number; speed?: number }} langOrVoice código `tl` o perfil desde el catálogo
 * @returns {Promise<string[]>}
 */
async function textToMp3TempFiles(fullText, langOrVoice = 'es') {
    const text = String(fullText || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!text.length) return [];

    let tl = 'es';
    let semitones = 0;
    let speed = PLAYBACK_SPEED;
    if (langOrVoice && typeof langOrVoice === 'object') {
        tl = String(langOrVoice.tl || 'es').trim().slice(0, 24) || 'es';
        semitones = Number(langOrVoice.semitones || 0) || 0;
        if (Number.isFinite(Number(langOrVoice.speed)) && Number(langOrVoice.speed) > 0) {
            speed = Math.min(1.35, Math.max(0.65, Number(langOrVoice.speed)));
        }
    } else {
        tl = String(langOrVoice || 'es').trim().slice(0, 24) || 'es';
    }

    const clipped = MAX_INPUT > 0 ? text.slice(0, MAX_INPUT) : text;
    const parts = chunkText(clipped);
    const out = [];
    const base = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const needsFx = Boolean(semitones) || Math.abs(speed - 1) > 0.01;

    for (let i = 0; i < parts.length; i += 1) {
        const mp3 = await fetchTtsMp3Chunk(parts[i], tl);
        let p = path.join(os.tmpdir(), `eyedbot-tts-${base}-${i}.mp3`);
        fs.writeFileSync(p, mp3);
        if (needsFx) {
            try {
                p = await pitchShiftMp3File(p, semitones, speed);
            } catch (e) {
                console.warn('⚠️ TTS pitch/speed ffmpeg falló (se usa audio crudo):', e?.message || e);
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
    buildPitchAudioFilter,
    MAX_INPUT,
    CHUNK_SIZE,
    PLAYBACK_SPEED
};
