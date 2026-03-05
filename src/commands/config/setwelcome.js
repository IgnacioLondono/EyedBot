const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');
const welcomeStore = require('../../utils/welcome-config-store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setwelcome')
        .setDescription('Establece el canal de bienvenida')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal de bienvenida')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    cooldown: 5,
    async execute(interaction) {
        const channel = interaction.options.getChannel('canal');

        if (!channel.isTextBased()) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'El canal debe ser de texto.')],
                flags: 64
            });
        }

        await welcomeStore.setWelcomeChannelId(interaction.guild.id, channel.id);

        return interaction.reply({
            embeds: [Embeds.success('Canal de Bienvenida', `Canal de bienvenida establecido en ${channel}.`)]
        });
    }
};






