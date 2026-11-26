
import { defineConfig } from 'eslint/config'
import mainConfig from '@dataport/eslint-config-geodev'
import browserConfig from '@dataport/eslint-config-geodev/browser'
import nodeConfig from '@dataport/eslint-config-geodev/node'
import vueConfig from '@dataport/eslint-config-geodev/vue'
import tsVueConfig from '@dataport/eslint-config-geodev/typescript-vue'

export default defineConfig([
  {
    files: ['src/**/*.{js,ts,vue}'],
    extends: [mainConfig, browserConfig, vueConfig],
  },
  {
    files: ['src/**/*.{ts,vue}'],
    extends: [tsVueConfig],
  },
  {
    files: ['vite.config.ts'],
    extends: [mainConfig, nodeConfig],
  },
])
