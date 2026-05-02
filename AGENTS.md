# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains a single static web app:

- `reception.html` - self-contained Japanese reception/register UI with inline CSS and JavaScript.
- `AGENTS.md` - contributor guide for future maintainers and AI agents.

Keep the app portable unless the project grows. If you add assets, place them under `assets/` and reference them with relative paths. If JavaScript or CSS becomes large, split it into `src/` files only after there is a clear maintenance benefit.

## Build, Test, and Development Commands

No package manager, build system, or automated test runner is configured yet.

- Open locally: `open reception.html`
- Serve locally when browser restrictions matter: `python3 -m http.server 8000`
- Then visit: `http://localhost:8000/reception.html`

Because the page imports Google Fonts, verify both online and degraded/offline behavior when changing typography or layout.

## Coding Style & Naming Conventions

Use the existing style in `reception.html`:

- HTML uses semantic sections where practical and Japanese UI text.
- CSS uses two-space indentation, custom properties in `:root`, and kebab-case class names such as `.cart-row` and `.summary-card`.
- JavaScript should prefer `const`/`let`, small named functions, and descriptive state names.

Keep comments short and focused on why a decision exists. Avoid adding dependencies for simple UI behavior.

## Testing Guidelines

Automated tests are not present. For each change, manually verify:

- Register tab: item add/remove, clear, checkout, and disabled states.
- Summary tab: totals, category counts, hourly bars, history, and reset flow.
- Mobile-sized viewport behavior, since the UI is optimized for touch use.
- Browser console has no errors.

If logic grows, add a lightweight test setup and place tests near the extracted source files, using names like `cart.test.js`.

## Commit & Pull Request Guidelines

This directory is not currently a Git repository, so no local commit history is available. Use Conventional Commits going forward, for example:

- `feat: 受付履歴の表示を追加`
- `fix: 会計後にカートを確実に空にする`
- `docs: contributor guide を追加`

Pull requests should include a concise summary, manual verification steps, linked issue when applicable, and screenshots or screen recordings for visible UI changes.

## Security & Configuration Tips

Do not hardcode secrets or operational credentials. Validate any future external input before using it in DOM updates or storage. Keep local storage keys documented if persistence is added.
