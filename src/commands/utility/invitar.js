const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../../config');

function inviteReason(userId) {
    return `EyedBot: invitacion permanente de ${userId}`;
}

function canCreateInvite(channel, member) {
    if (!channel || channel.type !== ChannelType.GuildText) return false;
    const perms = channel.permissionsFor(member);
    return Boolean(
        perms?.has(PermissionFlagsBits.ViewChannel) &&
        perms?.has(PermissionFlagsBits.CreateInstantInvite)
    );
}

function pickInviteChannel(interaction) {
    const me = interaction.guild.members.me;
    const requested = interaction.options.getChannel('canal');
    if (requested && canCreateInvite(requested, me)) return requested;
    if (canCreateInvite(interaction.channel, me)) return interaction.channel;

    return interaction.guild.channels.cache.find((ch) => canCreateInvite(ch, me)) || null;
}

async function findExistingInvite(channel, userId) {
    const invites = await channel.fetchInvites().catch(() => null);
    if (!invites) return null;

    const marker = inviteReason(userId);
    return invites.find((invite) =>
        invite.inviterId === channel.client.user.id &&
        invite.maxAge === 0 &&
        invite.maxUses === 0 &&
        String(invite.reason || '') === marker
    ) || null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invitar')
        .setDescription('Crea tu invitacion permanente del servidor')
        .addChannelOption((option) =>
            option
                .setName('canal')
                .setDescription('Canal de destino de la invitacion (opcional)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        )
        .setDMPermission(false),
    cooldown: 30,
    async execute(interaction) {
        const channel = pickInviteChannel(interaction);
        if (!channel) {
            return interaction.reply({
                content: 'No tengo permisos para crear invitaciones en un canal de texto.',
                flags: 64
            });
        }

        try {
            let invite = await findExistingInvite(channel, interaction.user.id);
            if (!invite) {
                invite = await channel.createInvite({
                    maxAge: 0,
                    maxUses: 0,
                    temporary: false,
                    unique: true,
                    reason: inviteReason(interaction.user.id)
                });
            }

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('Tu invitacion permanente')
                .setDescription(
                    `Enlace: ${invite.url}\nCanal: ${channel}\n\n` +
                    'No caduca y no tiene limite de usos. Guardalo o compartilo cuando quieras.'
                )
                .setFooter({ text: interaction.user.tag });

            return interaction.reply({ embeds: [embed], flags: 64 });
        } catch {
            return interaction.reply({
                content: 'No pude crear la invitacion. Pedile a un admin el permiso Crear invitacion para EyedBot.',
                flags: 64
            });
        }
    }
};
