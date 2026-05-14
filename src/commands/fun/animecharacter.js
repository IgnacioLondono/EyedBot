const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');

const JIKAN_BASE = 'https://api.jikan.moe/v4';

function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function typeLabel(type) {
    switch (type) {
        case 'protagonista':
            return 'Protagonista';
        case 'secundario':
            return 'Secundario';
        case 'villano':
            return 'Villano';
        default:
            return 'Cualquiera';
    }
}

/** Rol que devuelve MAL en animeography; texto legible en español. */
function malRoleLabel(role) {
    const r = String(role || '').trim();
    if (!r || r === 'Unknown') return 'No indicado';
    const map = {
        Main: 'Principal (protagonista)',
        Supporting: 'Secundario',
        Background: 'Secundario menor'
    };
    return map[r] || r;
}

function normalizeText(text) {
    return (text || '').toLowerCase();
}

function isLikelyVillain(text) {
    const about = normalizeText(text);
    if (!about) return false;
    return ['villain', 'antagonist', 'enemigo', 'malvado', 'evil'].some((word) => about.includes(word));
}

function roleMatchesType(type, role, about) {
    if (type === 'cualquiera') return true;
    if (type === 'protagonista') return role === 'Main';
    if (type === 'secundario') return role === 'Supporting';
    if (type === 'villano') return isLikelyVillain(about);
    return true;
}

async function fetchRandomCharacterCandidate() {
    const { data } = await axios.get(`${JIKAN_BASE}/random/characters`, { timeout: 12000 });
    const candidate = data?.data;
    if (!candidate?.mal_id) return null;
    return candidate;
}

async function getCharacterFull(characterId) {
    const { data } = await axios.get(`${JIKAN_BASE}/characters/${characterId}/full`, { timeout: 12000 });
    return data?.data || null;
}

async function getRandomGlobalCharacter(type) {
    const attempts = type === 'cualquiera' ? 1 : 12;
    const batchSize = type === 'cualquiera' ? 1 : 4;

    for (let i = 0; i < attempts; i += batchSize) {
        const batch = await Promise.all(
            Array.from({ length: Math.min(batchSize, attempts - i) }, () => fetchRandomCharacterCandidate().catch(() => null))
        );

        for (const candidate of batch) {
            if (!candidate?.mal_id) continue;

            if (type === 'cualquiera') {
                return {
                    character: candidate,
                    animeName: 'Random global (MAL)',
                    role: 'Unknown',
                    about: candidate.about || ''
                };
            }

            const full = await getCharacterFull(candidate.mal_id);
            const animeography = full?.anime || [];
            const roleMatch = animeography.find((entry) => roleMatchesType(type, entry.role, full?.about || ''));

            if (roleMatch) {
                return {
                    character: full,
                    animeName: roleMatch?.anime?.title || 'Anime desconocido',
                    role: roleMatch.role || 'Unknown',
                    about: full?.about || ''
                };
            }
        }
    }

    return null;
}

async function searchAnimeByName(animeName) {
    const { data } = await axios.get(`${JIKAN_BASE}/anime`, {
        timeout: 12000,
        params: {
            q: animeName,
            limit: 10,
            sfw: true,
            order_by: 'members',
            sort: 'desc'
        }
    });

    const list = data?.data || [];
    if (!list.length) return null;

    const normalized = normalizeText(animeName);
    const exact = list.find((item) => normalizeText(item.title).includes(normalized));
    return exact || list[0];
}

