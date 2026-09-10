# Multi-stage Docker build for Golang Backend
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy all source files (including vendor/)
COPY . .

# Compile using vendored dependencies, handling both repository root context and backend/ context
RUN if [ -d "backend" ]; then \
        cd backend && \
        CGO_ENABLED=0 GOOS=linux go build -mod=vendor -ldflags="-s -w" -o /app/server ./cmd/server; \
    else \
        CGO_ENABLED=0 GOOS=linux go build -mod=vendor -ldflags="-s -w" -o /app/server ./cmd/server; \
    fi

# Minimal runtime image
FROM alpine:3.20

WORKDIR /app

# Create directory for persistent SQLite database
RUN mkdir -p /app/data

COPY --from=builder /app/server /app/server

EXPOSE 8080

ENV PORT=8080
ENV DB_PATH=/app/data/media_sequencer.db

CMD ["/app/server"]
