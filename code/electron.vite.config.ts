import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

const configDirectory = fileURLToPath(new URL('.', import.meta.url));
const shaderDirectory = join(configDirectory, 'vendor/live2d-sdk-web/Framework/Shaders/WebGL');

function shaderFiles(directory: string, prefix = ''): Array<{ fileName: string; source: Buffer }> {
  const files: Array<{ fileName: string; source: Buffer }> = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...shaderFiles(absolutePath, relativeName));
    } else if (/\.(vert|frag)$/i.test(entry.name)) {
      files.push({ fileName: relativeName.replaceAll('\\', '/'), source: readFileSync(absolutePath) });
    }
  }
  return files;
}

function live2dShaderPlugin(): Plugin {
  return {
    name: 'starchat-live2d-shader-assets',
    generateBundle() {
      for (const shader of shaderFiles(shaderDirectory)) {
        this.emitFile({
          type: 'asset',
          fileName: `live2d-shaders/${shader.fileName}`,
          source: shader.source
        });
      }
    }
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [live2dShaderPlugin(), react()],
    resolve: {
      alias: {
        '@framework': join(configDirectory, 'vendor/live2d-sdk-web/Framework/src')
      }
    }
  }
});