async function getRandomCharacterFromAnime(animeName, type) {
    const anime = await searchAnimeByName(animeName);
    if (!anime?.mal_id) return null;

    const { data } = await axios.get(`${JIKAN_BASE}/anime/${anime.mal_id}/characters`, { timeout: 12000 });
    const raw = data?.data || [];

    let filtered = raw;
    if (type === 'protagonista') {
        filtered = raw.filter((entry) => entry.role === 'Main');
    }
    if (type === 'secundario') {
        filtered = raw.filter((entry) => entry.role === 'Supporting');
    }

    if (!filtered.length) return null;
    const selected = randomFrom(filtered);
    const full = await getCharacterFull(selected.character.mal_id);

    // "Villano" se filtra con heuristica usando la biografia del personaje.
    if (type === 'villano' && !isLikelyVillain(full?.about || selected.character?.about || '')) {
        const villainCandidates = [];
        const sample = filtered.slice(0, 18);
        const details = await Promise.all(sample.map(async (entry) => ({
            entry,
            detail: await getCharacterFull(entry.character.mal_id)
        })));

        for (const { entry, detail } of details) {
            if (isLikelyVillain(detail?.about || '')) {
                villainCandidates.push({ entry, detail });
            }
        }
        if (villainCandidates.length) {
            const picked = randomFrom(villainCandidates);
            return {
                character: picked.detail,
                animeName: anime.title,
                role: picked.entry.role || 'Unknown',
                about: picked.detail?.about || ''
            };
        }
        return null;
    }

    return {
        character: full || selected.character,
        animeName: anime.title,
        role: selected.role || 'Unknown',
        about: full?.about || selected.character?.about || ''
    };
}

function pickTrait(about) {
    const clean = (about || '').replace(/\s+/g, ' ').trim();
    if (!clean) return 'Personaje unico con una vibra muy marcada.';
    return clean.length > 220 ? `${clean.slice(0, 217)}...` : clean;
}

/** Retrato oficial del personaje en MAL (JPG/WebP), sin GIFs de terceros. */
function pickCharacterPortraitUrl(character) {
    const jpg = character?.images?.jpg;
    const webp = character?.images?.webp;
    return (
        jpg?.large_image_url ||
        webp?.large_image_url ||
        jpg?.image_url ||
        webp?.image_url ||
        null
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animecharacter')
        .setDescription('Descubre que personaje de anime eres')
        .addStringOption((option) =>
            option
                .setName('anime')
                .setDescription('Nombre del anime para filtrar personajes (ej: naruto)')
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('tipo')
                .setDescription('El tipo de personaje que quieres obtener')
                .setRequired(false)
                .addChoices(
                    { name: 'Protagonista', value: 'protagonista' },
                    { name: 'Secundario', value: 'secundario' },
                    { name: 'Villano', value: 'villano' },
                    { name: 'Cualquiera', value: 'cualquiera' }
                )
        ),
    cooldown: 3,

    async execute(interaction) {
        await interaction.deferReply();

        const animeFilter = interaction.options.getString('anime');
        const type = interaction.options.getString('tipo') || 'cualquiera';

        try {
            const result = animeFilter
                ? await getRandomCharacterFromAnime(animeFilter, type)
                : await getRandomGlobalCharacter(type);

            if (!result?.character) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('⚠️ Sin resultados')
                            .setDescription('No encontre personajes con ese filtro. Prueba con otro anime o tipo.')
                    ]
                });
            }

            const characterName = result.character.name || 'Personaje desconocido';
            const animeName = result.animeName || 'Anime desconocido';
            const trait = pickTrait(result.about);
            const portraitUrl = pickCharacterPortraitUrl(result.character);
            const profileUrl = result.character.url || null;
            const detailFields = [
                { name: 'Tipo de salida', value: typeLabel(type), inline: true },
                { name: 'Rol en la obra (MAL)', value: malRoleLabel(result.role), inline: true },
                { name: 'Biografia', value: trait, inline: false }
            ];

            const requester = interaction.user;
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setAuthor({
                    name: requester.displayName || requester.username,
                    iconURL: requester.displayAvatarURL({ extension: 'png', size: 128 })
                })
                .setTitle(`🎭 ${characterName}`)
                .setDescription(`**Anime Character**\nObra: **${animeName}**`)
                .addFields(detailFields);

            if (portraitUrl) embed.setImage(portraitUrl);
            if (profileUrl) embed.setURL(profileUrl);
            setInteractionFooter(embed, requester.tag, animeName);

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error en animecharacter:', error?.message || error);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('No pude buscar personajes ahora mismo. Intenta de nuevo en unos segundos.')
                ]
            });
        }

    }
};
