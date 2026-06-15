/**
 * Auditoría del módulo Juegos gratis (Epic + Steam).
 * Uso: node web/scripts/audit-free-games.mjs
 */
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const servicePath = path.join(repoRoot, "src/utils/free-games-service.js");

const errors = [];
const warnings = [];
const ok = [];

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}
function pass(msg) {
  ok.push(msg);
}

const service = await import(pathToFileURL(servicePath).href);

if (typeof service.fetchAllFreeGames !== "function") err("fetchAllFreeGames no exportado");
else pass("fetchAllFreeGames exportado");

if (typeof service.fetchSteamFreeGames !== "function") err("fetchSteamFreeGames no exportado");
else pass("fetchSteamFreeGames exportado");

if (typeof service.getLastFreeGamesAudit !== "function") warn("getLastFreeGamesAudit no exportado");

console.log("\n=== AUDITORÍA JUEGOS GRATIS ===\n");
console.log("Consultando Epic y Steam (puede tardar unos segundos)...\n");

const games = await service.fetchAllFreeGames({
  includeEpic: true,
  includeSteam: true,
  force: true,
  minDiscount: 100,
});

const audit = service.getLastFreeGamesAudit?.() || null;
const epicGames = games.filter((g) => g.source === "epic");
const steamGames = games.filter((g) => g.source === "steam");

console.log(`Epic: ${epicGames.length} oferta(s)`);
if (epicGames[0]) console.log(`  · ${epicGames[0].title}`);

console.log(`Steam: ${steamGames.length} oferta(s)`);
for (const game of steamGames.slice(0, 5)) {
  console.log(`  · ${game.title}`);
}

if (audit?.steam) {
  console.log("\nDetalle Steam:");
  console.log(`  destacados escaneados: ${audit.steam.featuredScanned ?? 0}`);
  console.log(`  destacados gratis: ${audit.steam.featuredMatched ?? 0}`);
  console.log(`  candidatos búsqueda: ${audit.steam.searchCandidates ?? 0}`);
  console.log(`  appdetails revisados: ${audit.steam.detailsChecked ?? 0}`);
  console.log(`  appdetails válidos: ${audit.steam.detailsMatched ?? 0}`);
  if (audit.steam.error) err(`Steam error: ${audit.steam.error}`);
  for (const note of audit.steam.errors || []) warn(`Steam: ${note}`);
}

if (audit?.epic?.error) err(`Epic error: ${audit.epic.error}`);

if (epicGames.length > 0) pass("Epic devolvió al menos una oferta");
else warn("Epic no devolvió ofertas (puede ser temporal)");

if (steamGames.length > 0) pass("Steam devolvió al menos una oferta");
else if ((audit?.steam?.detailsChecked ?? 0) > 0) {
  warn("Steam respondió pero no hay promociones 100% activas ahora mismo");
} else {
  err("Steam no devolvió ofertas y no se verificaron candidatos");
}

for (const game of games) {
  if (!game.storeUrl) err(`Juego sin storeUrl: ${game.id}`);
  if (!game.title) err(`Juego sin título: ${game.id}`);
}

console.log(`\n✅ OK: ${ok.length}`);
ok.forEach((m) => console.log(`   · ${m}`));

if (warnings.length) {
  console.log(`\n⚠️  ADVERTENCIAS: ${warnings.length}`);
  warnings.forEach((m) => console.log(`   · ${m}`));
}

if (errors.length) {
  console.log(`\n❌ ERRORES: ${errors.length}`);
  errors.forEach((m) => console.log(`   · ${m}`));
  process.exit(1);
}

console.log("\n✅ Auditoría de juegos gratis completada.\n");
process.exit(0);
