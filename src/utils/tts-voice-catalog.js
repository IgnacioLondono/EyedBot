/**
 * Catálogo de “voces” para TTS (Google translate_tts).
 * Variantes ♀♂ = ajuste de tono ligero por ffmpeg (no son voces distintas de Google).
 */

/** @typedef {{ id: string, tl: string, semitones: number, name: string }} TtsVoiceEntry */

/** @type {TtsVoiceEntry[]} */
let BUILT_CATALOG = [];

function tri(flag, title, tl, id) {
    const base = `${flag} ${title}`;
    return [
        { id, tl: String(tl), semitones: 0, name: `${base} · neutra` },
        {
            id: `${id}_grave`,
            tl: String(tl),
            semitones: -2,
            name: `${base} · ♂ hombre · tono grave`
        },
        {
            id: `${id}_aguda`,
            tl: String(tl),
            semitones: 2,
            name: `${base} · ♀ mujer · tono aguda`
        }
    ];
}

function solo(flag, title, tl, id) {
    return [{ id, tl: String(tl), semitones: 0, name: `${flag} ${title}` }];
}

function buildCatalog() {
    const chunks = [];

    chunks.push(...tri('🇪🇸', 'Español (España)', 'es', 'es_es'));
    chunks.push(...tri('🇲🇽', 'Español (Latinoamérica)', 'es-419', 'es_lat'));
    chunks.push(...tri('🇦🇷', 'Español (Argentina)', 'es-419', 'es_ar'));
    chunks.push(...tri('🇺🇸', 'English (United States)', 'en', 'en_us'));
    chunks.push(...tri('🇬🇧', 'English (United Kingdom)', 'en-gb', 'en_gb'));
    chunks.push(...tri('🇮🇪', 'English (Ireland)', 'en-ie', 'en_ie'));
    chunks.push(...tri('🇨🇦', 'English (Canada)', 'en-ca', 'en_ca'));
    chunks.push(...tri('🇦🇺', 'English (Australia)', 'en-au', 'en_au'));
    chunks.push(...tri('🇳🇿', 'English (New Zealand)', 'en-nz', 'en_nz'));
    chunks.push(...tri('🇸🇬', 'English (Singapore)', 'en-sg', 'en_sg'));
    chunks.push(...tri('🇮🇳', 'English (India)', 'en-in', 'en_in'));
    chunks.push(...tri('🇿🇦', 'English (South Africa)', 'en-za', 'en_za'));
    chunks.push(...tri('🇧🇷', 'Português (Brasil)', 'pt-BR', 'pt_br'));
    chunks.push(...tri('🇵🇹', 'Português (Portugal)', 'pt', 'pt_pt'));
    chunks.push(...tri('🇦🇴', 'Português (Angola)', 'pt', 'pt_ao'));
    chunks.push(...tri('🇫🇷', 'Français (France)', 'fr', 'fr_fr'));
    chunks.push(...tri('🇨🇦', 'Français (Canada)', 'fr-ca', 'fr_ca'));
    chunks.push(...tri('🇩🇪', 'Deutsch (DE)', 'de', 'de_de'));
    chunks.push(...tri('🇦🇹', 'Deutsch (Österreich)', 'de-at', 'de_at'));
    chunks.push(...tri('🇨🇭', 'Deutsch (Schweiz)', 'de-CH', 'de_ch'));
    chunks.push(...tri('🇮🇹', 'Italiano', 'it', 'it_it'));
    chunks.push(...tri('🇳🇱', 'Nederlands', 'nl', 'nl_nl'));
    chunks.push(...tri('🇸🇪', 'Svenska', 'sv', 'sv_sv'));
    chunks.push(...tri('🇳🇴', 'Norsk Bokmål', 'no', 'no_no'));
    chunks.push(...tri('🇩🇰', 'Dansk', 'da', 'da_dk'));
    chunks.push(...tri('🇫🇮', 'Suomi', 'fi', 'fi_fi'));
    chunks.push(...tri('🇵🇱', 'Polski', 'pl', 'pl_pl'));
    chunks.push(...tri('🇷🇺', 'Русский', 'ru', 'ru_ru'));
    chunks.push(...tri('🇺🇦', 'Українська', 'uk', 'uk_ua'));
    chunks.push(...tri('🇷🇴', 'Română', 'ro', 'ro_ro'));
    chunks.push(...tri('🇹🇷', 'Türkçe', 'tr', 'tr_tr'));
    chunks.push(...tri('🇬🇷', 'Ελληνικά', 'el', 'el_gr'));
    chunks.push(...tri('🇨🇿', 'Čeština', 'cs', 'cs_cz'));
    chunks.push(...tri('🇸🇮', 'Slovenščina', 'sl', 'sl_si'));
    chunks.push(...tri('🇭🇺', 'Magyar', 'hu', 'hu_hu'));
    chunks.push(...tri('🇧🇬', 'Български', 'bg', 'bg_bg'));
    chunks.push(...tri('🇭🇷', 'Hrvatski', 'hr', 'hr_hr'));
    chunks.push(...tri('🇷🇸', 'Српски', 'sr', 'sr_rs'));
    chunks.push(...tri('🇯🇵', '日本語', 'ja', 'ja_jp'));
    chunks.push(...tri('🇰🇷', '한국어', 'ko', 'ko_kr'));
    chunks.push(...tri('🇨🇳', '中文 (简体)', 'zh-CN', 'zh_cn'));
    chunks.push(...tri('🇹🇼', '中文 (繁體)', 'zh-TW', 'zh_tw'));
    chunks.push(...tri('🇸🇦', 'العربية', 'ar', 'ar_sa'));
    chunks.push(...tri('🇮🇱', 'עברית', 'he', 'he_il'));
    chunks.push(...tri('🇮🇷', 'فارسی', 'fa', 'fa_ir'));
    chunks.push(...tri('🇮🇩', 'Bahasa Indonesia', 'id', 'id_id'));
    chunks.push(...tri('🇲🇾', 'Bahasa Melayu', 'ms', 'ms_my'));
    chunks.push(...tri('🇹🇭', 'ไทย', 'th', 'th_th'));
    chunks.push(...tri('🇻🇳', 'Tiếng Việt', 'vi', 'vi_vn'));
    chunks.push(...tri('🇵🇭', 'Filipino', 'fil', 'fil_ph'));
    chunks.push(...tri('🇮🇳', 'हिन्दी', 'hi', 'hi_in'));
    chunks.push(...tri('🇧🇩', 'বাংলা', 'bn', 'bn_bd'));
    chunks.push(...tri('🇵🇰', 'اردو', 'ur', 'ur_pk'));
    chunks.push(...tri('🇱🇰', 'தமிழ்', 'ta', 'ta_in'));
    chunks.push(...tri('🇪🇸', 'Euskara', 'eu', 'eu_es'));
    chunks.push(...tri('🇪🇸', 'Galego', 'gl', 'gl_es'));
    chunks.push(...tri('🇪🇸', 'Català', 'ca', 'ca_es'));
    chunks.push(...solo('🇮🇪', 'Gaeilge', 'ga', 'ga_ie'));
    chunks.push(...solo('🇬🇧', 'Cymraeg', 'cy', 'cy_gb'));
    chunks.push(...solo('🇰🇪', 'Kiswahili', 'sw', 'sw_ke'));
    chunks.push(...solo('🇿🇦', 'Afrikaans', 'af', 'af_za'));
    chunks.push(...solo('🇪🇪', 'Eesti', 'et', 'et_ee'));
    chunks.push(...solo('🇱🇻', 'Latviešu', 'lv', 'lv_lv'));
    chunks.push(...solo('🇱🇹', 'Lietuvių', 'lt', 'lt_lt'));

    const seen = new Set();
    for (const e of chunks) {
        if (seen.has(e.id)) throw new Error(`Duplicate TTS voice id: ${e.id}`);
        seen.add(e.id);
    }
    return chunks;
}

