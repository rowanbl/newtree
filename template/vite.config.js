import { defineConfig } from 'vite'
import core from './newtree/plugin.js'

export default defineConfig({
  server: { host: true },
  plugins: [core({ runtime: '/newtree/runtime.js' })]
})
