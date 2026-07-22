const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../config');
const tts = require('../../utils/tts-voice-manager');
const { searchVoices, getVocesSampleLines } = require('../../utils/tts-voice-catalog');

/** @param {string} s @param {number} max */
function truncateChoiceName(s, max = 100) {
    const t = String(s);
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

const REASON_MESSAGES = {
    no_voice: 'Entra primero a un **canal de voz**. Luego ejecuta **`/tts unir`** en el canal de texto del que quieres leer mensajes.',
    ya_conectado: 'EyedBot ya está en tu **canal de voz**. Solo se leen mensajes de quien tiene permiso para hablar (tú + invitados con **`/tts permitir`**).',
    voz_ocupada: 'El bot **ya tiene conexión de voz** (suele ser la **música**). Pon **`/stop`**, espera que salga del canal y vuelve con **`/tts unir`**.',
    sin_permiso: 'Al bot le faltan permisos **Conectar** y **Hablar** en ese canal de voz.',
    fallo_red: 'No se pudo establecer la conexión de voz. Intenta de nuevo más tarde.',
    no_guild: 'Este comando solo funciona dentro de un servidor.',
    no_sesion: 'No hay sesión TTS activa. Primero usa **`/tts unir`**.',
    sin_permiso_hablantes: 'Solo quien ejecutó **`/tts unir`** (o un admin del servidor) puede gestionar quién habla.',
    es_dueno: 'No puedes quitar al dueño de la sesión TTS. Usa **`/tts unir`** tú mismo para tomar el control.',
    usuario_invalido: 'Usuario no válido.'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('Texto a voz en llamadas: une al canal y lee el chat del canal configurado')
        .addSubcommand((sub) =>
            sub
                .setName('unir')
                .setDescription('Une EyedBot al canal de voz en el que estás'))
        .addSubcommand((sub) =>
            sub
                .setName('escuchar')
                .setDescription('Define el canal de texto que se leerá en voz (mientras TTS está en llamada)')
                .addChannelOption((opt) =>
                    opt
                        .setName('canal')
                        .setDescription('Texto normal o anuncios del servidor')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)))
        .addSubcommand((sub) =>
            sub
                .setName('permitir')
                .setDescription('Permite que otro usuario hable por TTS con una voz propia')
                .addUserOption((opt) =>
                    opt
                        .setName('usuario')
                        .setDescription('Miembro al que se le permitirá hablar')
                        .setRequired(true))
                .addStringOption((opt) =>
                    opt
                        .setName('voz')
                        .setDescription('Voz distinta para esa persona (autocomplete)')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand((sub) =>
            sub
                .setName('quitar')
                .setDescription('Quita el permiso de hablar por TTS a un usuario')
                .addUserOption((opt) =>
                    opt
                        .setName('usuario')
                        .setDescription('Miembro al que se le quita el permiso')
                        .setRequired(true)))
        .addSubcommand((sub) =>
            sub.setName('hablantes').setDescription('Lista quién puede hablar por TTS y con qué voz'))
        .addSubcommand((sub) =>
            sub.setName('desconectar').setDescription('Desconecta EyedBot del canal de voz (TTS)'))
        .addSubcommand((sub) =>
            sub.setName('salir').setDescription('Alias de desconectar: sale del canal de voz'))
        .addSubcommand((sub) => sub.setName('vaciar').setDescription('Vacia la cola de mensajes pendientes'))
        .addSubcommand((sub) =>
            sub
                .setName('idioma')
                .setDescription(
                    'Voz con banderas, variantes ♀♂ (tono ffmpeg) y muchos idiomas · escribe para buscar en autocomplete'
                )
                .addStringOption((opt) =>
                    opt
                        .setName('voz')
                        .setDescription('Ej.: españa · mujer · en-au · mujer japón … (autocomplete)')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand((sub) => sub.setName('voces').setDescription('Lista de idiomas y notas')),
    cooldown: 3,
    async autocomplete(interaction) {
        if (!tts.envTtsEnabled() || !interaction.inGuild()) return;
        const sub = interaction.options.getSubcommand(false);
        if (sub !== 'idioma' && sub !== 'permitir') return;
        const focused = interaction.options.getFocused(true);
        if (focused.name !== 'voz') return;
        try {
            const hits = searchVoices(String(focused.value || ''));
            await interaction.respond(
                hits.slice(0, 25).map((e) => ({
                    name: truncateChoiceName(e.name),
                    value: e.id
                }))
            );
        } catch {
            await interaction.respond([]).catch(() => null);
        }
    },
    async execute(interaction) {
        if (!tts.envTtsEnabled()) {
            return interaction.reply({
                content: 'El texto-a-voz está desactivado en este servidor (variable `TTS_ENABLED`).',
                flags: 64
            });
        }

        if (!interaction.inGuild()) {
            return interaction.reply({
                content: REASON_MESSAGES.no_guild,
                flags: 64
            });
        }

        const sub = interaction.options.getSubcommand(true);

        if (sub === 'voces') {
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🔊 Voces EyedBot (🇪🇸 🇲🇽 ♀♂ …)')
                .setDescription(
                    [
                        '**`/tts idioma`** → campo **voz**: escribe y elige país, **♀ mujer · tono aguda** o **♂ hombre · tono grave**, o inglés/US, etc.',
                        'El motor es **Google Translate TTS**: una voz sintética por idioma/región real; ♀♂ **imita** registros graves/agudos con **ffmpeg**.',
                        '',
                        'Tras **`/tts unir`**, se leen en voz **tus mensajes** en el canal configurado.',
                        'Con **`/tts permitir @usuario voz:`** le das permiso y le asignas **otra voz**.'
                    ].join('\n')
                )
                .addFields({
                    name: '🎙 Muestra del catálogo (hay muchas más vía autocomplete)',
                    value: truncateChoiceName(getVocesSampleLines(14), 1024)
                })
                .addFields({
                    name: '⚙️ Notas',
                    value:
                        [
                            '• **`TTS_DEFAULT_VOICE`** + **`TTS_DEFAULT_LANG`** en `.env`: id interno tipo `es_es` o código `tl` genérico (`es`).',
                            '• Música y TTS **no funcionan solo** con una conexión: **`/stop`** en música primero.',
                            '• **`ffmpeg`** requerido (**`ffmpeg-static`** en el proyecto).',
                            '• El bot **permanece en llamada** aunque no haya mensajes; solo sale si **no queda nadie** en el canal de voz o con **`/tts desconectar`**.',
                            '• **`TTS_READ_CHAT=false`** desactiva leer mensajes · **`TTS_READ_SKIP_PREFIX`** evita líneas con prefijo del bot.',
                            '• No se leen mensajes de **bots/webhooks** ni mensajes que sean **solo enlaces**.',
                            '• Por defecto solo se lee al dueño de **`/tts unir`** y a quienes invites con **`/tts permitir`** (cada uno con su voz).',
                            '• Por defecto se lee el **mensaje completo** (sin límite de 400 caracteres).'
                        ].join('\n')
                });

            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'idioma') {
            const voiceId = interaction.options.getString('voz', true);
            tts.setGuildVoiceId(interaction.guildId, voiceId);
            return interaction.reply({
                content: `Voz aplicada: **${tts.getGuildVoiceDisplay(interaction.guildId)}**`,
                flags: 64
            });
        }

        if (sub === 'escuchar') {
            const ch = interaction.options.getChannel('canal', true);
            if (ch.guildId !== interaction.guildId) {
                return interaction.reply({
                    content: '❌ Ese canal no pertenece a este servidor.',
                    flags: 64
                });
            }
            const okListen = tts.setGuildListenChannel(interaction.guildId, ch.id);
            if (!okListen) {
                return interaction.reply({ content: '❌ Canal no válido.', flags: 64 });
            }
            const inVc = !!interaction.guild?.members.me?.voice?.channel;
            const footer = inVc ? '' : ' Cuando ejecutes **`/tts unir`**, usaré este canal para leer el chat.';
            return interaction.reply({
                content: `📢 Voy a leer mensajes escritos en ${ch}.${footer}`,
                flags: 64
            });
        }

        if (sub === 'unir') {
            const result = await tts.joinSession(interaction);
            const msg = result.ok
                ? (result.reason === 'ya_conectado'
                    ? REASON_MESSAGES.ya_conectado
                    : `Conectado a **${interaction.member?.voice?.channel?.name || 'voz'}**. Se leen **tus** mensajes en este canal (**y en hilos**). Invita a otros con **\`/tts permitir @usuario\`** y elige **su voz**.`)
                : (REASON_MESSAGES[result.reason] || 'No se pudo conectar.');

            return interaction.reply({ content: `${result.ok ? '✅' : '❌'} ${msg}`, flags: 64 });
        }

        if (sub === 'permitir') {
            const user = interaction.options.getUser('usuario', true);
            const voiceChoice = interaction.options.getString('voz', true);
            if (user.bot) {
                return interaction.reply({ content: '❌ No se puede permitir a un bot.', flags: 64 });
            }
            const result = tts.allowSpeaker(interaction.guildId, user.id, interaction, voiceChoice);
            if (!result.ok) {
                const msg = result.reason === 'sin_permiso'
                    ? REASON_MESSAGES.sin_permiso_hablantes
                    : (REASON_MESSAGES[result.reason] || 'No se pudo permitir.');
                return interaction.reply({ content: `❌ ${msg}`, flags: 64 });
            }
            return interaction.reply({
                content: `✅ ${user} ya puede hablar por TTS con la voz **${result.voiceDisplay}**.`,
                flags: 64
            });
        }

        if (sub === 'quitar') {
            const user = interaction.options.getUser('usuario', true);
            const result = tts.revokeSpeaker(interaction.guildId, user.id, interaction);
            if (!result.ok) {
                const msg = result.reason === 'sin_permiso'
                    ? REASON_MESSAGES.sin_permiso_hablantes
                    : (REASON_MESSAGES[result.reason] || 'No se pudo quitar el permiso.');
                return interaction.reply({ content: `❌ ${msg}`, flags: 64 });
            }
            return interaction.reply({
                content: `✅ Se quitó el permiso de hablar por TTS a ${user}.`,
                flags: 64
            });
        }

        if (sub === 'hablantes') {
            const result = tts.listSpeakers(interaction.guildId);
            if (!result.ok) {
                return interaction.reply({ content: `❌ ${REASON_MESSAGES.no_sesion}`, flags: 64 });
            }
            const lines = result.speakers.map((entry) => {
                const mark = entry.isOwner ? ' (dueño)' : '';
                return `• <@${entry.userId}>${mark} → **${entry.voiceDisplay}**`;
            });
            return interaction.reply({
                content: `🗣️ Pueden hablar por TTS ahora:\n${lines.join('\n') || '• Nadie'}`,
                flags: 64
            });
        }

        if (sub === 'desconectar' || sub === 'salir') {
            const hadSession = tts.hasGuildSession(interaction.guildId);
            tts.leaveGuild(interaction.guildId);
            return interaction.reply({
                content: hadSession
                    ? '👋 EyedBot se ha desconectado del canal de voz (TTS).'
                    : 'ℹ️ No había sesión TTS activa en este servidor.',
                flags: 64
            });
        }

        if (sub === 'vaciar') {
            const ok = tts.clearQueue(interaction);
            return interaction.reply({
                content: ok ? '🗑️ Cola vaciada (y lectura actual detenida).' : 'No había sesión TTS.',
                flags: 64
            });
        }
    }
};