BUILT_CATALOG = buildCatalog();

const BY_ID = new Map(BUILT_CATALOG.map((e) => [e.id, e]));

/** Primer registro por código `tl` neutral (solo minúsculas como clave). */
const BY_TL = new Map();
for (const e of BUILT_CATALOG) {
    if (e.semitones !== 0) continue;
    const k = e.tl.toLowerCase();
    if (!BY_TL.has(k)) BY_TL.set(k, e);
}

const DEFAULT_VOICE_ID = 'es_es';

function envDefaultVoiceId() {
    const v = String(process.env.TTS_DEFAULT_VOICE || '').trim();
    if (v && BY_ID.has(v)) return v;
    const tl = String(process.env.TTS_DEFAULT_LANG || 'es').trim().toLowerCase();
    if (tl && BY_TL.has(tl)) return BY_TL.get(tl).id;
    const guess = BUILT_CATALOG.find((e) => e.tl.toLowerCase() === tl && e.semitones === 0);
    if (guess) return guess.id;
    return DEFAULT_VOICE_ID;
}

/**
 * @param {string} raw
 * @returns {TtsVoiceEntry}
 */
function resolveVoiceChoice(raw) {
    const s = String(raw || '').trim();
    if (!s) return BY_ID.get(envDefaultVoiceId()) || BY_ID.get(DEFAULT_VOICE_ID);

    if (BY_ID.has(s)) return BY_ID.get(s);

    const low = s.toLowerCase();
    if (BY_ID.has(low)) return BY_ID.get(low);

    const tlMatch = BUILT_CATALOG.find((e) => e.tl.toLowerCase() === low && e.semitones === 0);
    if (tlMatch) return tlMatch;

    return BY_ID.get(envDefaultVoiceId()) || BY_ID.get(DEFAULT_VOICE_ID);
}

