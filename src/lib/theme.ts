export const PALETTES = [
  { id: "spectrum", name: "Spectrum", swatch: ["#ff6a3d", "#7c4dff", "#12b5a5"] },
  { id: "ocean", name: "Ocean", swatch: ["#0aa5ff", "#3f5efb", "#00c2a8"] },
  { id: "sunset", name: "Sunset", swatch: ["#ff4e7a", "#ff9a3c", "#ffcf3f"] },
  { id: "forest", name: "Forest", swatch: ["#2fa84f", "#0f8b8d", "#c0a000"] },
  { id: "berry", name: "Berry", swatch: ["#d63ca5", "#7b3fe4", "#ff6a88"] },
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
  const palette = p ?? ((read("sb-palette") as PaletteId) || "spectrum");
  const mode = m ?? ((read("sb-mode") as Mode) || "light"); // light by default
  document.documentElement.dataset.palette = palette;
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
