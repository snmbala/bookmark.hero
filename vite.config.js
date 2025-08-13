import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'assets/*', dest: 'assets' }
      ]
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: 'src/background.js',
        bookmarks: 'src/bookmarks.js',
        bookmarksHtml: 'src/bookmarks.html'
      },
      output: {
        entryFileNames: 'src/[name].js',
        chunkFileNames: 'src/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});