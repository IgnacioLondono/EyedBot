const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const Embeds = require('../../utils/embeds');
const bumpReminderStore = require('../../utils/bump-reminder-store');
const { buildNextReminderAt } = require('../../utils/bump-reminder-scheduler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setbumpreminder')
        .setDescription('Configura los recordatorios automáticos de bump')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('configurar')
                .setDescription('Define canal, intervalo y mensaje del recordatorio')
                .addChannelOption((option) =>
                    option
                        .setName('canal')
                        .setDescription('Canal de texto para enviar el recordatorio')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addIntegerOption((option) =>
                    option
                        .setName('intervalo')
                        .setDescription('Intervalo en minutos (15-720). Recomendado: 120')
                        .setMinValue(15)
                        .setMaxValue(720)
                        .setRequired(false))
                .addStringOption((option) =>
                    option
                        .setName('mensaje')
                        .setDescription('Mensaje personalizado para el recordatorio')
                        .setMaxLength(1500)
                        .setRequired(false))
                .addRoleOption((option) =>
                    option
                        .setName('rol')
                        .setDescription('Rol a mencionar en el recordatorio programado (opcional)')
                        .setRequired(false))
                .addBooleanOption((option) =>
                    option
                        .setName('quitar_mencion')
                        .setDescription('Quitar la mención por rol (no uses esto si eliges un rol nuevo)')
                        .setRequired(false))
                .addIntegerOption((option) =>
                    option
                        .setName('xp_bono')
                        .setDescription('XP extra al quien hace bump (0 = desactivado, por defecto 100)')
                        .setMinValue(0)
                        .setMaxValue(5000)
                        .setRequired(false)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('estado')
                .setDescription('Muestra la configuración actual del recordatorio'))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('desactivar')
                .setDescription('Desactiva los recordatorios automáticos'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    cooldown: 5,
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'configurar') {
            const channel = interaction.options.getChannel('canal', true);
            const intervalMinutes = interaction.options.getInteger('intervalo') ?? 120;
            const message = interaction.options.getString('mensaje') || '🔔 Ya puedes hacer `/bump` en Disboard.';
            const quitarMencion = interaction.options.getBoolean('quitar_mencion') === true;
            const rol = interaction.options.getRole('rol');
            const xpBono = interaction.options.getInteger('xp_bono');

            const config = await bumpReminderStore.getBumpReminderConfig(guildId);
            let pingRoleId = config.pingRoleId || '';
            if (quitarMencion) pingRoleId = '';
            else if (rol) pingRoleId = rol.id;

            const updated = await bumpReminderStore.setBumpReminderConfig(guildId, {
                ...config,
                enabled: true,
                channelId: channel.id,
                intervalMinutes,
                message,
                pingRoleId,
                ...(xpBono !== null && xpBono !== undefined ? { bumpXpBonus: xpBono } : {}),
                waitingForBump: false,
                nextReminderAt: buildNextReminderAt(intervalMinutes),
                updatedAt: new Date().toISOString(),
                updatedBy: interaction.user.id
            });

            const mencionLine = updated.pingRoleId
                ? `Mención: <@&${updated.pingRoleId}>`
                : 'Mención: *ninguna*';

            return interaction.reply({
                embeds: [
                    Embeds.success(
                        'Bump reminder configurado',
                        `Canal: ${channel}\nIntervalo: **${updated.intervalMinutes} min**\n${mencionLine}\nBono XP por bump: **${updated.bumpXpBonus || 0}** (0 = desactivado)\nPróximo recordatorio: <t:${Math.floor(Date.parse(updated.nextReminderAt) / 1000)}:R>\nSe envía **un solo** aviso por ciclo; el siguiente se programa cuando Disboard confirme un bump.`
                    )
                ]
            });
        }

        if (subcommand === 'estado') {
            const config = await bumpReminderStore.getBumpReminderConfig(guildId);
            if (!config.enabled || !config.channelId) {
                return interaction.reply({
                    embeds: [Embeds.info('Estado bump reminder', 'Esta desactivado en este servidor.')],
                    flags: 64
                });
            }

            const mencionEstado = config.pingRoleId
                ? `Mención (rol): <@&${config.pingRoleId}>`
                : 'Mención (rol): *ninguna*';

            let proximoAviso;
            if (config.waitingForBump === true) {
                proximoAviso = '**Tras el próximo bump** (ya se envió el recordatorio de este ciclo; el siguiente se programa cuando Disboard confirme un bump).';
            } else if (Number.isFinite(Date.parse(config.nextReminderAt))) {
                proximoAviso = `<t:${Math.floor(Date.parse(config.nextReminderAt) / 1000)}:R>`;
            } else {
                proximoAviso = 'No definido';
            }

            return interaction.reply({
                embeds: [
                    Embeds.info(
                        'Estado bump reminder',
                        `Activo: **Si**\nCanal: <#${config.channelId}>\nIntervalo: **${config.intervalMinutes} min**\n${mencionEstado}\nBono XP por bump: **${config.bumpXpBonus ?? 100}**\nPróximo recordatorio: ${proximoAviso}\nMensaje: ${config.message}`
                    )
                ],
                flags: 64
            });
        }

        if (subcommand === 'desactivar') {
            const config = await bumpReminderStore.getBumpReminderConfig(guildId);
            await bumpReminderStore.setBumpReminderConfig(guildId, {
                ...config,
                enabled: false,
                waitingForBump: false,
                nextReminderAt: '',
                updatedAt: new Date().toISOString(),
                updatedBy: interaction.user.id
            });

            return interaction.reply({
                embeds: [Embeds.warning('Bump reminder desactivado', 'No se enviaran mas recordatorios automáticos.')]
            });
        }

        return interaction.reply({
            embeds: [Embeds.error('Accion no valida', 'Subcomando no reconocido.')],
            flags: 64
        });
    }
};
