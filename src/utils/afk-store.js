const db = require('./database');

class AFKStore {
    constructor() {
        this.cache = new Map(); // Caché en memoria para acceso rápido
    }

    /**
     * Establece a un usuario como AFK
     * @param {string} guildId - ID del servidor
     * @param {string} userId - ID del usuario
     * @param {string} reason - Motivo de la ausencia
     */
    async setAFK(guildId, userId, reason) {
        const key = `afk_${guildId}_${userId}`;
        const data = {
            guildId: String(guildId),
            userId: String(userId),
            reason: String(reason || 'Sin motivo').slice(0, 500),
            setAt: new Date().toISOString()
        };

        this.cache.set(key, data);
        await db.set(key, data).catch((err) => {
            console.warn(`⚠️ Error guardando AFK para ${userId}:`, err?.message || err);
        });

        return data;
    }

    /**
     * Obtiene el estado AFK de un usuario
     * @param {string} guildId - ID del servidor
     * @param {string} userId - ID del usuario
     * @returns {object|null} Datos AFK o null
     */
    async getAFK(guildId, userId) {
        const key = `afk_${guildId}_${userId}`;

        // Intentar caché primero
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        // Luego intentar BD
        try {
            const data = await db.get(key);
            if (data && typeof data === 'object') {
                this.cache.set(key, data);
                return data;
            }
        } catch (err) {
            console.warn(`⚠️ Error obteniendo AFK para ${userId}:`, err?.message || err);
        }

        return null;
    }

    /**
     * Elimina el estado AFK de un usuario
     * @param {string} guildId - ID del servidor
     * @param {string} userId - ID del usuario
     */
    async removeAFK(guildId, userId) {
        const key = `afk_${guildId}_${userId}`;
        this.cache.delete(key);
        await db.delete(key).catch((err) => {
            console.warn(`⚠️ Error eliminando AFK para ${userId}:`, err?.message || err);
        });
    }

    /**
     * Verifica si un usuario está AFK
     * @param {string} guildId - ID del servidor
     * @param {string} userId - ID del usuario
     * @returns {boolean}
     */
    async isAFK(guildId, userId) {
        const afk = await this.getAFK(guildId, userId);
        return !!afk;
    }
}

module.exports = new AFKStore();
