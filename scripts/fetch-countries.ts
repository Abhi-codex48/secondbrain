// Writes countries.json for the World in numbers page: about 25 World
// Development Indicators for every country, 2000 to the latest year, from the
// World Bank's open data API (no key needed). The World Bank updates these once
// or twice a year, so the previous file is reused when it is less than a week old.
//   node --experimental-strip-types scripts/fetch-countries.ts <out> [previousUrl]
import { writeFileSync } from "node:fs";
import { INDICATORS, type CountriesFile } from "../shared/indicators.ts";

const [out = "countries.json", previousUrl] = process.argv.slice(2);
const API = "https://api.worldbank.org/v2";
const FIRST = 2000;
const UA = "SecondBrainWorld/1.0 (https://github.com/Abhi-codex48/secondbrain)";

async function get(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }
}

// Four significant figures keep the file small without changing what is shown.
const round = (v: number) => Number(v.toPrecision(4));

async function main() {
  let previous: CountriesFile | null = null;
  if (previousUrl) {
    try { previous = (await get(previousUrl)) as CountriesFile; } catch { /* first run */ }
  }
  if (previous?.generatedAt && Date.now() - Date.parse(previous.generatedAt) < 7 * 86400_000 && !process.env.FORCE) {
    writeFileSync(out, JSON.stringify(previous));
    console.log(`countries.json: kept (updated ${previous.generatedAt.slice(0, 10)}; refreshed weekly)`);
    return;
  }

  // Countries only: the API also lists regions and income groups ("Aggregates").
  const list = (await get(`${API}/country?format=json&per_page=400`)) as [unknown, { id: string; name: string; region: { value: string }; incomeLevel: { value: string }; capitalCity: string }[]];
  const countries = list[1]
    .filter((c) => c.region?.value && c.region.value !== "Aggregates")
    .map((c) => ({ id: c.id, name: c.name, region: c.region.value.trim(), income: c.incomeLevel?.value ?? "", capital: c.capitalCity ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const ids = new Set(countries.map((c) => c.id));

  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: thisYear - FIRST + 1 }, (_, i) => FIRST + i);
  const data: CountriesFile["data"] = {};
  const world: CountriesFile["world"] = {};
  const missing: string[] = [];

  for (const ind of INDICATORS) {
    let rows: { countryiso3code: string; date: string; value: number | null }[] = [];
    for (const code of [ind.code, ind.alt].filter(Boolean) as string[]) {
      try {
        const res = (await get(`${API}/country/all/indicator/${code}?format=json&per_page=20000&date=${FIRST}:${thisYear}`)) as [unknown, typeof rows | null];
        rows = (res[1] ?? []).filter((r) => r.value != null);
      } catch (e) {
        console.log(`${code}: ${(e as Error).message}`);
      }
      if (rows.length) break;
    }
    if (!rows.length) {
      missing.push(ind.code);
      if (previous?.data[ind.code]) { data[ind.code] = previous.data[ind.code]; world[ind.code] = previous.world[ind.code]; }
      console.log(`FAIL ${ind.name}: no data${previous?.data[ind.code] ? " (kept previous)" : ""}`);
      continue;
    }
    const byCountry: Record<string, (number | null)[]> = {};
    const w: (number | null)[] = years.map(() => null);
    for (const r of rows) {
      const i = Number(r.date) - FIRST;
      if (i < 0 || i >= years.length) continue;
      if (r.countryiso3code === "WLD") w[i] = round(r.value!);
      else if (ids.has(r.countryiso3code)) (byCountry[r.countryiso3code] ??= years.map(() => null))[i] = round(r.value!);
    }
    data[ind.code] = byCountry;
    world[ind.code] = w;
    const latestYear = Math.max(...Object.values(byCountry).flatMap((s) => s.map((v, i) => (v == null ? 0 : years[i]))));
    console.log(`OK   ${ind.name}: ${Object.keys(byCountry).length} countries, latest ${latestYear}`);
  }

  // Trim years nobody has reported yet.
  let last = years.length;
  while (last > 1 && !Object.values(data).some((m) => Object.values(m).some((s) => s[last - 1] != null))) last--;
  const trim = (s: (number | null)[]) => s.slice(0, last);
  for (const m of Object.values(data)) for (const k of Object.keys(m)) m[k] = trim(m[k]);
  for (const k of Object.keys(world)) world[k] = trim(world[k]);

  const file: CountriesFile = { generatedAt: new Date().toISOString(), years: years.slice(0, last), countries, data, world, missing };
  if (Object.keys(data).length === 0 && previous) {
    writeFileSync(out, JSON.stringify(previous));
    console.log("countries.json: World Bank unreachable, kept the previous file");
    return;
  }
  writeFileSync(out, JSON.stringify(file));
  console.log(`countries.json: ${countries.length} countries, ${Object.keys(data).length} figures, ${years[0]}–${years[last - 1]}`);
}

main().catch((e) => {
  // Never block the deploy over this page.
  console.error(e);
});
