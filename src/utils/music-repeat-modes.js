/** Modos de repetición (compatible con la API anterior de discord-player). */
const QueueRepeatMode = {
    OFF: 0,
    TRACK: 1,
    QUEUE: 2,
    AUTOPLAY: 3
};

const GuildQueueEvent = {
    PlayerStart: 'playerStart',
    PlayerPause: 'playerPause',
    PlayerResume: 'playerResume',
    EmptyQueue: 'emptyQueue',
    Disconnect: 'disconnect',
    PlayerError: 'playerError',
    Error: 'error'
};

module.exports = { QueueRepeatMode, GuildQueueEvent };
