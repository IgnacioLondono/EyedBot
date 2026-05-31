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
    ya_conectado: 'EyedBot ya está en tu **canal de voz**. Este canal de texto queda configurado para leer mensajes (o usa **`/tts escuchar`**).',
    voz_ocupada: 'El bot **ya tiene conexión de voz** (suele ser la **música**). Pon **`/stop`**, espera que salga del canal y vuelve con **`/tts unir`**.',
    sin_permiso: 'Al bot le faltan permisos **Conectar** y **Hablar** en ese canal de voz.',
    fallo_red: 'No se pudo establecer la conexión de voz. Intenta de nuevo más tarde.',
    no_guild: 'Este comando solo funciona dentro de un servidor.'
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
        if (interaction.options.getSubcommand() !== 'idioma') return;
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
                        'Tras **`/tts unir`**, se leen en voz los mensajes del **canal de texto configurado**. **`/tts escuchar`** cambia ese canal.'
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
                            '• No se leen mensajes de **bots/webhooks** ni mensajes que sean **solo enlaces**.'
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
                    : `Conectado a **${interaction.member?.voice?.channel?.name || 'voz'}**. Mensajes escritos aquí (**y en hilos de este canal**) se leen en llamada.`)
                : (REASON_MESSAGES[result.reason] || 'No se pudo conectar.');

            return interaction.reply({ content: `${result.ok ? '✅' : '❌'} ${msg}`, flags: 64 });
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
