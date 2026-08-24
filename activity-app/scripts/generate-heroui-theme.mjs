import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw new Error('Usage: generate-heroui-theme.mjs <generate-theme-colors.ts> <output.css>');

const {generateThemeColors} = await import(pathToFileURL(sourcePath).href);

// Exact Theme Builder URL:
// https://heroui.com/en/themes?lightness=0.6204&chroma=0.195&hue=253.83
const colors = generateThemeColors({
  lightness: 0.6204,
  chroma: 0.195,
  hue: 253.83,
  grayChroma: 0.0015,
});

const getBase = (theme) => {
  const light = theme === 'light';
  const get = color => light ? color.oklchLight : color.oklchDark;
  return {
    '--accent': get(colors.accent),
    '--accent-foreground': get(colors.accentForeground),
    '--background': get(colors.background),
    '--border': get(colors.border),
    '--danger': get(colors.danger),
    '--danger-foreground': get(colors.dangerForeground),
    '--default': get(colors.default),
    '--default-foreground': get(colors.defaultForeground),
    '--field-background': get(colors.fieldBackground),
    '--field-border': 'transparent',
    '--field-foreground': get(colors.fieldForeground),
    '--field-placeholder': get(colors.fieldPlaceholder),
    '--focus': get(colors.focus),
    '--foreground': get(colors.foreground),
    '--muted': get(colors.muted),
    '--overlay': get(colors.overlay),
    '--overlay-foreground': get(colors.overlayForeground),
    '--scrollbar': get(colors.scrollbar),
    '--segment': get(colors.segment),
    '--segment-foreground': get(colors.segmentForeground),
    '--separator': get(colors.separator),
    '--success': get(colors.success),
    '--success-foreground': get(colors.successForeground),
    '--surface': get(colors.surface),
    '--surface-foreground': get(colors.surfaceForeground),
    '--surface-secondary': get(colors.surfaceSecondary),
    '--surface-secondary-foreground': get(colors.surfaceSecondaryForeground),
    '--surface-tertiary': get(colors.surfaceTertiary),
    '--surface-tertiary-foreground': get(colors.surfaceTertiaryForeground),
    '--warning': get(colors.warning),
    '--warning-foreground': get(colors.warningForeground),
  };
};

const lines = vars => Object.entries(vars).map(([k,v]) => `  ${k}: ${v};`).join('\n');
const light = getBase('light');
const dark = getBase('dark');
const css = `/* Generated from HeroUI v3 Theme Builder source. Do not hand-edit. */
:root,
.light,
.default,
[data-theme="light"],
[data-theme="default"] {
${lines(light)}
  --radius: 0.5rem;
  --field-radius: 0.75rem;
  --font-inter: "Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif;
  --font-sans: var(--font-inter);
}

.dark,
[data-theme="dark"] {
  color-scheme: dark;
${lines(dark)}
}
`;
writeFileSync(outputPath, css);
console.log(`Generated exact HeroUI theme at ${outputPath}`);
