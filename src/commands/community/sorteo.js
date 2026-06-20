const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const eventsStore = require('../../utils/events-giveaways-store');
const giveawayService = require('../../utils/giveaway-service');
const { safeReply } = require('../../utils/interactions');

function hasManageEvents(member) {
    return member?.permissions?.has(PermissionFlagsBits.ManageGuild)
        || member?.permissions?.has(PermissionFlagsBits.Administrator);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sorteo')
        .setDescription('Gestiona sorteos del servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub
            .setName('crear')
            .setDescription('Crea un sorteo con botón de participación')
            .addStringOption((opt) => opt.setName('premio').setDescription('Qué se sortea').setRequired(true))
            .addIntegerOption((opt) => opt
                .setName('duracion')
                .setDescription('Duración en minutos (ej. 60 = 1 hora)')
                .setRequired(true)
                .setMinValue(5)
                .setMaxValue(20160))
            .addStringOption((opt) => opt.setName('titulo').setDescription('Título del sorteo'))
            .addChannelOption((opt) => opt.setName('canal').setDescription('Canal donde publicar'))
            .addIntegerOption((opt) => opt
                .setName('ganadores')
                .setDescription('Cantidad de ganadores')
                .setMinValue(1)
                .setMaxValue(10))
            .addRoleOption((opt) => opt.setName('rol_requerido').setDescription('Rol necesario para participar')))
        .addSubcommand((sub) => sub
            .setName('terminar')
            .setDescription('Finaliza un sorteo antes de tiempo')
            .addStringOption((opt) => opt.setName('id').setDescription('ID del sorteo').setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('reroll')
            .setDescription('Vuelve a sortear ganadores')
            .addStringOption((opt) => opt.setName('id').setDescription('ID del sorteo').setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('lista')
            .setDescription('Lista sorteos activos')),
    cooldown: 3,
    async execute(interaction) {
        if (!interaction.guild) {
            await safeReply(interaction, { content: 'Este comando solo funciona en servidores.', flags: 64 });
            return;
        }

        if (!hasManageEvents(interaction.member)) {
            await safeReply(interaction, { content: 'Necesitas permiso de Gestionar servidor.', flags: 64 });
            return;
        }

        const sub = interaction.options.getSubcommand();
        const cfg = await eventsStore.getConfig(interaction.guild.id);

        if (sub === 'crear') {
            const channel = interaction.options.getChannel('canal')
                || interaction.guild.channels.cache.get(cfg.defaultChannelId)
                || interaction.channel;
            const giveaway = await giveawayService.createGiveaway(interaction.client, interaction.guild, {
                title: interaction.options.getString('titulo') || 'Sorteo',
                prize: interaction.options.getString('premio'),
                durationMinutes: interaction.options.getInteger('duracion'),
                winnersCount: interaction.options.getInteger('ganadores') || 1,
                channelId: channel?.id,
                hostId: interaction.user.id,
                requiredRoleId: interaction.options.getRole('rol_requerido')?.id || '',
                color: cfg.color
            });

            await safeReply(interaction, {
                content: `🎉 Sorteo creado en <#${giveaway.channelId}> · ID: \`${giveaway.id}\``,
                flags: 64
            });
            return;
        }

        if (sub === 'terminar') {
            const id = interaction.options.getString('id');
            const ended = await giveawayService.endGiveaway(interaction.client, interaction.guild.id, id, {
                hostId: interaction.user.id
            });
            await safeReply(interaction, {
                content: `✅ Sorteo **${ended.title}** finalizado.${ended.winners?.length ? ` Ganadores: ${ended.winners.map((uid) => `<@${uid}>`).join(', ')}` : ''}`,
                flags: 64
            });
            return;
        }

        if (sub === 'reroll') {
            const id = interaction.options.getString('id');
            const ended = await giveawayService.endGiveaway(interaction.client, interaction.guild.id, id, {
                reroll: true,
                hostId: interaction.user.id
            });
            await safeReply(interaction, {
                content: `🔁 Nuevos ganadores: ${ended.winners.map((uid) => `<@${uid}>`).join(', ') || '—'}`,
                flags: 64
            });
            return;
        }

        if (sub === 'lista') {
            const rows = await eventsStore.listGiveaways(interaction.guild.id, 'active');
            if (!rows.length) {
                await safeReply(interaction, { content: 'No hay sorteos activos.', flags: 64 });
                return;
            }
            const lines = rows.slice(0, 10).map((row) => (
                `• \`${row.id.slice(0, 8)}\` · **${row.title}** · ${row.prize} · ${row.entries.length} participantes`
            ));
            await safeReply(interaction, { content: `**Sorteos activos**\n${lines.join('\n')}`, flags: 64 });
        }
    }
};
