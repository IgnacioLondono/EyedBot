const fs = require('fs');

const files = ['data/gacha-characters.json', 'src/bundled/gacha-characters.json'];
const flavor = {
    SSR: (name, series) => `Reliquia ${name} forjada en el umbral de ${series}. Se dice que despierta portales antiguos y que solo unos pocos elegidos pueden portarla sin perder el juicio.`,
    SR: (name, series) => `Emblema místico de ${series}. ${name} canaliza siglos de conjuros dormidos y deja un rastro de ceniza arcana tras cada misión.`,
    R: (name, series) => `Curio ritual descubierto en ${series}. ${name} aún guarda ecos de un juramento sellado antes del Descenso.`,
    N: (name, series) => `Fetiche reciente de ${series}. ${name} pulsa con una duda luminosa y enseña el primer paso hacia lo oculto.`
};

for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.characters = data.characters.map((character) => {
        const rarity = String(character.rarity || 'N').toUpperCase();
        const name = String(character.name || 'Artefacto');
        const series = String(character.series || 'Colección desconocida');
        const description = String(character.description || '').trim() || (flavor[rarity] || flavor.N)(name, series);
        const { imageUrl, ...rest } = character;
        return { ...rest, rarity, description };
    });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    console.log(`updated ${file} (${data.characters.length})`);
}
