import { defineConfig } from 'vite'
import core from './newtree/plugin.js'

export default defineConfig({
  plugins: [core({ runtime: '/newtree/runtime.js', sources: [{ dir: 'tests/fixtures', ext: '.comp' }] })]
})
