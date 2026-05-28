(function attachUi(global) {
    function byId(id) {
        return document.getElementById(id);
    }

    function safeBind(id, eventName, handler) {
        const el = byId(id);
        if (!el) return false;
        el.addEventListener(eventName, handler);
        return true;
    }

    function setActiveTab(sectionId) {
        document.querySelectorAll('.tab[data-section]').forEach((tab) => {
            const active = tab.dataset.section === sectionId;
            tab.classList.toggle('active', active);
        });
    }

    function showSection(sectionId) {
        document.querySelectorAll('.screen').forEach((screen) => {
            screen.classList.toggle('active', screen.id === sectionId);
        });
        setActiveTab(sectionId);
    }

    function card(title, subtitle, badgeText, badgeClass) {
        return `<article class="card"><h3>${title}</h3><p>${subtitle}</p>${badgeText ? `<span class="badge ${badgeClass || ''}">${badgeText}</span>` : ''}</article>`;
    }

    global.EyedUi = { byId, safeBind, showSection, setActiveTab, card };
})(window);
