(function attachState(global) {
    const state = {
        activeSection: 'dashboardSection',
        user: null,
        guilds: [],
        commands: [],
        stats: null
    };

    function set(partial) {
        Object.assign(state, partial || {});
        return state;
    }

    function get() {
        return state;
    }

    global.EyedState = { get, set };
})(window);
