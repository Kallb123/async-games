import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...nextCoreWebVitals,
  // What the rendering bench builds and writes (bench/realmarena/run.ts): bundles of third-party code, never ours to lint.
  { ignores: ['bench-results/**'] },
]

export default config
