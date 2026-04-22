const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { useQueue } = require('discord-player');
const config = require('../../config');
const { safeDeferReply, safeEditReply } = require('../../utils/interactions');
const { getMusicSystem } = require('./_common');
const {
    savePlaylist,
    getPlaylist,
    getPlaylistInGuild,
    deletePlaylist,
    listPlaylistsForUser,
    listPlaylistsForGuild,
    MAX_TRACKS_PER_PLAYLIST
} = require('../../utils/saved-playlists-store');

function formatDurationFromMs(ms) {
    const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = Math.floor(total % 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function collectQueueTracks(queue) {
    if (!queue) return [];
    const tracks = [];
    const current = queue.currentTrack;
    if (current) {
        tracks.push({
            title: current.title,
            artist: current.author,
            url: (current.url || current.uri || '').toString(),
            durationMs: Number(current.durationMS) || 0,
            thumbnail: current.thumbnail || null
        });
    }
    const arr = queue.tracks?.toArray?.() || [];
    for (const t of arr) {
        tracks.push({
            title: t.title,
            artist: t.author,
            url: (t.url || t.uri || '').toString(),
            durationMs: Number(t.durationMS) || 0,
            thumbnail: t.thumbnail || null
        });
    }
    return tracks;
}

async function runSave(interaction) {
    const name = interaction.options.getString('nombre', true);
    const overwrite = interaction.options.getBoolean('sobrescribir') ?? false;

    const queue = useQueue(interaction.guild.id);
    const tracks = collectQueueTracks(queue);
    if (!tracks.length) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ Cola vacía')
                .setDescription('No hay música reproduciéndose. Añade canciones a la cola antes de guardar.')]
        });
    }

    try {
        const saved = await savePlaylist({
            guildId: interaction.guild.id,
            ownerId: interaction.user.id,
            name,
            tracks,
            overwrite
        });

        const totalMs = saved.tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('💾 Playlist guardada')
                .setDescription(`**${saved.name}** — ${saved.tracks.length} canciones guardadas.`)
                .addFields(
                    { name: '⏱️ Duración total', value: formatDurationFromMs(totalMs), inline: true },
                    { name: '🙋 Autor', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🔑 Slug', value: `\`${saved.slug}\``, inline: true }
                )
                .setFooter({ text: `Carga con /playlist load nombre:${saved.name}` })]
        });
    } catch (error) {
        if (error?.code === 'PLAYLIST_EXISTS') {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Ya existe')
                    .setDescription(error.message)]
            });
        }
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FF4545')
                .setTitle('❌ Error al guardar')
                .setDescription(error?.message || 'Error desconocido.')]
        });
    }
}

async function runLoad(interaction) {
    const name = interaction.options.getString('nombre', true);
    const append = interaction.options.getBoolean('añadir') ?? true;

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('Debes estar en un canal de voz.')]
        });
    }
    if (!voiceChannel.joinable) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('No puedo unirme a tu canal de voz.')]
        });
    }

    let record = await getPlaylist(interaction.guild.id, interaction.user.id, name);
    if (!record) record = await getPlaylistInGuild(interaction.guild.id, name);

    if (!record) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ No encontrada')
                .setDescription(`No hay ninguna playlist guardada con el nombre **${name}**.\nUsa \`/playlist list\` para ver tus playlists.`)]
        });
    }

    const musicSystem = getMusicSystem(interaction);
    const nodeOptions = musicSystem.buildNodeOptions(interaction.channel);

    if (!append) {
        const currentQueue = useQueue(interaction.guild.id);
        if (currentQueue) currentQueue.delete();
    }

    let added = 0;
    let failed = 0;

    for (const track of record.tracks || []) {
        if (!track?.url) { failed++; continue; }
        const played = await interaction.client.player.play(voiceChannel, track.url, {
            requestedBy: interaction.user,
            nodeOptions,
            searchEngine: 'youtube'
        }).catch(() => null);
        if (played?.track) {
            if (track.title) played.track.title = track.title;
            if (track.artist) played.track.author = track.artist;
            if (track.thumbnail) played.track.thumbnail = track.thumbnail;
            added++;
        } else {
            failed++;
        }
    }

    const ownerMention = record.ownerId === interaction.user.id ? 'tuya' : `de <@${record.ownerId}>`;
    return safeEditReply(interaction, {
        embeds: [new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🎵 Playlist cargada')
            .setDescription(`Playlist **${record.name}** ${ownerMention} — ${added} canciones añadidas.`)
            .addFields(
                { name: '✅ Añadidas', value: `${added}`, inline: true },
                failed > 0 ? { name: '⚠️ Fallaron', value: `${failed}`, inline: true } : { name: '\u200b', value: '\u200b', inline: true },
                { name: '💽 Reemplazar cola', value: append ? 'No' : 'Sí', inline: true }
            )]
    });
}

