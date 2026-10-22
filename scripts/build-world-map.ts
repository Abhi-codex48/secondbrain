// Builds public/world-map.json: one SVG outline per country, keyed by the
// three-letter code the World Bank uses, already projected so the app draws
// the map without any map library.
// Outlines: Natural Earth 1:10m countries, India point of view (public domain),
// simplified with mapshaper:
//   mapshaper ne_10m_admin_0_countries_ind.geojson -filter 'ADM0_A3 !== "ATA"' -simplify 4% keep-shapes \
//     -filter-fields ADM0_A3,WB_A3,ISO_A3_EH,NAME -o format=geojson precision=0.01 world.geojson
//   node --experimental-strip-types scripts/build-world-map.ts world.geojson
// Keep the simplification at 4% or finer: coarser outlines move India's northern border.
import { readFileSync, writeFileSync } from "node:fs";
import { geoArea, geoContains, geoEqualEarth, geoPath } from "d3-geo";

type Feature = { properties: Record<string, string>; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } | null };
const [input = "world.geojson"] = process.argv.slice(2);
const fc = JSON.parse(readFileSync(input, "utf8")) as { type: string; features: Feature[] };
fc.features = fc.features.filter((f) => f.geometry);

// d3 expects outer rings clockwise; a ring wound the other way would cover the rest of the globe.
for (const f of fc.features) {
  const polys = (f.geometry!.type === "Polygon" ? [f.geometry!.coordinates] : f.geometry!.coordinates) as number[][][][];
  for (const poly of polys) if (geoArea({ type: "Polygon", coordinates: poly } as never) > 2 * Math.PI) poly.forEach((r) => r.reverse());
}

// Places Natural Earth codes differently from the World Bank.
const CODE: Record<string, string> = { KOS: "XKX", SDS: "SSD", PSX: "PSE", SOL: "SOM", CYN: "CYP", CNM: "CYP", ALD: "FIN", USG: "CUB", ESB: "CYP", WSB: "CYP" };
const codeOf = (p: Record<string, string>) => [p.WB_A3, p.ISO_A3_EH].find((c) => c && c !== "-99") ?? CODE[p.ADM0_A3] ?? p.ADM0_A3;

const india = fc.features.find((f) => f.properties.ADM0_A3 === "IND")!;
for (const [name, at] of [["Srinagar", [74.8, 34.08]], ["Leh", [77.58, 34.15]], ["Gilgit", [74.31, 35.92]], ["Muzaffarabad", [73.47, 34.37]], ["Aksai Chin", [79.4, 35.2]]] as const) {
  if (!geoContains(india as never, at as never)) throw new Error(`Outline check failed for ${name}: simplify less.`);
}

const W = 1000, H = 500;
const projection = geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], fc as never);
const path = geoPath(projection);
const paths: Record<string, string> = {};
for (const f of fc.features) {
  const d = path(f as never);
  if (!d) continue;
  const short = d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10));
  const code = codeOf(f.properties);
  paths[code] = (paths[code] ?? "") + short;
}
writeFileSync("public/world-map.json", JSON.stringify({ w: W, h: H, paths }));
console.log(`world-map.json: ${Object.keys(paths).length} places`);
