const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Genera enlaces de invitacion')
        .addSubcommand(subcommand =>
            subcommand
                .setName('bot')
                .setDescription('Genera un enlace para invitar el bot'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('servidor')
                .setDescription('Genera una invitacion permanente del servidor')
                .addChannelOption(option =>
                    option
                        .setName('canal')
                        .setDescription('Canal de texto para crear la invitacion (opcional)')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)))
        .setDMPermission(false),
    cooldown: 5,
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'bot') {
            const clientId = process.env.CLIENT_ID || interaction.client.user.id;
            const permissions = '8';
            const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('Invitar Bot')
                .setDescription(`[Haz clic aqui para invitar el bot](${inviteUrl})`)
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

            return interaction.reply({ embeds: [embed] });
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.CreateInstantInvite)) {
            return interaction.reply({
                content: 'No tienes permiso para crear invitaciones en este servidor.',
                flags: 64
            });
        }

        const guild = interaction.guild;
        let channel = interaction.options.getChannel('canal');

        if (!channel) {
            channel = guild.channels.cache.find((ch) => {
                if (ch.type !== ChannelType.GuildText) return false;
                const perms = ch.permissionsFor(guild.members.me);
                return perms?.has(PermissionFlagsBits.ViewChannel) && perms?.has(PermissionFlagsBits.CreateInstantInvite);
            }) || null;
        }

        if (!channel || channel.type !== ChannelType.GuildText) {
            return interaction.reply({
                content: 'No encontre un canal de texto donde pueda crear la invitacion.',
                flags: 64
            });
        }

        const myPerms = channel.permissionsFor(guild.members.me);
        const userPerms = channel.permissionsFor(interaction.member);
        if (!myPerms?.has(PermissionFlagsBits.CreateInstantInvite)) {
            return interaction.reply({
                content: 'No tengo permisos para crear invitaciones en ese canal.',
                flags: 64
            });
        }

        if (!userPerms?.has(PermissionFlagsBits.CreateInstantInvite)) {
            return interaction.reply({
                content: 'No tienes permiso para crear invitaciones en ese canal.',
                flags: 64
            });
        }

        try {
            const invite = await channel.createInvite({
                maxAge: 0,
                maxUses: 0,
                temporary: false,
                unique: false,
                reason: `Invitacion permanente generada por ${interaction.user.tag}`
            });

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('Invitacion Permanente')
                .setDescription(`Canal: ${channel}\nEnlace: ${invite.url}`)
                .setFooter({ text: `Generado por ${interaction.user.tag}` });

            return interaction.reply({ embeds: [embed] });
        } catch {
            return interaction.reply({
                content: 'No pude crear la invitacion. Revisa permisos del bot y del canal.',
                flags: 64
            });
        }
    }
};













