# OnRamp

React + Vite + Tailwind CSS v4 application.

## Development

- Start the development server with `npm run dev`.
- Vite serves the app on port `8443` by default; `PORT` can override it.
- Local development runs the Vite client and Express API together with `npm run dev`. PostgreSQL connection settings live in the ignored `.env` file; copy `.env.example` to get started.

## Project structure

- `src/main.tsx` mounts `src/App.tsx` into the `#root` element and imports `src/index.css`.
- `src/App.tsx` is the main application component.
- `src/views/` contains page views.
- `src/components/` contains reusable UI components.
- `src/styles/` contains page and component styles.
- `src/data/` contains prototype data.
- `server/` contains the local Express API and PostgreSQL connection.
- `database/postgresql/` contains the PostgreSQL schema and local seed scripts.
- `scripts/setup-local-db.js` creates the local database and applies the schema and seed.
- `index.html` is the Vite HTML shell.
- `vite.config.ts` configures React, Tailwind, the `@` alias, and the local API proxy.
- `.mise.toml` pins the Node.js version; npm ships with Node.js.

## Dependencies and styling

- Runtime: React 19 and React DOM 19.
- Styling: Tailwind CSS v4 through `@tailwindcss/vite` and the page/component styles in `src/styles/`.
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`.
- Formatting: oxfmt.

Global CSS and Tailwind v4 theme customization belong in `src/index.css`. Keep CSS imports first. Global font wiring also belongs there.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape apostrophes in single-quoted strings.
- Ensure JSX tags are closed and braces are balanced.
- Export components as default exports.
