const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../utils/database');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Establece un recordatorio')
        .addStringOption(option =>
            option.setName('tiempo')
                .setDescription('Tiempo (ej: 10m, 1h, 2d)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('mensaje')
                .setDescription('Mensaje del recordatorio')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        const time = interaction.options.getString('tiempo');
        const message = interaction.options.getString('mensaje');

        const timeMs = ms(time);
        if (!timeMs || timeMs < 1000) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('Tiempo inválido. Usa formato como: 10m, 1h, 2d')],
                flags: 64
            });
        }

        const reminder = {
            userId: interaction.user.id,
            channelId: interaction.channel.id,
            message: message,
            expiresAt: Date.now() + timeMs
        };

        const reminders = await db.get('reminders') || [];
        reminders.push(reminder);
        await db.set('reminders', reminders);

        setTimeout(async () => {
            const channel = interaction.client.channels.cache.get(reminder.channelId);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor(config.embedColor)
                    .setTitle('⏰ Recordatorio')
                    .setDescription(message)
                    .setFooter({ text: `Recordatorio de ${interaction.user.tag}` });

                await channel.send({ content: `<@${reminder.userId}>`, embeds: [embed] });
            }

            const updatedReminders = await db.get('reminders') || [];
            const filtered = updatedReminders.filter(r => r.expiresAt !== reminder.expiresAt);
            await db.set('reminders', filtered);
        }, timeMs);

        return interaction.reply({
            embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle('✅ Recordatorio Establecido').setDescription(`Te recordaré en ${time}: ${message}`)]
        });
    }
};






