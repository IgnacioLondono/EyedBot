const { EmbedBuilder } = require('discord.js');
const config = require('../config');

class Embeds {
    static success(title, description) {
        return new EmbedBuilder()
            .setColor(config.embedColor) // Azul para éxito
            .setTitle(`✅ ${title}`)
            .setDescription(description)
            .setTimestamp();
    }

    static error(title, description) {
        return new EmbedBuilder()
            .setColor('#FF0000') // Rojo para errores
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setTimestamp();
    }

    static info(title, description) {
        return new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`ℹ️ ${title}`)
            .setDescription(description)
            .setTimestamp();
    }

    static warning(title, description) {
        return new EmbedBuilder()
            .setColor('#FFAA00') // Naranja para advertencias
            .setTitle(`⚠️ ${title}`)
            .setDescription(description)
            .setTimestamp();
    }
}

module.exports = Embeds;

