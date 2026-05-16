const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../config');
const tts = require('../../utils/tts-voice-manager');

const REASON_MESSAGES = {
    no_voice: 'Entra primero a un **canal de voz**. Luego ejecuta **`/tts unir`** en el canal de texto del que quieres leer mensajes.',
    ya_conectado: 'EyedBot ya está en tu **canal de voz**. Este canal de texto queda configurado para leer mensajes (o usa **`/tts escuchar`**).',
    voz_ocupada: 'El bot **ya tiene conexión de voz** (suele ser la **música**). Pon **`/stop`**, espera que salga del canal y vuelve con **`/tts unir`**.',
    sin_permiso: 'Al bot le faltan permisos **Conectar** y **Hablar** en ese canal de voz.',
    fallo_red: 'No se pudo establecer la conexión de voz. Intenta de nuevo más tarde.',
    vacio: 'Escribe un texto válido.',
    cola_llena: 'Hay demasiados mensajes encolados (máximo 14). Usa **`/tts vaciar`** o espera un momento.',
    no_guild: 'Este comando solo funciona dentro de un servidor.',
    no_sesion: 'No hay sesión de TTS activa.',
    ok: ''
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('EyedBot lee texto en alto en llamadas de voz (texto-a-voz)')
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
            sub.setName('salir').setDescription('Desconecta EyedBot del canal de voz'))
        .addSubcommand((sub) =>
            sub
                .setName('decir')
                .setDescription('Opcional: encola una frase sin escribir en el chat')
                .addStringOption((opt) =>
                    opt
                        .setName('texto')
                        .setDescription('Texto que se leerá (máx. 900 caracteres en total)')
                        .setRequired(true)
                        .setMaxLength(500)))
        .addSubcommand((sub) => sub.setName('vaciar').setDescription('Vacia la cola de mensajes pendientes'))
        .addSubcommand((sub) =>
            sub
                .setName('idioma')
                .setDescription('Idioma de la voz (Google TTS)')
                .addStringOption((opt) =>
                    opt
                        .setName('codigo')
                        .setDescription('Código de idioma')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Español', value: 'es' },
                            { name: 'English (US)', value: 'en' },
                            { name: 'Português (BR)', value: 'pt' },
                            { name: 'Français', value: 'fr' },
                            { name: 'Deutsch', value: 'de' },
                            { name: 'Italiano', value: 'it' },
                            { name: '日本語', value: 'ja' },
                            { name: '한국어', value: 'ko' },
                            { name: '中文', value: 'zh-CN' },
                            { name: 'Русский', value: 'ru' },
                            { name: 'Polski', value: 'pl' },
                            { name: 'العربية', value: 'ar' },
                            { name: 'Nederlands', value: 'nl' },
                            { name: 'Svenska', value: 'sv' },
                            { name: 'Türkçe', value: 'tr' },
                            { name: 'Română', value: 'ro' },
                            { name: 'Українська', value: 'uk' },
                            { name: 'Čeština', value: 'cs' },
                            { name: 'Ελληνικά', value: 'el' },
                            { name: 'हिन्दी', value: 'hi' },
                            { name: 'Indonesia', value: 'id' },
                            { name: 'ไทย', value: 'th' },
                            { name: 'Tiếng Việt', value: 'vi' },
                            { name: 'Euskara', value: 'eu' },
                            { name: 'Galego', value: 'gl' }
                        )))
        .addSubcommand((sub) => sub.setName('voces').setDescription('Lista de idiomas y notas')),
    cooldown: 3,
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
                .setTitle('🔊 TTS EyedBot')
                .setDescription(
                    [
                        'Primero **`/tts idioma`** si quieres cambiar la voz (ej. español **`es`**).',
                        'Tras **`/tts unir`**, EyedBot lee **en voz** los mensajes de texto que escriban en ese canal (o el que definas con **`/tts escuchar`**).',
                        'Opcional: **`/tts decir`** para una frase sin usar el chat.',
                        '',
                        '**Notas**',
                        '• Similar a otros bots de TTS: EyedBot se une al canal de voz y reproduce audio sintetizado.',
                        '• El motor usa el servicio público de **Google Translate** (sin API key). Puede fallar o tener límites.',
                        '• No uses **al mismo tiempo** música y TTS si comparten una sola sesión de voz: antes **`/stop`** en música.',
                        '• El bot necesita **`ffmpeg`** (el proyecto incluye `ffmpeg-static`).',
                        '• Cuando **no queda ningún usuario humano** en el canal de voz (solo bots o nadie más), EyedBot **sale al instante**.',
                        '• Opcional: **`TTS_CHAT_ECHO=true`** en `.env` para repetir también el texto cuando uses **`/tts decir`**.',
                        '• Lectura automática del chat: **`TTS_READ_CHAT=false`** en `.env` para desactivarla; **`TTS_READ_SKIP_PREFIX`** (por defecto true) ignora líneas que empiecen por el prefijo del bot.'
                    ].join('\n')
                );
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'idioma') {
            const code = interaction.options.getString('codigo', true);
            tts.setGuildLang(interaction.guildId, code);
            return interaction.reply({
                content: `Idioma **${tts.getGuildLang(interaction.guildId)}** aplicado.`,
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

        if (sub === 'salir') {
            tts.leaveGuild(interaction.guildId);
            return interaction.reply({
                content: '👋 EyedBot ha salido del canal de voz (TTS).',
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

        if (sub === 'decir') {
            await interaction.deferReply({ flags: 64 });

            const text = interaction.options.getString('texto', true);
            const queued = await tts.enqueueSpeak(interaction, text);

            if (!queued.ok) {
                const textHuman = REASON_MESSAGES[queued.reason] || queued.detail || 'Error desconocido.';
                await interaction.editReply({ content: `❌ ${textHuman}` }).catch(() => null);
                return;
            }

            await interaction.editReply({
                content: `✅ Frase encolada. Idioma: **${tts.getGuildLang(interaction.guildId)}** · Pendientes: **${queued.queueLength}**`
            }).catch(() => null);

            /*
             * Opcional: eco breve en el canal de texto (visible para otros)
             */
            try {
                if ((process.env.TTS_CHAT_ECHO || '').toLowerCase() === 'true') {
                    const ch = interaction.channel;
                    if (ch && typeof ch.isTextBased === 'function' && ch.isTextBased()) {
                        await ch.send({
                            content: `📢 **${interaction.user.tag}** (TTS): ${String(text).slice(0, 350)}${text.length > 350 ? '…' : ''}`
                        });
                    }
                }
            } catch {
                /* ignorar falta permiso Send Messages */
            }
        }
    }
};
