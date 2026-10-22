/**
 * Colour styles. Each sets only its hues (accent, and two for each section);
 * Light, Reading and Dark mode build their backgrounds and soft shades from
 * them in styles.css, so every style works in every mode.
 */
export const PALETTES = [
  { id: "spectrum", name: "Spectrum", swatch: ["#ff7a45", "#7c4dff", "#12c2a5"], c: { accent: "#6d4aff", n1: "#ff7a45", n2: "#ff4d7a", o1: "#7c4dff", o2: "#4d7cff", m1: "#12c2a5", m2: "#2f9bff" } },
  { id: "ocean", name: "Ocean", swatch: ["#00b4d8", "#3f5efb", "#00c2a8"], c: { accent: "#2563eb", n1: "#00b4d8", n2: "#0077ff", o1: "#3f5efb", o2: "#7a5cff", m1: "#00c2a8", m2: "#00a3ff" } },
  { id: "sunset", name: "Sunset", swatch: ["#ff9a3c", "#f0386b", "#ffc531"], c: { accent: "#f0386b", n1: "#ff9a3c", n2: "#ff4e50", o1: "#f0386b", o2: "#b83df0", m1: "#ffc531", m2: "#ff7b3a" } },
  { id: "forest", name: "Forest", swatch: ["#2fa84f", "#0f8b8d", "#d4a106"], c: { accent: "#1f9d55", n1: "#2fa84f", n2: "#0f8b8d", o1: "#0f8b8d", o2: "#3b6fd8", m1: "#d4a106", m2: "#e3701b" } },
  { id: "berry", name: "Berry", swatch: ["#ff6a88", "#7b3fe4", "#ff8a5b"], c: { accent: "#b337d6", n1: "#ff6a88", n2: "#d63ca5", o1: "#7b3fe4", o2: "#d63ca5", m1: "#ff8a5b", m2: "#e3448c" } },
  { id: "aurora", name: "Aurora", swatch: ["#22d3ee", "#8b5cf6", "#10b981"], c: { accent: "#0ea5a4", n1: "#22d3ee", n2: "#6366f1", o1: "#8b5cf6", o2: "#ec4899", m1: "#10b981", m2: "#06b6d4" } },
  { id: "lavender", name: "Lavender", swatch: ["#a855f7", "#8b5cf6", "#d946ef"], c: { accent: "#8b5cf6", n1: "#a855f7", n2: "#ec4899", o1: "#8b5cf6", o2: "#6366f1", m1: "#d946ef", m2: "#f472b6" } },
  { id: "coral", name: "Coral", swatch: ["#fb7185", "#f43f5e", "#fb923c"], c: { accent: "#f43f5e", n1: "#fb7185", n2: "#f97316", o1: "#f43f5e", o2: "#e11d48", m1: "#fb923c", m2: "#facc15" } },
  { id: "mint", name: "Mint", swatch: ["#34d399", "#10b981", "#84cc16"], c: { accent: "#059669", n1: "#34d399", n2: "#14b8a6", o1: "#10b981", o2: "#0ea5e9", m1: "#84cc16", m2: "#22c55e" } },
  { id: "citrus", name: "Citrus", swatch: ["#f59e0b", "#84cc16", "#eab308"], c: { accent: "#ea580c", n1: "#f59e0b", n2: "#ef4444", o1: "#84cc16", o2: "#16a34a", m1: "#eab308", m2: "#f97316" } },
  { id: "sky", name: "Sky", swatch: ["#38bdf8", "#6366f1", "#22d3ee"], c: { accent: "#0284c7", n1: "#38bdf8", n2: "#0ea5e9", o1: "#6366f1", o2: "#0284c7", m1: "#22d3ee", m2: "#3b82f6" } },
  { id: "midnight", name: "Midnight", swatch: ["#6366f1", "#4338ca", "#0891b2"], c: { accent: "#4f46e5", n1: "#6366f1", n2: "#0ea5e9", o1: "#4338ca", o2: "#7c3aed", m1: "#0891b2", m2: "#2563eb" } },
  { id: "rose", name: "Rose", swatch: ["#f472b6", "#be185d", "#fb7185"], c: { accent: "#db2777", n1: "#f472b6", n2: "#e11d48", o1: "#be185d", o2: "#9333ea", m1: "#fb7185", m2: "#f59e0b" } },
  { id: "cherry", name: "Cherry", swatch: ["#ef4444", "#e11d48", "#f97316"], c: { accent: "#dc2626", n1: "#ef4444", n2: "#be123c", o1: "#e11d48", o2: "#9f1239", m1: "#f97316", m2: "#dc2626" } },
  { id: "gold", name: "Gold", swatch: ["#f59e0b", "#ca8a04", "#eab308"], c: { accent: "#b45309", n1: "#f59e0b", n2: "#d97706", o1: "#ca8a04", o2: "#b45309", m1: "#eab308", m2: "#ea580c" } },
  { id: "coffee", name: "Coffee", swatch: ["#b07a4f", "#7c5a3c", "#b45309"], c: { accent: "#7c4a2d", n1: "#b07a4f", n2: "#8a4b2a", o1: "#7c5a3c", o2: "#5b4636", m1: "#b45309", m2: "#92400e" } },
  { id: "slate", name: "Slate", swatch: ["#64748b", "#475569", "#0f766e"], c: { accent: "#475569", n1: "#64748b", n2: "#334155", o1: "#475569", o2: "#1e293b", m1: "#0f766e", m2: "#64748b" } },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];
/** "reading" is a warm, low-contrast paper look that is easy on the eyes. */
export type Mode = "light" | "dark" | "reading";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: the theme simply isn't remembered */
  }
};

export function applyTheme(p?: PaletteId, m?: Mode) {
  const saved = read("sb-palette") as PaletteId;
  const palette = p ?? (PALETTES.some((x) => x.id === saved) ? saved : "spectrum");
  const mode = m ?? ((read("sb-mode") as Mode) || "light"); // light by default
  document.documentElement.dataset.palette = palette;
  const pal = PALETTES.find((x) => x.id === palette) ?? PALETTES[0];
  for (const [k, v] of Object.entries(pal.c)) document.documentElement.style.setProperty(`--p-${k}`, v);
  document.documentElement.dataset.mode = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", mode === "dark" ? "#14111f" : mode === "reading" ? "#f4ecd8" : "#fbfaff");
  write("sb-palette", palette);
  write("sb-mode", mode);
  window.dispatchEvent(new Event("sb-theme"));
  return { palette, mode };
}

export const currentTheme = () => ({
  palette: (document.documentElement.dataset.palette as PaletteId) || "spectrum",
  mode: (document.documentElement.dataset.mode as Mode) || "light",
});

export const FOLDER_COLORS = ["violet", "coral", "teal", "blue", "pink", "amber", "green", "slate"] as const;
