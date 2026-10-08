import {readFileSync, writeFileSync} from 'node:fs';

const [, outputPath] = process.argv.slice(2);
if (!outputPath) throw new Error('Usage: generate-heroui-theme.mjs <theme-source> <output.css>');

const source = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');
writeFileSync(outputPath, `/* Generated from the Bardo HeroUI theme source. */\n${source}`);
console.log(`Generated exact HeroUI theme at ${outputPath}`);
