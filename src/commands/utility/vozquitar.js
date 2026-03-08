const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const config = require('../../config');
const tempVoiceStore = require('../../utils/temp-voice-store');

function isChannelPrivate(channel, guildId) {
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(guildId);
    if (!everyoneOverwrite) return false;
    return everyoneOverwrite.deny.has(PermissionsBitField.Flags.Connect)
        || everyoneOverwrite.deny.has(PermissionsBitField.Flags.ViewChannel);
}

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
        .setName('vozquitar')
        .setDescription('Quita el acceso de un usuario a tu canal temporal privado')
        .addUserOption((option) =>
            option
                .setName('usuario')
                .setDescription('Usuario al que deseas quitar acceso')
                .setRequired(true)
        ),
    cooldown: 4,
    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({ content: 'Este comando solo funciona dentro de un servidor.', flags: 64 });
        }

        const lookup = await getOwnedTempChannel(interaction);
        if (lookup.error) {
            return interaction.reply({ content: lookup.error, flags: 64 });
        }

        const { channel } = lookup;
        const targetUser = interaction.options.getUser('usuario', true);

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: 'No puedes quitarte a ti mismo. Usa `/vozprivado activar:false` si quieres abrir el canal.', flags: 64 });
        }

        if (!isChannelPrivate(channel, interaction.guild.id)) {
            return interaction.reply({
                content: 'Tu canal no está en modo privado. Usa `/vozprivado activar:true` primero.',
                flags: 64
            });
        }

        const targetMember = interaction.guild.members.cache.get(targetUser.id)
            || await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.reply({ content: 'No pude encontrar ese usuario en el servidor.', flags: 64 });
        }

        try {
            await channel.permissionOverwrites.delete(targetMember.id).catch(async () => {
                await channel.permissionOverwrites.edit(targetMember.id, {
                    ViewChannel: true,
                    Connect: false,
                    Speak: false,
                    Stream: false,
                    UseVAD: false
                });
            });

            if (targetMember.voice?.channelId === channel.id) {
                await targetMember.voice.setChannel(null, 'Acceso removido del canal privado').catch(() => null);
            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(config.embedColor)
                        .setTitle('🚫 Usuario removido')
                        .setDescription(`Se quitó el acceso de **${targetMember.user.tag}** a tu canal privado.`)
                ],
                flags: 64
            });
        } catch (error) {
            console.error('Error en /vozquitar:', error);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('No pude quitar al usuario. Revisa permisos del bot.')
                ],
                flags: 64
            });
        }
    }
};
