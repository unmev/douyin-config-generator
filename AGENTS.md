# Repository Guidelines

## Project Structure & Module Organization

This directory contains a dependency-free static web app for creating Douyin configuration JSON. Keep UI markup in `index.html`, presentation and responsive/theme rules in `styles.css`, and browser event/rendering code in `app.js`. Put schema normalization, validation, import/export, and pure configuration helpers in `config-core.js`; this module is intentionally usable from Node tests without a DOM. Automated checks live in `tests/`: `config-core.test.mjs` covers the core API, `check-icons.mjs` verifies SVG symbol references, and `python_compat.py` checks compatibility with the parent Python application. Deployment configuration is under `deploy/`.

## Build, Test, and Development Commands

No package installation or bundling is required.

- `npm run serve` starts Python's static server on port 4173; open `http://localhost:4173/`.
- `npm test` runs all `*.test.mjs` files with Node's built-in test runner.
- `node tests/check-icons.mjs` verifies every `#icon-*` use in HTML and JS has a matching SVG symbol.
- From the repository root, run `python frontend/tests/python_compat.py` when changing generated JSON semantics; it imports the parent Python parser.

## Coding Style & Naming Conventions

Use ES modules, 2-space indentation, semicolons, double-quoted strings, and trailing commas in multiline literals. Prefer small, pure functions in `config-core.js`; keep DOM querying and mutation in `app.js`. Name JavaScript functions and variables in `camelCase`, exported constants in `UPPER_SNAKE_CASE`, and test files as `*.test.mjs`. Match the existing CSS custom-property and kebab-case class naming style. Preserve accessibility attributes and avoid introducing external dependencies for routine UI work.

## Testing Guidelines

Add focused `node:test` cases for each change to parsing, defaults, validation, conversions, or serialization. Use descriptive behavior-oriented names such as `"rejects missing sticker mappings"`. Cover both accepted configurations and relevant invalid input paths. Run `npm test` and the icon check after changes that affect UI icons; run the Python compatibility check for schema changes.

## Commit & Pull Request Guidelines

The available history contains only the initial commit, so no established convention exists. Use short imperative subjects, for example `Validate random message choices`. Keep commits narrowly scoped. Pull requests should state the user-visible or schema impact, list commands run, link relevant issues, and include screenshots for visual changes. Never commit cookies, storage state, webhooks, tokens, or other credentials; generated configs must remain credential-free.
