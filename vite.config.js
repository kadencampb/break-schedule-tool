import { defineConfig } from 'vite';

export default defineConfig({
    // Dev server uses '/' so localhost:5173 works without a subpath.
    // Production build uses the GitHub Pages subdirectory.
    base: process.env.NODE_ENV === 'production' ? '/break-schedule-tool/' : '/',
    plugins: [
        // The production CSP blocks Vite's dev HMR client and inline module
        // loader. Strip the CSP meta tag during `vite` (serve) only — the
        // production build keeps it intact.
        {
            name: 'strip-csp-in-dev',
            apply: 'serve',
            transformIndexHtml(html) {
                return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/, '');
            }
        }
    ],
    build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    if (id.includes('node_modules/exceljs')) return 'exceljs';
                    if (
                        id.includes('node_modules/bootstrap') ||
                        id.includes('node_modules/jquery') ||
                        id.includes('node_modules/popper.js')
                    ) return 'bootstrap';
                }
            }
        }
    },
    test: {
        environment: 'node',
        globals: true
    }
});
