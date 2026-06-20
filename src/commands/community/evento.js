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
        .setName('evento')
        .setDescription('Gestiona eventos del servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub
            .setName('crear')
            .setDescription('Programa un evento y publícalo')
            .addStringOption((opt) => opt.setName('titulo').setDescription('Nombre del evento').setRequired(true))
            .addStringOption((opt) => opt
                .setName('inicio')
                .setDescription('Fecha/hora ISO o timestamp Unix (segundos)')
                .setRequired(true))
            .addStringOption((opt) => opt.setName('descripcion').setDescription('Detalles del evento'))
            .addStringOption((opt) => opt.setName('lugar').setDescription('Canal de voz, enlace o ubicación'))
            .addChannelOption((opt) => opt.setName('canal').setDescription('Canal donde anunciar')))
        .addSubcommand((sub) => sub
            .setName('listar')
            .setDescription('Lista eventos programados'))
        .addSubcommand((sub) => sub
            .setName('cancelar')
            .setDescription('Cancela un evento')
            .addStringOption((opt) => opt.setName('id').setDescription('ID del evento').setRequired(true))),
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
            const rawStart = interaction.options.getString('inicio');
            let startAt = '';
            if (/^\d{10,13}$/.test(String(rawStart || '').trim())) {
                const num = Number(rawStart);
                startAt = new Date(rawStart.length >= 13 ? num : num * 1000).toISOString();
            } else {
                const parsed = Date.parse(rawStart);
                if (!Number.isFinite(parsed)) {
                    await safeReply(interaction, {
                        content: 'Fecha inválida. Usa ISO (2026-06-20T20:00:00) o timestamp Unix.',
                        flags: 64
                    });
                    return;
                }
                startAt = new Date(parsed).toISOString();
            }

            const channel = interaction.options.getChannel('canal')
                || interaction.guild.channels.cache.get(cfg.defaultChannelId)
                || interaction.channel;

            let eventRow = await eventsStore.saveServerEvent(interaction.guild.id, {
                title: interaction.options.getString('titulo'),
                description: interaction.options.getString('descripcion') || '',
                location: interaction.options.getString('lugar') || '',
                channelId: channel?.id || '',
                startAt,
                hostId: interaction.user.id,
                status: 'scheduled'
            });

            eventRow = await giveawayService.publishServerEvent(interaction.client, interaction.guild, eventRow);

            await safeReply(interaction, {
                content: `📅 Evento publicado en <#${eventRow.channelId}> · ID: \`${eventRow.id}\``,
                flags: 64
            });
            return;
        }

        if (sub === 'listar') {
            const rows = await eventsStore.listServerEvents(interaction.guild.id);
            const upcoming = rows.filter((row) => row.status !== 'cancelled' && row.status !== 'completed').slice(0, 10);
            if (!upcoming.length) {
                await safeReply(interaction, { content: 'No hay eventos programados.', flags: 64 });
                return;
            }
            const lines = upcoming.map((row) => {
                const ts = Math.floor(Date.parse(row.startAt) / 1000);
                return `• \`${row.id.slice(0, 8)}\` · **${row.title}** · <t:${ts}:f> · ${row.status}`;
            });
            await safeReply(interaction, { content: `**Eventos**\n${lines.join('\n')}`, flags: 64 });
            return;
        }

        if (sub === 'cancelar') {
            const id = interaction.options.getString('id');
            const eventRow = await eventsStore.getServerEvent(interaction.guild.id, id);
            if (!eventRow) {
                await safeReply(interaction, { content: 'Evento no encontrado.', flags: 64 });
                return;
            }
            eventRow.status = 'cancelled';
            await eventsStore.saveServerEvent(interaction.guild.id, eventRow);
            await safeReply(interaction, { content: `❌ Evento **${eventRow.title}** cancelado.`, flags: 64 });
        }
    }
};
