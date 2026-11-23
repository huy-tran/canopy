// Lint rules: Nuxt's own set for the renderer, and the same TypeScript rules for the main process, scripts and tests.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  { ignores: ['dist-electron/**', 'release/**', '.sim-check/**'] },
  {
    rules: {
      // Hook payloads, transcripts and AWS responses are loosely shaped JSON: `any` is how the code reads them.
      '@typescript-eslint/no-explicit-any': 'off',
      // Records keyed by id are copied and then trimmed with delete.
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
      'vue/multi-word-component-names': 'off',
      // The AWS grid edits the table object its screen hands it.
      'vue/no-mutating-props': 'off',
      // Only escaped, highlighted log lines are rendered this way.
      'vue/no-v-html': 'off',
    },
  },
  {
    files: ['tests/**'],
    rules: { '@typescript-eslint/no-extraneous-class': 'off' },
  },
)
