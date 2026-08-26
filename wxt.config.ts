import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Pilot Guardian',
    description: '为受控网页增加口令与周期闸门。',
    version: '0.1.0',
    minimum_chrome_version: '102',
    permissions: [
      'alarms',
      'declarativeNetRequest',
      'storage',
      'tabs',
      'webNavigation',
    ],
    host_permissions: ['<all_urls>'],
    incognito: 'not_allowed',
    sandbox: {
      pages: ['sandbox.html'],
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
      sandbox: "sandbox allow-scripts; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:; style-src 'unsafe-inline' data: https: http:; img-src data: https: http:; font-src data: https: http:; media-src data: https: http:; child-src 'self' data: blob:; object-src 'none'",
    },
    web_accessible_resources: [
      {
        resources: ['gate.html'],
        matches: ['<all_urls>'],
      },
    ],
  },
})
