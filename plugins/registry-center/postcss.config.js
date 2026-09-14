// PostCSS config — auto-discovered by Vite for this plugin's standalone dev.
// Tailwind v3 pipeline with the standalone tailwind config.
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
