(function attachApi(global) {
    async function getJson(url) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
            throw new Error(`API ${url} -> ${response.status}`);
        }
        return response.json();
    }

    global.EyedApi = {
        health: () => getJson('/api/health'),
        user: () => getJson('/api/user'),
        guilds: () => getJson('/api/guilds'),
        commands: () => getJson('/api/commands'),
        stats: () => getJson('/api/stats')
    };
})(window);
