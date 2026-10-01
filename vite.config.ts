import { defineConfig } from 'vite'

// Library build: Mux Player and React stay external (installed by the application).
export default defineConfig({
  build: {
    lib: { entry: { index: 'src/index.ts', react: 'src/react.tsx' }, formats: ['es'] },
    rollupOptions: { external: [/^@mux\//, /^media-chrome/, 'react', 'react-dom', 'react/jsx-runtime'] },
    sourcemap: true,
    emptyOutDir: true,
  },
})
