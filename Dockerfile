FROM node:22-alpine AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.25 AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -o /out/tofu-k8s-console ./cmd/server/

FROM gcr.io/distroless/static:nonroot
WORKDIR /
COPY --from=backend /out/tofu-k8s-console /tofu-k8s-console
USER 65532:65532
ENTRYPOINT ["/tofu-k8s-console"]
