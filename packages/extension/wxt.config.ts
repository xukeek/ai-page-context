import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'AI Page Context',
    description: 'Annotate UI issues with screenshots and expose them to AI via MCP',
    permissions: [
      'activeTab',
      'scripting',
      'tabs',
      'storage',
      'sidePanel',
      'clipboardWrite',
    ],
    host_permissions: ['<all_urls>', 'http://127.0.0.1/*'],
    action: {
      default_title: 'AI Page Context',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