/**
 * @param {string} q
 * @returns {TtsVoiceEntry[]}
 */
function searchVoices(q) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) {
        const prefer = [
            'es_es',
            'es_lat',
            'es_ar',
            'en_us',
            'en_gb',
            'en_au',
            'pt_br',
            'pt_pt',
            'fr_fr',
            'de_de',
            'de_at',
            'it_it',
            'ja_jp',
            'ko_kr',
            'zh_cn',
            'ru_ru',
            'ar_sa',
            'hi_in',
            'tr_tr'
        ];
        const out = [];
        const used = new Set();
        for (const id of prefer) {
            const e = BY_ID.get(id);
            if (e && !used.has(e.id)) {
                out.push(e);
                used.add(e.id);
            }
        }
        for (const e of BUILT_CATALOG) {
            if (out.length >= 25) break;
            if (!used.has(e.id)) {
                out.push(e);
                used.add(e.id);
            }
        }
        return out.slice(0, 25);
    }

    const scored = [];
    for (const e of BUILT_CATALOG) {
        const idl = e.id.toLowerCase();
        const namel = e.name.toLowerCase();
        const tll = e.tl.toLowerCase();
        let score = 0;
        if (idl === needle || tll === needle) score = 1000;
        else if (idl.startsWith(needle) || tll.startsWith(needle)) score = 500;
        else if (namel.startsWith(needle)) score = 400;
        else if (namel.includes(needle) || idl.includes(needle) || tll.includes(needle)) score = 200;
        if (score > 0) scored.push({ e, score });
    }
    scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));
    return scored.slice(0, 25).map((x) => x.e);
}

/**
 * Etiqueta legible si tenemos voiceId pendiente o en sesión.
 * @param {string | undefined} guildPendingVoiceId
 * @param {{ voiceId?: string } | undefined} session
 */
function formatGuildVoiceDisplay(guildPendingVoiceId, session) {
    const vid = guildPendingVoiceId || session?.voiceId;
    if (vid && BY_ID.has(vid)) return BY_ID.get(vid).name;
    if (vid) return vid;
    return BY_ID.get(envDefaultVoiceId())?.name || 'Español';
}

/** Muestra breve para embed (el catálogo completo se elige con autocomplete). */
function getVocesSampleLines(maxLines = 18) {
    return BUILT_CATALOG.slice(0, maxLines).map((e) => `• ${e.name} — \`${e.id}\``).join('\n');
}

module.exports = {
    TTS_VOICE_CATALOG: BUILT_CATALOG,
    DEFAULT_VOICE_ID,
    envDefaultVoiceId,
    resolveVoiceChoice,
    searchVoices,
    formatGuildVoiceDisplay,
    getVocesSampleLines
};
