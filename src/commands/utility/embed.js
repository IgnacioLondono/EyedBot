const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Envía un mensaje embed personalizado')
        .addStringOption(option =>
            option.setName('titulo')
                .setDescription('El título del embed')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('descripcion')
                .setDescription('La descripción del embed')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Color en hex (ej: #FF0000) o nombre (Blue, Red)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('imagen')
                .setDescription('URL de una imagen para el embed')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('thumbnail')
                .setDescription('URL de una miniatura para el embed')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('footer')
                .setDescription('Texto para el pie de página')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde enviar el embed (opcional, por defecto aquí)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
        const titulo = interaction.options.getString('titulo');
        const descripcion = interaction.options.getString('descripcion');
        const color = interaction.options.getString('color') || '#0099ff';
        const imagen = interaction.options.getString('imagen');
        const thumbnail = interaction.options.getString('thumbnail');
        const footer = interaction.options.getString('footer');
        const canal = interaction.options.getChannel('canal') || interaction.channel;

        if (!canal.isTextBased()) {
            return interaction.reply({ content: '❌ El canal seleccionado no es un canal de texto.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle(titulo)
            .setDescription(descripcion.replace(/\\n/g, '\n'))
            .setColor(color)
            .setTimestamp();

        if (imagen) embed.setImage(imagen);
        if (thumbnail) embed.setThumbnail(thumbnail);
        if (footer) embed.setFooter({ text: footer });

        try {
            await canal.send({ embeds: [embed] });
            
            if (canal.id !== interaction.channel.id) {
                await interaction.reply({ content: `✅ Embed enviado correctamente al canal ${canal}.`, ephemeral: true });
            } else {
                await interaction.reply({ content: '✅ Embed enviado.', ephemeral: true });
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ Hubo un error al enviar el embed. Verifica mis permisos y que el color sea válido.', ephemeral: true });
        }
    },
};