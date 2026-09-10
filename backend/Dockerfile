# Multi-stage Docker build for Golang Backend
FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server

FROM alpine:3.20

WORKDIR /app

RUN apk --no-cache add ca-certificates

COPY --from=builder /app/server .

EXPOSE 8080

ENV PORT=8080
ENV DB_PATH=/app/data/media_sequencer.db

RUN mkdir -p /app/data

VOLUME ["/app/data"]

CMD ["./server"]
