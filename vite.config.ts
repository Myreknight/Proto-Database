import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Inlines the built JS and CSS into index.html so the app is one file that opens
// straight from Finder (browsers won't load module scripts from file:// URLs).
function singleFile(): Plugin {
  return {
    name: 'single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html']
      if (!html || html.type !== 'asset') return
      let page = String(html.source)
      for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && fileName.endsWith('.js')) {
          const tag = new RegExp(`<script[^>]*src="[^"]*${fileName}"[^>]*></script>`)
          const code = file.code.replace(/<\/script/gi, '<\\/script')
          page = page.replace(tag, () => `<script type="module">${code}</script>`)
          delete bundle[fileName]
        } else if (file.type === 'asset' && fileName.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${fileName}"[^>]*>`)
          page = page.replace(tag, () => `<style>${String(file.source)}</style>`)
          delete bundle[fileName]
        }
      }
      html.source = page
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), singleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    modulePreload: false,
  },
})
