import { defineConfig } from 'vite';
import inject from '@rollup/plugin-inject';

export default defineConfig({
    // Dev server uses '/' so localhost:5173 works without a subpath.
    // Production build uses the GitHub Pages subdirectory.
    base: process.env.NODE_ENV === 'production' ? '/break-schedule-tool/' : '/',
    plugins: [
        // Bootstrap 4 JavaScript uses jQuery as a peer dependency.
        // The inject plugin provides $ and jQuery as module-level imports in
        // every module that references them, so Bootstrap's modal/collapse/etc.
        // plugins register themselves correctly on the same jQuery instance.
        inject({ $: 'jquery', jQuery: 'jquery' })
    ],
    build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    if (id.includes('node_modules/xlsx')) return 'xlsx';
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
