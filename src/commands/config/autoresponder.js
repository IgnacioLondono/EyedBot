const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoresponder')
        .setDescription('Gestiona respuestas automáticas')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Añade una respuesta automática')
                .addStringOption(option =>
                    option.setName('trigger')
                        .setDescription('Palabra clave')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('respuesta')
                        .setDescription('Respuesta automática')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Elimina una respuesta automática')
                .addStringOption(option =>
                    option.setName('trigger')
                        .setDescription('Palabra clave a eliminar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lista todas las respuestas automáticas'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    cooldown: 5,
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const autoresponders = await db.get(`autoresponders_${interaction.guild.id}`) || {};

        if (subcommand === 'add') {
            const trigger = interaction.options.getString('trigger').toLowerCase();
            const response = interaction.options.getString('respuesta');

            autoresponders[trigger] = response;
            await db.set(`autoresponders_${interaction.guild.id}`, autoresponders);

            return interaction.reply({
                embeds: [Embeds.success('Respuesta Automática Añadida', `Trigger: \`${trigger}\`\nRespuesta: ${response}`)]
            });
        }

        if (subcommand === 'remove') {
            const trigger = interaction.options.getString('trigger').toLowerCase();

            if (!autoresponders[trigger]) {
                return interaction.reply({
                    embeds: [Embeds.error('Error', 'No existe una respuesta automática con ese trigger.')],
                    flags: 64
                });
            }

            delete autoresponders[trigger];
            await db.set(`autoresponders_${interaction.guild.id}`, autoresponders);

            return interaction.reply({
                embeds: [Embeds.success('Respuesta Automática Eliminada', `Se eliminó el trigger: \`${trigger}\``)]
            });
        }

        if (subcommand === 'list') {
            const triggers = Object.keys(autoresponders);
            
            if (triggers.length === 0) {
                return interaction.reply({
                    embeds: [Embeds.info('Respuestas Automáticas', 'No hay respuestas automáticas configuradas.')]
                });
            }

            const list = triggers.map(t => `\`${t}\` → ${autoresponders[t]}`).join('\n');
            return interaction.reply({
                embeds: [Embeds.info('Respuestas Automáticas', list)]
            });
        }
    }
};






