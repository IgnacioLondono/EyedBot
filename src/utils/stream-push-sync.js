const { scheduleTwitchEventSubSync } = require('./twitch-eventsub');
const { scheduleYouTubeWebSubSync } = require('./youtube-websub');
const { scheduleFeedWebSubSync } = require('./feed-websub');

function scheduleAllStreamPushSync() {
    scheduleTwitchEventSubSync();
    scheduleYouTubeWebSubSync();
    scheduleFeedWebSubSync();
}

module.exports = {
    scheduleAllStreamPushSync
};
