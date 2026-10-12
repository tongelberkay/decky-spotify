/** Browser approximation of Valve's SteamOS Quick Access menu.
 * Reference: https://www.steamdeck.com/en/software (software_quickaccess.jpg).
 * On hardware, Steam owns the native controls' colors, typeface, and focus skin.
 */
export const steamTheme = {
  name: "SteamOS Quick Access",
  version: "1.0.0",
  platform: "SteamOS Gaming Mode / Quick Access menu",
  colors: {
    bg_primary: "#0e141b",
    bg_secondary: "#171a21",
    bg_tertiary: "#23262e",
    bg_card: "#1a2027",
    text_primary: "#ffffff",
    text_secondary: "#dcdedf",
    text_muted: "#8b929a",
    accent_primary: "#1a9fff",
    accent_secondary: "#4c9fff",
    accent_green: "#1ed760",
    accent_success: "#1a9fff",
    border: "#23262e",
  },
  typography: {
    font_sans: "Motiva Sans, Arial, sans-serif",
    font_display: "Motiva Sans, Arial, sans-serif",
    scale: { xs: "11px", sm: "12px", base: "14px", lg: "16px", xl: "20px", xxl: "28px" },
  },
  spacing: { unit: "4px", base_radius: "2px", card_radius: "4px" },
} as const;

export const steamThemeVariables = {
  ...Object.fromEntries(Object.entries(steamTheme.colors).map(([key, value]) => [`--steam-${key.replaceAll("_", "-")}`, value])),
  "--steam-font-sans": steamTheme.typography.font_sans,
  "--steam-font-display": steamTheme.typography.font_display,
  ...Object.fromEntries(Object.entries(steamTheme.typography.scale).map(([key, value]) => [`--steam-font-size-${key}`, value])),
  ...Object.fromEntries(Object.entries(steamTheme.spacing).map(([key, value]) => [`--steam-${key.replaceAll("_", "-")}`, value])),
};
export const steamThemeDeclarations = Object.entries(steamThemeVariables).map(([key, value]) => `${key}:${value};`).join("");
