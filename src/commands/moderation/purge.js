const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');
const Embeds = require('../../utils/embeds');
const { purgeUserMessagesInChannel, MAX_SCAN } = require('../../utils/user-message-purge');

function canModerateChannel(interaction, channel) {
    const perms = channel.permissionsFor(interaction.member);
    const botPerms = channel.permissionsFor(interaction.guild.members.me);
    if (!perms?.has(PermissionFlagsBits.ManageMessages)) return false;
    if (!botPerms?.has(PermissionFlagsBits.ManageMessages)) return false;
    if (!botPerms?.has(PermissionFlagsBits.ReadMessageHistory)) return false;
    return true;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Elimina todo el historial de mensajes de un usuario en un canal')
        .addUserOption((option) =>
            option
                .setName('usuario')
                .setDescription('Usuario cuyos mensajes se eliminarán')
                .setRequired(true)
        )
        .addChannelOption((option) =>
            option
                .setName('canal')
                .setDescription('Canal a limpiar (por defecto, el actual)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    cooldown: 15,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario', true);
        const targetChannel =
            interaction.options.getChannel('canal') || interaction.channel;

        if (
            targetChannel.type !== ChannelType.GuildText &&
            targetChannel.type !== ChannelType.GuildAnnouncement
        ) {
            return interaction.reply({
                embeds: [Embeds.error('Canal no válido', 'Solo se pueden limpiar canales de texto o de anuncios.')],
                flags: 64
            });
        }

        if (!canModerateChannel(interaction, targetChannel)) {
            return interaction.reply({
                embeds: [
                    Embeds.error(
                        'Sin permisos',
                        'Tú y el bot necesitáis **Gestionar mensajes** y el bot debe poder **leer el historial** en ese canal.'
                    )
                ],
                flags: 64
            });
        }

        await interaction.deferReply({ flags: 64 });

        let lastProgressAt = 0;

        try {
            const result = await purgeUserMessagesInChannel(targetChannel, user.id, {
                onProgress: async ({ deleted, scanned }) => {
                    const now = Date.now();
                    if (now - lastProgressAt < 4000) return;
                    lastProgressAt = now;
                    await interaction
                        .editReply({
                            embeds: [
                                Embeds.info(
                                    'Limpiando historial…',
                                    `Usuario: **${user.tag}**\nCanal: ${targetChannel}\n\n` +
                                        `Mensajes eliminados: **${deleted}**\nMensajes revisados: **${scanned}**`
                                )
                            ]
                        })
                        .catch(() => null);
                }
            });

            if (result.deleted === 0) {
                await interaction.editReply({
                    embeds: [
                        Embeds.warning(
                            'Sin mensajes',
                            `No se encontraron mensajes eliminables de **${user.tag}** en ${targetChannel}.`
                        )
                    ]
                });
                return;
            }

            let description =
                `Se eliminaron **${result.deleted}** mensaje(s) de **${user.tag}** en ${targetChannel}.\n` +
                `Mensajes revisados en el historial: **${result.scanned}**.`;

            if (result.hitScanLimit) {
                description +=
                    `\n\n⚠️ Se alcanzó el límite de revisión (${MAX_SCAN.toLocaleString('es-ES')} mensajes). ` +
                    'Ejecuta el comando de nuevo si el canal es muy grande y aún quedan mensajes del usuario.';
            }

            await interaction.editReply({
                embeds: [Embeds.success('Historial eliminado', description)]
            });

            setTimeout(() => {
                interaction.deleteReply().catch(() => null);
            }, 8000);
        } catch (error) {
            console.error('Error en purge:', error);
            await interaction
                .editReply({
                    embeds: [
                        Embeds.error(
                            'Error',
                            `No se pudo completar la limpieza: ${error.message || 'Error desconocido'}`
                        )
                    ]
                })
                .catch(() => null);
        }
    }
};
