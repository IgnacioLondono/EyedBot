const { EmbedBuilder } = require('discord.js');
const MusicSystem = require('../cogs/music/index');

module.exports = {
    name: 'player',
    execute(queue, event) {
        const { track, error } = event;
        const client = queue?.metadata?.client;
        if (!client) return;

        const musicSystem = client.musicSystem || new MusicSystem(client);
        if (!client.musicSystem) client.musicSystem = musicSystem;

        switch (event.type) {
            case 'trackStart':
                if (queue?.metadata?.channel && queue?.guild?.id) {
                    void musicSystem.sendNowPlayingEmbed(queue.guild.id, queue.metadata.channel, track, false);
                }
                break;

            case 'trackEnd':
                break;

            case 'error':
                if (queue.metadata && queue.metadata.channel) {
                    queue.metadata.channel.send({
                        embeds: [new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('❌ Error de Reproducción')
                            .setDescription(`Ocurrió un error: ${error.message || 'Error desconocido'}`)]
                    }).catch(console.error);
                }
                break;
        }
    }
};