async function runList(interaction) {
    const scope = interaction.options.getString('alcance') || 'mias';
    const items = scope === 'servidor'
        ? await listPlaylistsForGuild(interaction.guild.id)
        : await listPlaylistsForUser(interaction.guild.id, interaction.user.id);

    if (!items.length) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('📂 Sin playlists')
                .setDescription(scope === 'servidor'
                    ? 'Nadie ha guardado playlists en este servidor todavía.'
                    : 'No tienes playlists guardadas. Usa `/playlist save` para crear una.')]
        });
    }

    const lines = items.slice(0, 25).map((item, idx) => {
        const owner = item.ownerId ? `<@${item.ownerId}>` : 'Desconocido';
        const updated = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—';
        return `**${idx + 1}. ${item.name}** — ${item.tracks?.length || 0} tracks · ${owner} · _${updated}_`;
    });

    return safeEditReply(interaction, {
        embeds: [new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(scope === 'servidor' ? '📂 Playlists del servidor' : '📂 Tus playlists')
            .setDescription(lines.join('\n').substring(0, 3900))
            .setFooter({ text: `Mostrando ${Math.min(items.length, 25)} de ${items.length}` })]
    });
}

async function runDelete(interaction) {
    const name = interaction.options.getString('nombre', true);
    const ok = await deletePlaylist(interaction.guild.id, interaction.user.id, name);
    if (!ok) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ No encontrada')
                .setDescription(`No tienes una playlist llamada **${name}** para eliminar.`)]
        });
    }
    return safeEditReply(interaction, {
        embeds: [new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🗑️ Playlist eliminada')
            .setDescription(`Se eliminó la playlist **${name}**.`)]
    });
}

async function runShow(interaction) {
    const name = interaction.options.getString('nombre', true);
    let record = await getPlaylist(interaction.guild.id, interaction.user.id, name);
    if (!record) record = await getPlaylistInGuild(interaction.guild.id, name);

    if (!record) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ No encontrada')
                .setDescription(`No existe una playlist con el nombre **${name}** en este servidor.`)]
        });
    }

    const lines = (record.tracks || []).slice(0, 20).map((t, idx) => `**${idx + 1}.** ${t.title}${t.artist ? ` — *${t.artist}*` : ''}`);
    const remaining = Math.max(0, (record.tracks || []).length - 20);

    return safeEditReply(interaction, {
        embeds: [new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`📀 ${record.name}`)
            .setDescription(lines.length ? lines.join('\n') : '_Playlist vacía._')
            .addFields(
                { name: '🙋 Autor', value: record.ownerId ? `<@${record.ownerId}>` : 'Desconocido', inline: true },
                { name: '🎶 Canciones', value: `${record.tracks?.length || 0}`, inline: true },
                { name: '🔑 Slug', value: `\`${record.slug}\``, inline: true }
            )
            .setFooter({ text: remaining > 0 ? `Y ${remaining} más...` : `/playlist load nombre:${record.name}` })]
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Administra playlists guardadas (cola actual como playlist).')
        .addSubcommand((sub) =>
            sub.setName('save')
                .setDescription('Guarda la cola actual como una playlist.')
                .addStringOption((o) => o.setName('nombre').setDescription('Nombre para la playlist').setRequired(true))
                .addBooleanOption((o) => o.setName('sobrescribir').setDescription('¿Sobrescribir si ya existe?').setRequired(false)))
        .addSubcommand((sub) =>
            sub.setName('load')
                .setDescription('Carga una playlist guardada a la cola.')
                .addStringOption((o) => o.setName('nombre').setDescription('Nombre de la playlist').setRequired(true))
                .addBooleanOption((o) => o.setName('añadir').setDescription('¿Añadir a la cola actual en vez de reemplazar?').setRequired(false)))
        .addSubcommand((sub) =>
            sub.setName('list')
                .setDescription('Lista playlists guardadas.')
                .addStringOption((o) => o.setName('alcance').setDescription('De quién').setRequired(false)
                    .addChoices({ name: 'mías', value: 'mias' }, { name: 'servidor', value: 'servidor' })))
        .addSubcommand((sub) =>
            sub.setName('show')
                .setDescription('Muestra las canciones de una playlist.')
                .addStringOption((o) => o.setName('nombre').setDescription('Nombre de la playlist').setRequired(true)))
        .addSubcommand((sub) =>
            sub.setName('delete')
                .setDescription('Elimina una playlist guardada (solo tuya).')
                .addStringOption((o) => o.setName('nombre').setDescription('Nombre de la playlist').setRequired(true))),
    cooldown: 3,

    async execute(interaction) {
        await safeDeferReply(interaction);
        const sub = interaction.options.getSubcommand();
        if (sub === 'save') return runSave(interaction);
        if (sub === 'load') return runLoad(interaction);
        if (sub === 'list') return runList(interaction);
        if (sub === 'show') return runShow(interaction);
        if (sub === 'delete') return runDelete(interaction);

        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Subcomando inválido').setDescription(`El subcomando ${sub} no está soportado.`)]
        });
    }
};

module.exports.MAX_TRACKS_PER_PLAYLIST = MAX_TRACKS_PER_PLAYLIST;
