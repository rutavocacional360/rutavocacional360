import {mkdir,copyFile,readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const {version} = JSON.parse(await readFile(new URL('node_modules/pdfjs-dist/package.json', root), 'utf8'));
const source = new URL('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', root);
await mkdir(new URL('public/vendor/', root), {recursive:true});
// Some hosting proxies serve .mjs as text/plain, which module workers reject.
// The versioned .js URL also prevents clients from mixing PDF.js releases.
await copyFile(source, new URL(`public/vendor/pdfjs-${version}.worker.js`, root));
// Keep the previous URL available while older application tabs are still open.
await copyFile(source, new URL('public/vendor/pdf.worker.min.mjs', root));
