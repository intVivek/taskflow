FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/api ./cmd/api && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/seed ./cmd/seed

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /bin/api /api
COPY --from=build /bin/seed /seed
EXPOSE 8080
ENTRYPOINT ["/api"]
