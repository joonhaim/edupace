import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const source = fileURLToPath(new URL('../simulator-interface/', import.meta.url));
const output = fileURLToPath(new URL('../build/', import.meta.url));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

console.log(`Built static site in ${output.replace(`${projectRoot}/`, '')}`);
