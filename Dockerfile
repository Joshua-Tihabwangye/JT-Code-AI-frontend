# JT-Code web: the SPA built in API mode, served by unprivileged nginx on :8080.
#
#   docker build \
#     --build-arg VITE_SUPABASE_URL=https://supabase.example.com \
#     --build-arg VITE_SUPABASE_ANON_KEY=<anon key> \
#     -t jt-code-web .
#   docker run -p 8080:8080 -e JT_SUPABASE_ORIGIN=https://supabase.example.com jt-code-web
#
# The backend's compose.yaml builds this image as the `web` service (profile `edge`) and passes every
# argument from .env.production. The anon key is public by design (it ships in the bundle); no other
# secret may be passed here.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_DATA_MODE=api
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENVIRONMENT=production
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
ARG VITE_APP_VERSION=0.1.0
ENV VITE_DATA_MODE=$VITE_DATA_MODE \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT \
    VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE \
    VITE_APP_VERSION=$VITE_APP_VERSION
# An API-mode image without Supabase settings would fail in the browser; fail the build instead.
RUN if [ "$VITE_DATA_MODE" = "api" ] && { [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; }; then \
      echo "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for VITE_DATA_MODE=api" >&2; exit 1; \
    fi \
 && npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
ENV JT_SUPABASE_ORIGIN="" \
    NGINX_ENVSUBST_FILTER=^JT_
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY nginx-security-headers.inc /etc/nginx/conf.d/jt-security-headers.inc
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
