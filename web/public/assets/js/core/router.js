(function attachRouter(global) {
    function initRouter(onNavigate) {
        document.querySelectorAll('.tab[data-section]').forEach((tab) => {
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                const sectionId = tab.dataset.section;
                if (!sectionId) return;
                onNavigate(sectionId);
                history.pushState({ sectionId }, '', tab.getAttribute('href') || '/');
            });
        });

        window.addEventListener('popstate', (event) => {
            const sectionId = event.state?.sectionId;
            if (!sectionId) return;
            onNavigate(sectionId);
        });
    }

    global.EyedRouter = { initRouter };
})(window);
