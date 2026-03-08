const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');

const categories = {
    moderation: '🛡️ Moderación',
    music: '🎵 Música',
    fun: '🎮 Diversión',
    utility: '⚙️ Utilidades',
    config: '⚙️ Configuración'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Muestra la lista de comandos')
        .addStringOption(option =>
            option.setName('categoria')
                .setDescription('Categoría de comandos')
                .addChoices(
                    { name: 'Moderación', value: 'moderation' },
                    { name: 'Música', value: 'music' },
                    { name: 'Diversión', value: 'fun' },
                    { name: 'Utilidades', value: 'utility' },
                    { name: 'Configuración', value: 'config' }
                )
                .setRequired(false)),
    cooldown: 3,
    async execute(interaction) {
        try {
            const category = interaction.options.getString('categoria');
            const commands = interaction.client.commands;

            if (category) {
                // Filtrar comandos por categoría basándose en la carpeta
                const categoryCommands = [];
                const commandFolders = ['moderation', 'music', 'fun', 'utility', 'config'];
                
                for (const cmd of commands.values()) {
                    try {
                        // Intentar resolver la ruta del comando
                        const cmdModule = require.cache[require.resolve(`../${category}/${cmd.data.name}`)];
                        if (cmdModule) {
                            categoryCommands.push(cmd);
                        }
                    } catch (e) {
                        // Si no está en esa categoría, continuar
                    }
                }

                // Si no encontramos por require, usar nombres de comandos
                if (categoryCommands.length === 0) {
                    const categoryMap = {
                        moderation: ['ban', 'kick', 'mute', 'unmute', 'warn', 'warnings', 'clearwarns', 'clear', 'purge', 'lock', 'unlock', 'slowmode', 'nick', 'unban', 'role', 'announce'],
                        music: ['play', 'search', 'pause', 'resume', 'stop', 'skip', 'queue', 'nowplaying', 'volume', 'shuffle', 'remove', 'loop', 'seek', 'filters'],
                        fun: ['gif', 'hug', 'kiss', 'slap', 'pat', 'punch', 'wink', 'meme', '8ball', 'coinflip', 'dice', 'avatar', 'userinfo', 'serverinfo', 'rate', 'choose', 'poll', 'emojify', 'cat', 'dog', 'trivia', 'ascii'],
                        utility: ['help', 'ping', 'stats', 'invite', 'translate', 'weather', 'remind', 'urban', 'qrcode', 'color', 'sync', 'voznombre', 'vozprivado', 'vozinvitar', 'vozquitar'],
                        config: ['setwelcome', 'setprefix', 'autoresponder']
                    };

                    const cmdNames = categoryMap[category] || [];
                    categoryCommands.push(...Array.from(commands.values()).filter(cmd => cmdNames.includes(cmd.data.name)));
                }

                const embed = new EmbedBuilder()
                    .setColor(config.embedColor)
                    .setTitle(categories[category] || category)
                    .setDescription(categoryCommands.length > 0 
                        ? categoryCommands.map(cmd => `\`/${cmd.data.name}\` - ${cmd.data.description}`).join('\n')
                        : 'No hay comandos en esta categoría.')
                    .setFooter({ text: `Total: ${categoryCommands.length} comandos` });

                return interaction.reply({ embeds: [embed] });
            }

            // Contar comandos por categoría
            const moderationCmds = ['ban', 'kick', 'mute', 'unmute', 'warn', 'warnings', 'clearwarns', 'clear', 'purge', 'lock', 'unlock', 'slowmode', 'nick', 'unban', 'role', 'announce'];
            const musicCmds = ['play', 'search', 'pause', 'resume', 'stop', 'skip', 'queue', 'nowplaying', 'volume', 'shuffle', 'remove', 'loop', 'seek', 'filters'];
            const funCmds = ['gif', 'hug', 'kiss', 'slap', 'pat', 'punch', 'wink', 'meme', '8ball', 'coinflip', 'dice', 'avatar', 'userinfo', 'serverinfo', 'rate', 'choose', 'poll', 'emojify', 'cat', 'dog', 'trivia', 'ascii'];
            const utilityCmds = ['help', 'ping', 'stats', 'invite', 'translate', 'weather', 'remind', 'urban', 'qrcode', 'color', 'sync', 'voznombre', 'vozprivado', 'vozinvitar', 'vozquitar'];

            const modCount = Array.from(commands.values()).filter(c => moderationCmds.includes(c.data.name)).length;
            const musicCount = Array.from(commands.values()).filter(c => musicCmds.includes(c.data.name)).length;
            const funCount = Array.from(commands.values()).filter(c => funCmds.includes(c.data.name)).length;
            const utilityCount = Array.from(commands.values()).filter(c => utilityCmds.includes(c.data.name)).length;

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('📚 Lista de Comandos')
                .setDescription(`Total de comandos: **${commands.size}**\n\nUsa \`/help [categoria]\` para ver comandos de una categoría específica.`)
                .addFields(
                    { name: categories.moderation, value: `${modCount} comandos`, inline: true },
                    { name: categories.music, value: `${musicCount} comandos`, inline: true },
                    { name: categories.fun, value: `${funCount} comandos`, inline: true },
                    { name: categories.utility, value: `${utilityCount} comandos`, inline: true }
                )
                .setFooter({ text: `Prefijo: ${config.prefix}` });

            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error en help:', error);
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Ocurrió un error al mostrar la ayuda.')],
                flags: 64
            });
        }
    }
};

