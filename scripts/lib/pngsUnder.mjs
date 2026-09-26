import { readdir } from 'node:fs/promises';
import path from 'node:path';

/** Every .png under a folder, at any depth. */
export async function pngsUnder(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const found = await Promise.all(entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return pngsUnder(full);
        return entry.name.endsWith('.png') ? [full] : [];
    }));
    return found.flat();
}
