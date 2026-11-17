# JT-Code Web

Production-oriented React + TypeScript boilerplate for the JT-Code web application. This is one of two separate repositories; the Django API lives in `jt-code backend`.

## Tech Stack

- **Framework**: React 19 + TypeScript + Vite 7
- **Authentication**: Supabase Auth (JWT)
- **State Management**: TanStack Query (React Query) + Zustand
- **Routing**: React Router v7
- **Styling**: CSS Modules + CSS Variables
- **Error Monitoring**: Sentry
- **Testing**: Vitest + React Testing Library
- **Linting**: ESLint + TypeScript ESLint + Prettier
- **Build**: Vite + Docker/Nginx

## Project Structure

```
jt-code-frontend/
├── public/                 # Static assets (copied as-is to dist)
├── src/
│   ├── app/                # Application-level setup
│   │   ├── App.tsx         # Root component
│   │   ├── layouts/        # Page layouts
│   │   ├── providers/      # Context providers (Query, Auth, etc.)
│   │   └── routes/         # Route definitions
│   ├── features/           # Feature-based modules (domain-driven)
│   │   ├── chat/           # Chat feature
│   │   │   ├── components/ # Chat-specific components
│   │   │   ├── hooks/      # Chat-specific hooks
│   │   │   ├── api.ts      # Chat API calls
│   │   │   └── types.ts    # Chat types
│   │   ├── files/          # File management feature
│   │   └── settings/       # User settings feature
│   ├── shared/             # Shared code across features
│   │   ├── components/     # Reusable UI components (Button, Input, Card, etc.)
│   │   ├── hooks/          # Shared hooks (useDebounce, useLocalStorage, etc.)
│   │   ├── utils/          # Utility functions (cn, formatDate, etc.)
│   │   ├── types/          # Shared type definitions
│   │   ├── constants/      # Application constants
│   │   └── api/            # API client configuration
│   ├── pages/              # Page components (route-level)
│   ├── lib/                # Library configurations
│   ├── styles/             # Global styles and CSS variables
│   ├── test/               # Test utilities and setup
│   ├── main.tsx            # Application entry point
│   └── vite-env.d.ts       # Vite type declarations
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── eslint.config.js
├── .prettierrc
├── .env.example
├── .env.local
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── README.md
```

## Path Aliases

Configured in `tsconfig.app.json` and `vite.config.ts`:

- `@/*` → `src/*`
- `@shared/*` → `src/shared/*`
- `@features/*` → `src/features/*`
- `@app/*` → `src/app/*`
- `@lib/*` → `src/lib/*`

## Getting Started

### Prerequisites

- Node.js >= 20.19.0
- npm >= 10.x
- Docker (optional, for containerized development)

### Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Update .env.local with your Supabase project URL and anon key
# VITE_SUPABASE_URL=https://<project-ref>.supabase.co
# VITE_SUPABASE_ANON_KEY=sb_publishable_...

# Start development server (with API proxy to localhost:8000)
npm run dev
```

The Vite dev server will start at `http://localhost:5173` and proxy `/api` requests to the Django backend at `http://localhost:8000`.

### Available Scripts

```bash
# Development
npm run dev          # Start Vite dev server
npm run preview      # Preview production build locally

# Building
npm run build        # Type-check + production build
npm run typecheck    # Run TypeScript compiler check

# Testing
npm run test         # Run tests once
npm run test:watch   # Run tests in watch mode

# Code Quality
npm run lint         # Run ESLint
npm run format       # Format with Prettier
npm run check        # Run typecheck + lint + test + build (CI check)

# Docker
docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... -t jt-code-web .
docker run -p 8080:8080 jt-code-web
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL for authentication | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (publishable) key for authentication | Yes |
| `VITE_API_BASE_URL` | Base URL for API requests (default: `/api/v1`) | No |
| `VITE_SENTRY_DSN` | Sentry DSN for error tracking | No |
| `VITE_SENTRY_ENVIRONMENT` | Sentry environment name (default: `development`) | No |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Sentry traces sample rate (default: `0.1`) | No |
| `VITE_APP_NAME` | Application display name (default: `JT-Code`) | No |
| `VITE_APP_VERSION` | Application version (default: `0.1.0`) | No |

**Note**: Only variables prefixed with `VITE_` are exposed to the client. Never expose secrets (Supabase service_role keys, Cloudinary secrets, etc.) in frontend environment variables.

## Testing

Tests are written with Vitest and React Testing Library.

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test -- --coverage

# Watch mode for development
npm run test:watch
```

Test files should be placed next to the code they test (e.g., `Component.tsx` + `Component.test.tsx`).

## Code Style

This project uses:
- **ESLint** for linting with TypeScript and React rules
- **Prettier** for formatting
- **TypeScript** in strict mode

Run `npm run check` before committing to ensure all checks pass.

## Docker Production Build

The image always builds in API mode and fails if the Supabase settings are missing. In production the
backend's `compose.yaml` builds it as the `web` service from `.env.production` (`make compose-up-prod`),
so a manual build is only needed for a standalone test:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://supabase.example.com \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon key> \
  -t jt-code-web .

# nginx (unprivileged) listens on 8080; JT_SUPABASE_ORIGIN feeds the Content-Security-Policy.
docker run -p 8080:8080 -e JT_SUPABASE_ORIGIN=https://supabase.example.com jt-code-web
```

The API is expected on the same origin under `/api` (the backend's edge proxy routes it).

## Architecture

See `docs/ARCHITECTURE.md` for:
- Trust boundaries
- Authentication flow
- File upload workflow
- State management patterns
- Feature folder structure guidelines