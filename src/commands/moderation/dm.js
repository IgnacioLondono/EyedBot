const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { safeDeferReply, safeEditReply, safeReply } = require('../../utils/interactions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dm')
        .setDescription('Envía un mensaje privado a un usuario del servidor.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption((option) => option
            .setName('usuario')
            .setDescription('Usuario que recibirá el mensaje.')
            .setRequired(true))
        .addStringOption((option) => option
            .setName('mensaje')
            .setDescription('Contenido del mensaje privado.')
            .setRequired(true)
            .setMaxLength(2000)),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('usuario', true);
        const message = interaction.options.getString('mensaje', true).trim();

        if (!message) {
            await safeReply(interaction, {
                content: 'El mensaje no puede estar vacío.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral });

        try {
            await targetUser.send({
                content: [
                    `**Mensaje del staff de ${interaction.guild.name}**`,
                    message,
                    '',
                    `_Enviado por ${interaction.user.tag}_`
                ].join('\n')
            });
        } catch {
            await safeEditReply(interaction, {
                content: `No pude enviar el mensaje privado a **${targetUser.tag}**. Puede tener los MD cerrados o haberme bloqueado.`
            });
            return;
        }

        await safeEditReply(interaction, {
            content: `Mensaje privado enviado a **${targetUser.tag}**.`
        });
    }
};
