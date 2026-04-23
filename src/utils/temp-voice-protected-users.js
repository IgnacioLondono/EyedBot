const config = require('../config');

function isTempVoiceProtectedFromOwnerKick(userId) {
    const ids = config.tempVoiceProtectedFromOwnerKickIds;
    if (!Array.isArray(ids) || !ids.length || !userId) return false;
    return ids.some((id) => String(id) === String(userId));
}

module.exports = { isTempVoiceProtectedFromOwnerKick };
