import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/sitn-gsr-search.ts',
      name: 'SitnGsrSearch',
      fileName: (format) => `sitn-gsr-search.${format}.js`
    },
  }
});
