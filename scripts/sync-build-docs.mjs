import {copyFile} from 'node:fs/promises';
// Keep the shipped original-asset/license record equal to the source document.
await copyFile(new URL('../ASSET_LICENSES.md',import.meta.url),new URL('../public/ASSET_LICENSES.md',import.meta.url));
