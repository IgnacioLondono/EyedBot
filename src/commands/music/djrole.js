const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../../config');
const { getMusicConfig, setMusicConfig } = require('../../utils/music-config-store');

function requireManageGuild(interaction) {
    const member = interaction.member;
    const perms = new PermissionsBitField(member?.permissions || 0n);
    return perms.has(PermissionsBitField.Flags.ManageGuild);
}

function roleMention(roleId) {
    return roleId ? `<@&${roleId}>` : 'N/A';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('djrole')
        .setDescription('Configura roles DJ para controlar la música')
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription('Muestra la configuración DJ actual')
        )
        .addSubcommand((sub) =>
            sub
                .setName('add')
                .setDescription('Agrega un rol DJ')
                .addRoleOption((opt) => opt.setName('role').setDescription('Rol DJ').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Quita un rol DJ')
                .addRoleOption((opt) => opt.setName('role').setDescription('Rol DJ').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub
                .setName('requester')
                .setDescription('Permite o bloquea que el solicitante controle la música')
                .addBooleanOption((opt) => opt.setName('enabled').setDescription('Habilitado').setRequired(true))
        ),
    cooldown: 2,

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const cfg = await getMusicConfig(guildId);

        if (sub === 'list') {
            const roles = (cfg.djRoleIds || []).map(roleMention);
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🎛️ Configuración DJ')
                .addFields(
                    { name: 'Roles DJ', value: roles.length ? roles.join('\n') : 'Ninguno (solo solicitante / Manage Server)', inline: false },
                    { name: 'Control por solicitante', value: cfg.allowRequesterControl ? '✅ Sí' : '❌ No', inline: true }
                );
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (!requireManageGuild(interaction)) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ Sin permisos')
                    .setDescription('Necesitas **Administrar servidor** para cambiar roles DJ.')],
                flags: 64
            });
        }

        if (sub === 'add' || sub === 'remove') {
            const role = interaction.options.getRole('role', true);
            const next = new Set((cfg.djRoleIds || []).map(String));
            if (sub === 'add') next.add(String(role.id));
            if (sub === 'remove') next.delete(String(role.id));

            const updated = await setMusicConfig(guildId, {
                ...cfg,
                djRoleIds: [...next],
                updatedAt: new Date().toISOString(),
                updatedBy: interaction.user?.id || 'unknown'
            });

            const roles = (updated.djRoleIds || []).map(roleMention);
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.embedColor)
                    .setTitle('✅ Configuración DJ actualizada')
                    .setDescription(`Roles DJ: ${roles.length ? roles.join(', ') : 'Ninguno'}`)],
                flags: 64
            });
        }

        if (sub === 'requester') {
            const enabled = interaction.options.getBoolean('enabled', true);
            const updated = await setMusicConfig(guildId, {
                ...cfg,
                allowRequesterControl: Boolean(enabled),
                updatedAt: new Date().toISOString(),
                updatedBy: interaction.user?.id || 'unknown'
            });

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.embedColor)
                    .setTitle('✅ Configuración DJ actualizada')
                    .setDescription(`Control por solicitante: **${updated.allowRequesterControl ? 'ON' : 'OFF'}**`)],
                flags: 64
            });
        }

        return interaction.reply({ content: 'Subcomando no soportado.', flags: 64 });
    }
};

