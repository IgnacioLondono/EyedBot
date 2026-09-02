import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "assets", "eyedbot-icon-source.svg");
const svg = fs.readFileSync(sourcePath, "utf8");

/** Violeta medio: legible sobre fondos claros y oscuros en PNG estático. */
const PNG_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="EyedBot">
  <g fill="#7c3aed" stroke="#7c3aed">
    <line x1="11" y1="8" x2="9.5" y2="3" stroke-width="2.25" stroke-linecap="round" fill="none" />
    <line x1="21" y1="8" x2="22.5" y2="3" stroke-width="2.25" stroke-linecap="round" fill="none" />
    <circle cx="9.5" cy="3" r="1.75" stroke="none" />
    <circle cx="22.5" cy="3" r="1.75" stroke="none" />
    <rect x="6" y="8" width="20" height="20" rx="5.5" stroke-width="2.25" fill="none" />
    <rect x="3.3" y="16.3" width="3.2" height="3.4" rx="1.6" stroke="none" />
    <rect x="25.5" y="16.3" width="3.2" height="3.4" rx="1.6" stroke="none" />
    <path d="M10 18Q16 14 22 18Q16 22 10 18Z" stroke="none" />
  </g>
  <circle cx="16" cy="18" r="1.05" fill="#a78bfa" />
</svg>`;

function exportPng(targetSvg, outPath, size) {
  const resvg = new Resvg(targetSvg, {
    fitTo: { mode: "width", value: size },
    background: "transparent",
  });
  const png = resvg.render().asPng();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${size}px)`);
}

const outputs = [
  { file: "public/eyedbot-icon.png", size: 512 },
  { file: "public/eyedbot-icon-32.png", size: 32 },
  { file: "app/icon.png", size: 32 },
  { file: "app/apple-icon.png", size: 180 },
];

for (const { file, size } of outputs) {
  exportPng(PNG_SVG, path.join(root, file), size);
}

const svgTargets = ["public/eyedbot-icon.svg", "app/icon.svg"];
for (const file of svgTargets) {
  const out = path.join(root, file);
  fs.writeFileSync(out, svg);
  console.log(`wrote ${file}`);
}
