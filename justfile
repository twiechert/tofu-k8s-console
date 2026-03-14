default:
    @just --list

# Build frontend
build-web:
    cd web && npm run build

# Build backend (includes embedded frontend)
build: build-web
    go build -o bin/tofu-k8s-console ./cmd/server/

# Run locally using current kubecontext
run: build
    ./bin/tofu-k8s-console

# Run frontend dev server (with API proxy to :8090)
dev-web:
    cd web && npm run dev

# Run backend only (for development with vite proxy)
dev-api:
    go run ./cmd/server/

# Install frontend dependencies
install-web:
    cd web && npm install
