
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
	plugins: [vue()],
	server: {
		proxy: {
			'/wfs': {
				target: 'https://service.gdi-sh.de',
				changeOrigin: true,
				secure: true,
				rewrite: (path) =>
					path.replace(/^\/wfs/, '/SH_INSPIREDOWNLOAD_AI_PS')
			}
		}
	}
})
