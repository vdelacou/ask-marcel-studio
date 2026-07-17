import pluginJs from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import securityPlugin from 'eslint-plugin-security';
import sonarjsPlugin from 'eslint-plugin-sonarjs';
import unicornPlugin from 'eslint-plugin-unicorn';
import globals from 'globals';
import tsPlugin from 'typescript-eslint';

// The `mock` ban (hard rule 13). Declared once as a constant because ESLint flat
// config REPLACES rather than merges two `no-restricted-imports` objects matching
// the same file: the later object wins outright. The design-system block below
// therefore re-declares this `paths` entry inline alongside its own `patterns`,
// instead of relying on a separate trailing ban object that would silently drop
// one set or the other for src/renderer/src/components/**.
const MOCK_BAN_PATHS = [
  {
    name: 'bun:test',
    importNames: ['mock'],
    message:
      '`mock` from bun:test is forbidden — it leaks across test files. Use dependency injection: refactor the production code to accept the SDK as a parameter, then pass a fake at construction.',
  },
];

/** @type {import('eslint').Linter.Config[]} */
export default [
  pluginJs.configs.recommended,
  ...tsPlugin.configs.recommended,
  securityPlugin.configs.recommended,
  {
    // .mjs included for the dev harnesses in scripts/ (e.g. fake-anthropic.mjs),
    // which run under plain node and need its globals.
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: {
      'func-style': ['error', 'expression'],
      'no-console': ['error'],
      'prefer-template': 'error',
      quotes: ['error', 'single', { avoidEscape: true }],
      'no-restricted-imports': ['error', { paths: MOCK_BAN_PATHS }],
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true, allowTypedFunctionExpressions: true }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      // ignoreRestSiblings: omitting a key via rest destructuring
      // (`const { messages: _messages, ...meta } = conversation`) is the idiomatic
      // way to build a narrower record, and the omitted binding is unused BY DESIGN.
      // The alternative is re-listing every surviving field by hand, which silently
      // drops new fields as the type grows. Project-level option with a reason —
      // never an inline ignore (rule 15).
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    // The renderer runs in a browser context, not Node. Without this it would lint
    // clean while `window` and `document` are undefined globals.
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Gate scripts (scripts/check-coverage.ts, scripts/regenerate-coverage-preload.ts)
    // are terminal tools, not production code: their whole job is printing to the
    // console that invoked them. The Logger port (rule 4) governs src/**; injecting
    // a logger into a pre-commit gate would be ceremony without observability value.
    // Project-level severity change with a comment — never an inline ignore (rule 15).
    files: ['scripts/**/*.ts', 'scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  {
    // explicit-function-return-type is a TypeScript rule, and a plain .mjs file
    // cannot carry a return-type annotation to satisfy it — JSDoc does not count.
    // The dev harnesses here are .mjs because they run under plain node, outside
    // the app's toolchain. Project-level severity change with a reason (rule 15).
    files: ['**/*.mjs'],
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' },
  },
  {
    // React + a11y registration. In the canonical Next.js config these plugins arrive
    // via `next/core-web-vitals`. There is no Next here, so they MUST be registered
    // explicitly — otherwise every jsx-a11y/* and react/* entry below throws
    // 'Definition for rule not found' and the whole config fails to load.
    files: ['**/*.tsx'],
    plugins: { react: reactPlugin, 'jsx-a11y': jsxA11y },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat['jsx-runtime'].rules,
      'react/jsx-key': 'error',
      'react/no-array-index-key': 'error',
    },
  },
  {
    // ── Design system seal (hard rule 21) ────────────────────────────────────────
    // Everything under components/** is stateless props-in/JSX-out. No hooks, no
    // electron, no app imports. This single object carries BOTH its own `patterns`
    // AND a re-declared copy of MOCK_BAN_PATHS: flat config replaces rather than
    // merges, so splitting them would silently drop one for these files.
    files: ['src/renderer/src/components/**/*.tsx', 'src/renderer/src/components/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: MOCK_BAN_PATHS,
          patterns: [
            {
              // The Electron equivalent of the canonical block's `next`/`next/*` group.
              // A design-system component reaching for electron, the preload bridge, or
              // the store is the rule-21 breach this exists to catch.
              group: ['electron', 'electron/*', '@electron/*', 'zustand', 'zustand/*'],
              message:
                'Design-system components import only `react` and lower design-system layers (rule 21). State and IPC live in src/renderer/src/lib and arrive as props.',
            },
            {
              group: ['**/lib/**', '**/page/**', '**/store/**', '**/ipc/**', '**/shared/**', '**/preload/**', '**/main/**'],
              message: 'Design-system components never import application code (rule 21). Pass what they need in as props.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // Load-bearing rule-21 enforcement. Note the known blind spot: this matches
          // on callee.name, so namespace-style `React.useState(...)` is a MemberExpression
          // and slips through. Do not write namespace-style React calls in components.
          selector: 'CallExpression[callee.name=/^use[A-Z]/]',
          message: 'No hooks inside the design system (rule 21). Hoist state to props; the hook belongs in src/renderer/src/lib/hooks and is wired by a page shell.',
        },
      ],
      // Accessibility is part of the component contract (rule 21 / product discipline).
      // jsx-a11y is AST-based: it cannot judge contrast or focus order. Those stay with
      // the design tokens and review. A green lint is not an accessibility pass.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
    },
  },
  {
    // ── Styling seal (hard rule 22) ──────────────────────────────────────────────
    // The mirror of rule 21: Tailwind exists only inside components/**. The app side
    // (page shells, lib, store) never carries a class string; visual variation is a
    // typed variant prop on a component, never a className passed down.
    //
    // Sealed by exclusion, not by enumeration: everything in the renderer EXCEPT the
    // design system. An earlier version listed page/**, lib/**, app.tsx and main.tsx,
    // which silently left any other renderer .tsx unsealed — a smoke test caught it.
    // `ignores` here also keeps this block from overlapping the design-system block
    // above: two config objects declaring no-restricted-syntax for the same file would
    // REPLACE rather than merge, and the later one would win outright.
    files: ['src/renderer/src/**/*.tsx'],
    ignores: ['src/renderer/src/components/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="className"]',
          message: 'Styling is sealed inside the design system (rule 22). If this needs styling, it IS a design-system component — add a typed variant prop instead.',
        },
        {
          selector: 'JSXAttribute[name.name="style"]',
          message: 'Styling is sealed inside the design system (rule 22). Add a typed variant prop to the component instead.',
        },
      ],
    },
  },
  // Type-aware rules — slow (~25s on full repo), enabled only by
  // `bun run lint:strict` (which sets LINT_STRICT=1) and the pre-commit hook.
  // Inner-loop `bun run lint` does NOT run them.
  ...(process.env['LINT_STRICT']
    ? [
        {
          files: ['src/**/*.ts', 'src/**/*.tsx'],
          languageOptions: {
            parserOptions: {
              projectService: true,
              tsconfigRootDir: import.meta.dirname,
            },
          },
          rules: {
            // Lint-time equivalents of Sonar S4325 (no `!`/`as` non-narrowing assertions)
            // and S6671 (Promise.reject must be an Error).
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/prefer-promise-reject-errors': 'error',
          },
        },
      ]
    : []),
  {
    plugins: { prettier },
    rules: {
      'prettier/prettier': [
        1,
        {
          endOfLine: 'lf',
          printWidth: 180,
          semi: true,
          singleQuote: true,
          tabWidth: 2,
          trailingComma: 'es5',
        },
      ],
    },
  },
  {
    plugins: { unicorn: unicornPlugin },
    rules: {
      'unicorn/empty-brace-spaces': 'off',
      'unicorn/no-null': 'off',
    },
  },
  {
    rules: {
      // false-positive-heavy rules in this codebase's idioms; disabled at project level.
      // Never inline-ignore — change severity here or refactor the code.
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'off',
      // detect-non-literal-fs-filename flags `chmodSync(mkdtempSync(...))` in FS-adapter
      // tests. Production code uses Bun.file / node:fs at directory boundaries only, so
      // disabling globally loses nothing on the real attack surface.
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  sonarjsPlugin.configs.recommended,
  {
    // SonarJS rule overrides — always-on, justified per rule. See LESSONS.md.
    rules: {
      'sonarjs/no-unused-vars': 'off', // duplicates @typescript-eslint/no-unused-vars
      'sonarjs/no-empty-test-file': 'off', // false positives on `describe` test layout
      'sonarjs/cognitive-complexity': 'off', // we already cap function size; this is noise
      // This app's model reference is `providerId::modelId`, and every literal of
      // that shape ('a::b', 'anthropic::claude-opus-4-8') is read by the rule as a
      // compressed IPv6 address. Every hit is a false positive on the core domain
      // idiom, and there is no real IP literal anywhere in this codebase.
      // Project-level severity change with a reason — never an inline ignore (rule 15).
      'sonarjs/no-hardcoded-ip': 'off',
    },
  },
  // Non-source paths must not be linted: Stryker copies the tree into .stryker-tmp/
  // during a run, reports/ is output, and the config files themselves would trip
  // no-undef on `process` (they run under Node semantics, not the **/*.ts globals block).
  // scripts/ IS linted — the gate scripts stay under the full rule set, with only
  // no-console turned off for them above.
  {
    ignores: ['eslint.config.js', 'electron.vite.config.ts', '.stryker-tmp/**', 'reports/**', 'out/**', 'dist/**', 'docs/**', '.claude/**', '.agents/**'],
  },
];
