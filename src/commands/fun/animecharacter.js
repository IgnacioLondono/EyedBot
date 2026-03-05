const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

const DEFAULT_GIPHY_KEY = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC';

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

async function getCharacterFull(characterId) {
    const { data } = await axios.get(`${JIKAN_BASE}/characters/${characterId}/full`, { timeout: 12000 });
    return data?.data || null;
}

async function getRandomGlobalCharacter(type) {
    const attempts = type === 'cualquiera' ? 1 : 12;

    for (let i = 0; i < attempts; i += 1) {
        const { data } = await axios.get(`${JIKAN_BASE}/random/characters`, { timeout: 12000 });
        const candidate = data?.data;
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
        for (const entry of sample) {
            const detail = await getCharacterFull(entry.character.mal_id);
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

async function fetchCharacterGif(character) {
    if (!DEFAULT_GIPHY_KEY) return null;

    try {
        const query = `${character.name} ${character.anime} anime`;
        const { data } = await axios.get('https://api.giphy.com/v1/gifs/search', {
            timeout: 9000,
            params: {
                api_key: DEFAULT_GIPHY_KEY,
                q: query,
                limit: 12,
                rating: 'pg-13'
            }
        });

        const gifs = data?.data || [];
        if (!gifs.length) return null;

        const chosen = randomFrom(gifs);
        return (
            chosen?.images?.original?.url ||
            chosen?.images?.downsized_large?.url ||
            chosen?.images?.fixed_height?.url ||
            null
        );
    } catch {
        return null;
    }
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
            const image = result.character.images?.jpg?.image_url || result.character.images?.webp?.image_url || null;
            const profileUrl = result.character.url || null;
            const gifUrl = await fetchCharacterGif({ name: characterName, anime: animeName });

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🎭 Anime Character')
                .setDescription(`**${interaction.user}**, te toco este personaje ultra random:`)
                .addFields(
                    { name: 'Personaje', value: `**${characterName}**`, inline: true },
                    { name: 'Anime', value: animeName, inline: true },
                    { name: 'Tipo', value: typeLabel(type), inline: true },
                    { name: 'Rol detectado', value: result.role || 'Unknown', inline: true },
                    { name: 'Resumen', value: trait, inline: false }
                )
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

            if (profileUrl) embed.setURL(profileUrl);
            if (gifUrl) {
                embed.setImage(gifUrl);
            } else if (image) {
                embed.setThumbnail(image);
            }

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
