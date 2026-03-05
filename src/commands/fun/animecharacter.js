const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

const CHARACTERS = {
    protagonista: [
        { name: 'Naruto Uzumaki', anime: 'Naruto', trait: 'Nunca se rinde y protege a su gente.' },
        { name: 'Monkey D. Luffy', anime: 'One Piece', trait: 'Libre, valiente y siempre busca aventura.' },
        { name: 'Izuku Midoriya', anime: 'My Hero Academia', trait: 'Analitico, noble y con gran corazon.' },
        { name: 'Tanjiro Kamado', anime: 'Demon Slayer', trait: 'Compasivo, firme y muy leal.' },
        { name: 'Ichigo Kurosaki', anime: 'Bleach', trait: 'Impulsivo, protector y decidido.' },
        { name: 'Eren Yeager', anime: 'Attack on Titan', trait: 'Intenso, obstinado y explosivo.' },
        { name: 'Edward Elric', anime: 'Fullmetal Alchemist', trait: 'Ingenioso, orgulloso y persistente.' },
        { name: 'Gon Freecss', anime: 'Hunter x Hunter', trait: 'Curioso, positivo y determinado.' },
        { name: 'Asta', anime: 'Black Clover', trait: 'Energetico, ruidoso y super trabajador.' },
        { name: 'Yuji Itadori', anime: 'Jujutsu Kaisen', trait: 'Empatico, valiente y con buen humor.' }
    ],
    secundario: [
        { name: 'Kakashi Hatake', anime: 'Naruto', trait: 'Calmado, estratega y mentor nato.' },
        { name: 'Levi Ackerman', anime: 'Attack on Titan', trait: 'Frio, preciso y extremadamente habil.' },
        { name: 'Killua Zoldyck', anime: 'Hunter x Hunter', trait: 'Listo, veloz y leal con los suyos.' },
        { name: 'Roronoa Zoro', anime: 'One Piece', trait: 'Disciplinado, serio y muy confiable.' },
        { name: 'Gojo Satoru', anime: 'Jujutsu Kaisen', trait: 'Carismatico, poderoso y confiado.' },
        { name: 'Mikasa Ackerman', anime: 'Attack on Titan', trait: 'Reservada, fuerte y protectora.' },
        { name: 'Megumin', anime: 'Konosuba', trait: 'Dramatica, divertida y obstinada.' },
        { name: 'Nami', anime: 'One Piece', trait: 'Inteligente, ambiciosa y pragmatica.' },
        { name: 'Kyojuro Rengoku', anime: 'Demon Slayer', trait: 'Entusiasta, honorable y valiente.' },
        { name: 'Shikamaru Nara', anime: 'Naruto', trait: 'Brillante, relajado y estrategico.' }
    ],
    villano: [
        { name: 'Light Yagami', anime: 'Death Note', trait: 'Brillante, calculador y dominante.' },
        { name: 'Madara Uchiha', anime: 'Naruto', trait: 'Imponente, ambicioso y devastador.' },
        { name: 'Sosuke Aizen', anime: 'Bleach', trait: 'Paciente, manipulador y elegante.' },
        { name: 'Hisoka', anime: 'Hunter x Hunter', trait: 'Impredecible, provocador y peligroso.' },
        { name: 'Frieza', anime: 'Dragon Ball', trait: 'Cruel, orgulloso y despiadado.' },
        { name: 'Dio Brando', anime: "JoJo's Bizarre Adventure", trait: 'Teatral, cruel y obsesivo.' },
        { name: 'Sukuna', anime: 'Jujutsu Kaisen', trait: 'Arrogante, feroz y caotico.' },
        { name: 'Shigaraki', anime: 'My Hero Academia', trait: 'Destructivo, resentido y extremo.' },
        { name: 'Muzan Kibutsuji', anime: 'Demon Slayer', trait: 'Frio, autoritario y letal.' },
        { name: 'Johan Liebert', anime: 'Monster', trait: 'Sutil, psicologico y perturbador.' }
    ]
};

function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function chooseCharacter(type) {
    if (type === 'cualquiera') {
        const all = [
            ...CHARACTERS.protagonista,
            ...CHARACTERS.secundario,
            ...CHARACTERS.villano
        ];
        return { character: randomFrom(all), bucket: 'cualquiera' };
    }

    const selected = CHARACTERS[type] || CHARACTERS.protagonista;
    return { character: randomFrom(selected), bucket: type };
}

function typeLabel(type) {
    switch (type) {
        case 'protagonista':
            return 'Protagonista';
        case 'secundario':
            return 'Secundario';
        case 'villano':
            return 'Villano';
        default:
            return 'Cualquiera';
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animecharacter')
        .setDescription('Descubre que personaje de anime eres')
        .addStringOption((option) =>
            option
                .setName('tipo')
                .setDescription('El tipo de personaje que quieres obtener')
                .setRequired(false)
                .addChoices(
                    { name: 'Protagonista', value: 'protagonista' },
                    { name: 'Secundario', value: 'secundario' },
                    { name: 'Villano', value: 'villano' },
                    { name: 'Cualquiera', value: 'cualquiera' }
                )
        ),
    cooldown: 3,

    async execute(interaction) {
        const type = interaction.options.getString('tipo') || 'cualquiera';
        const { character, bucket } = chooseCharacter(type);

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🎭 Anime Character')
            .setDescription(`**${interaction.user}**, tu energia coincide con:`)
            .addFields(
                { name: 'Personaje', value: `**${character.name}**`, inline: true },
                { name: 'Anime', value: character.anime, inline: true },
                { name: 'Tipo', value: typeLabel(bucket), inline: true },
                { name: 'Por que', value: character.trait, inline: false }
            )
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed] });
    }
};
