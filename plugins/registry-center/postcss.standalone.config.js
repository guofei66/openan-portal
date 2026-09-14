// PostCSS config for standalone mode — Tailwind v3 pipeline.
// Loads the standalone Tailwind config explicitly (named *.standalone.config.js
// so it doesn't clash with any other tailwind config in ancestor dirs).
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default {
    plugins: [
        tailwind({ config: path.resolve(root, 'tailwind.standalone.config.js') }),
        autoprefixer(),
    ],
};
