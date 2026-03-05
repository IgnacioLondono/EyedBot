const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Muestra información de un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario (por defecto tú)')
                .setRequired(false)),
    cooldown: 3,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario') || interaction.user;
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('Usuario no encontrado en el servidor.')],
                flags: 64
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`Información de ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'ID', value: user.id, inline: true },
                { name: 'Apodo', value: member.nickname || 'Ninguno', inline: true },
                { name: 'Bot', value: user.bot ? 'Sí' : 'No', inline: true },
                { name: 'Cuenta creada', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Se unió', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
                { name: 'Roles', value: member.roles.cache.size.toString(), inline: true }
            )
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};






