import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

copyFileSync(join(root, 'persona.md'), join(root, 'functions', 'persona.md'));
console.log('Synced persona.md -> functions/persona.md');
