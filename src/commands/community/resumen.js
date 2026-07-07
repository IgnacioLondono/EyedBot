const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const store = require('../../utils/weekly-summary-store');
const service = require('../../utils/weekly-summary-service');
const { safeReply, safeDeferReply, safeEditReply } = require('../../utils/interactions');

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function hasManage(member) {
    return member?.permissions?.has(PermissionFlagsBits.ManageGuild)
        || member?.permissions?.has(PermissionFlagsBits.Administrator);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resumen')
        .setDescription('Resumen semanal de actividad del servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub
            .setName('canal')
            .setDescription('Activa el resumen y define el canal donde se publica')
            .addChannelOption((opt) => opt
                .setName('canal')
                .setDescription('Canal de texto para el resumen')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true))
            .addIntegerOption((opt) => opt
                .setName('dia')
                .setDescription('Día de la semana (por defecto Domingo)')
                .addChoices(
                    { name: 'Domingo', value: 0 },
                    { name: 'Lunes', value: 1 },
                    { name: 'Martes', value: 2 },
                    { name: 'Miércoles', value: 3 },
                    { name: 'Jueves', value: 4 },
                    { name: 'Viernes', value: 5 },
                    { name: 'Sábado', value: 6 }
                ))
            .addIntegerOption((opt) => opt
                .setName('hora')
                .setDescription('Hora local 0-23 (por defecto 20)')
                .setMinValue(0)
                .setMaxValue(23))
            .addRoleOption((opt) => opt
                .setName('mencion')
                .setDescription('Rol a mencionar al publicar (opcional)')))
        .addSubcommand((sub) => sub
            .setName('preview')
            .setDescription('Muestra cómo se vería el resumen (solo para ti)'))
        .addSubcommand((sub) => sub
            .setName('enviar')
            .setDescription('Publica el resumen ahora en el canal configurado'))
        .addSubcommand((sub) => sub
            .setName('estado')
            .setDescription('Muestra la configuración actual del resumen'))
        .addSubcommand((sub) => sub
            .setName('desactivar')
            .setDescription('Desactiva el resumen semanal automático')),
    cooldown: 3,
    async execute(interaction) {
        if (!interaction.guild) {
            return safeReply(interaction, { content: 'Este comando solo funciona en servidores.', flags: 64 });
        }
        if (!hasManage(interaction.member)) {
            return safeReply(interaction, { content: 'Necesitas permiso de Gestionar servidor.', flags: 64 });
        }

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'canal') {
            const channel = interaction.options.getChannel('canal');
            const day = interaction.options.getInteger('dia');
            const hour = interaction.options.getInteger('hora');
            const mention = interaction.options.getRole('mencion');

            const patch = { enabled: true, channelId: channel.id, updatedBy: interaction.user.id };
            if (day !== null) patch.dayOfWeek = day;
            if (hour !== null) patch.hour = hour;
            if (mention) patch.mentionRoleId = mention.id;

            const cfg = await store.setConfig(guildId, patch);
            return safeReply(interaction, {
                content: `✅ Resumen semanal **activado** en <#${cfg.channelId}>.\n`
                    + `🗓️ Se publicará cada **${DAYS_ES[cfg.dayOfWeek]}** a las **${String(cfg.hour).padStart(2, '0')}:00** (${cfg.timezone}).`
                    + `${cfg.mentionRoleId ? `\n🔔 Mencionará a <@&${cfg.mentionRoleId}>.` : ''}`,
                flags: 64
            });
        }

        if (sub === 'preview') {
            await safeDeferReply(interaction, { flags: 64 });
            const embed = await service.previewWeeklySummary(interaction.client, guildId).catch(() => null);
            if (!embed) {
                return safeEditReply(interaction, { content: 'No pude generar el resumen (¿servidor sin datos aún?).' });
            }
            return safeEditReply(interaction, { embeds: [embed] });
        }

        if (sub === 'enviar') {
            await safeDeferReply(interaction, { flags: 64 });
            const cfg = await store.getConfig(guildId);
            if (!cfg.channelId) {
                return safeEditReply(interaction, { content: 'Primero define el canal con `/resumen canal`.' });
            }
            const result = await service.sendWeeklySummary(interaction.client, guildId, { rotate: false }).catch(() => ({ ok: false, reason: 'error' }));
            if (!result.ok) {
                const reasons = {
                    no_channel: 'No hay canal configurado.',
                    channel_invalid: 'El canal configurado no es válido o no tengo acceso.',
                    guild_unavailable: 'No pude acceder al servidor.',
                    error: 'Ocurrió un error al publicar.'
                };
                return safeEditReply(interaction, { content: `❌ ${reasons[result.reason] || 'No se pudo publicar.'}` });
            }
            return safeEditReply(interaction, { content: `✅ Resumen publicado en <#${cfg.channelId}>.` });
        }

        if (sub === 'estado') {
            const cfg = await store.getConfig(guildId);
            const lines = [
                `**Estado:** ${cfg.enabled ? '🟢 Activado' : '🔴 Desactivado'}`,
                `**Canal:** ${cfg.channelId ? `<#${cfg.channelId}>` : '_sin definir_'}`,
                `**Cuándo:** ${DAYS_ES[cfg.dayOfWeek]} a las ${String(cfg.hour).padStart(2, '0')}:00 (${cfg.timezone})`,
                `**Comparativa vs semana pasada:** ${cfg.compare ? 'Sí' : 'No'}`,
                `**Mención:** ${cfg.mentionRoleId ? `<@&${cfg.mentionRoleId}>` : '_ninguna_'}`,
                `**Última publicación:** ${cfg.lastPostedDate || '_nunca_'}`
            ];
            return safeReply(interaction, { content: lines.join('\n'), flags: 64 });
        }

        if (sub === 'desactivar') {
            await store.setConfig(guildId, { enabled: false, updatedBy: interaction.user.id });
            return safeReply(interaction, { content: '🔴 Resumen semanal **desactivado**. La configuración se conserva.', flags: 64 });
        }

        return safeReply(interaction, { content: 'Subcomando no reconocido.', flags: 64 });
    }
};
