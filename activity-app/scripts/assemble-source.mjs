import {readFileSync, writeFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);

// Sync styles.source.css to styles.css
const styles = readFileSync(new URL('src/styles.source.css', root), 'utf8');
writeFileSync(new URL('src/styles.css', root), styles);

console.log('Assembled HeroUI v3 runtime styles and App.jsx successfully.');
