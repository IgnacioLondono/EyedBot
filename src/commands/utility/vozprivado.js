const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const config = require('../../config');
const tempVoiceStore = require('../../utils/temp-voice-store');

async function getOwnedTempChannel(interaction) {
    const guild = interaction.guild;
    if (!guild) return { error: 'Este comando solo funciona dentro de un servidor.' };

    const channelId = await tempVoiceStore.getActiveChannelId(guild.id, interaction.user.id);
    if (!channelId) {
        return { error: 'No tienes un canal temporal activo. Entra primero al canal creador.' };
    }

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
        await tempVoiceStore.clearActiveChannel(guild.id, interaction.user.id, channelId);
        return { error: 'Tu canal temporal ya no existe. Entra de nuevo al canal creador.' };
    }

    const ownerId = await tempVoiceStore.getOwnerByChannelId(guild.id, channel.id);
    if (String(ownerId || '') !== String(interaction.user.id)) {
        return { error: 'No eres el dueño del canal temporal actual.' };
    }

    return { channel };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vozprivado')
        .setDescription('Activa o desactiva el modo privado de tu canal temporal')
        .addBooleanOption((option) =>
            option
                .setName('activar')
                .setDescription('true = privado, false = público')
                .setRequired(true)
        ),
    cooldown: 5,
    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({ content: 'Este comando solo funciona dentro de un servidor.', flags: 64 });
        }

        const activate = interaction.options.getBoolean('activar', true);
        const lookup = await getOwnedTempChannel(interaction);
        if (lookup.error) {
            return interaction.reply({ content: lookup.error, flags: 64 });
        }

        const { channel } = lookup;
        const guildId = interaction.guild.id;

        try {
            if (activate) {
                await channel.permissionOverwrites.edit(guildId, {
                    ViewChannel: false,
                    Connect: false
                });

                await channel.permissionOverwrites.edit(interaction.user.id, {
                    ViewChannel: true,
                    Connect: true,
                    Speak: true,
                    Stream: true,
                    UseVAD: true,
                    MoveMembers: true,
                    MuteMembers: true,
                    DeafenMembers: true,
                    ManageChannels: true
                });

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(config.embedColor)
                            .setTitle('🔒 Canal privado activado')
                            .setDescription('Tu canal temporal ahora es privado. Usa `/vozinvitar` para permitir usuarios.')
                    ],
                    flags: 64
                });
            }

            await channel.permissionOverwrites.delete(guildId).catch(async () => {
                await channel.permissionOverwrites.edit(guildId, {
                    ViewChannel: null,
                    Connect: null
                });
            });

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(config.embedColor)
                        .setTitle('🔓 Canal público activado')
                        .setDescription('Tu canal temporal volvió a modo público.')
                ],
                flags: 64
            });
        } catch (error) {
            console.error('Error en /vozprivado:', error);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('No pude cambiar la privacidad del canal. Revisa permisos del bot.')
                ],
                flags: 64
            });
        }
    }
};
