// Tailwind config for standalone mode — scans the plugin's own sources
// (plus portal-sdk standalone) for utility classes.
/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        './index.html',
        './src/**/*.{js,jsx}',
        '../../packages/portal-sdk/src/**/*.{js,jsx}',
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};
