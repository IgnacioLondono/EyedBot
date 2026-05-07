// Sistema de gestión de historial de conversación para la IA

const conversationHistory = new Map();

/**
 * Obtiene la clave única para una conversación
 * @param {string} userId - ID del usuario
 * @param {string} channelId - ID del canal
 * @returns {string} Clave única de conversación
 */
function getConversationKey(userId, channelId) {
    return `${userId}-${channelId}`;
}

/**
 * Obtiene el historial de conversación
 * @param {string} userId - ID del usuario
 * @param {string} channelId - ID del canal
 * @returns {Array} Historial de conversación
 */
function getHistory(userId, channelId) {
    const key = getConversationKey(userId, channelId);
    return conversationHistory.get(key) || [];
}

/**
 * Guarda un mensaje en el historial
 * @param {string} userId - ID del usuario
 * @param {string} channelId - ID del canal
 * @param {string} role - Rol del mensaje ('user' o 'model')
 * @param {string} content - Contenido del mensaje
 */
function addToHistory(userId, channelId, role, content) {
    const key = getConversationKey(userId, channelId);
    let history = conversationHistory.get(key) || [];
    
    history.push({ role, content });
    
    // Limpiar historial si es muy largo (mantener solo las últimas 10 interacciones = 20 mensajes)
    if (history.length > 20) {
        history = history.slice(-20);
    }
    
    conversationHistory.set(key, history);
}

/**
 * Limpia el historial de conversación
 * @param {string} userId - ID del usuario
 * @param {string} channelId - ID del canal
 */
function clearHistory(userId, channelId) {
    const key = getConversationKey(userId, channelId);
    conversationHistory.delete(key);
}

/**
 * Limpia todo el historial (útil para limpieza periódica)
 */
function clearAllHistory() {
    conversationHistory.clear();
}

/**
 * Obtiene el historial formateado para Gemini
 * @param {string} userId - ID del usuario
 * @param {string} channelId - ID del canal
 * @returns {Array} Historial formateado para Gemini
 */
function getFormattedHistory(userId, channelId) {
    const history = getHistory(userId, channelId);
    return history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
    }));
}

module.exports = {
    getHistory,
    addToHistory,
    clearHistory,
    clearAllHistory,
    getFormattedHistory,
    getConversationKey
};



