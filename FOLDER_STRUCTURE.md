# Project Folder Structure

```
point/
├── README.md
├── ARCHITECTURE.md
├── FOLDER_STRUCTURE.md
├── docker-compose.yml
├── .env.example
├── package.json
├── go.mod
│
├── services/                          # Microservices
│   ├── gateway/                       # Node.js API Gateway (Fastify)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── plugins/
│   │   │   └── app.js
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env
│   │
│   ├── auth/                          # Node.js Authentication Service
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   ├── middleware/
│   │   │   └── app.js
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env
│   │
│   ├── users/                         # Node.js User Management Service
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   └── app.js
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env
│   │
│   ├── courses/                       # Node.js Course Management Service
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   └── app.js
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env
│   │
│   ├── progress/                      # Node.js Progress Tracking Service
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   └── app.js
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env
│   │
│   ├── analytics-go/                  # Go Analytics Service
│   │   ├── cmd/
│   │   │   └── main.go
│   │   ├── internal/
│   │   │   ├── handlers/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   └── config/
│   │   ├── pkg/
│   │   ├── Dockerfile
│   │   └── go.mod
│   │
│   └── content-go/                    # Go Content Processing Service
│       ├── cmd/
│       │   └── main.go
│       ├── internal/
│       │   ├── handlers/
│       │   ├── services/
│       │   ├── models/
│       │   └── config/
│       ├── pkg/
│       ├── Dockerfile
│       └── go.mod
│
├── shared/                            # Shared libraries and utilities
│   ├── database/                      # Database schemas and migrations
│   │   ├── migrations/
│   │   ├── seeds/
│   │   ├── schema.sql
│   │   └── connection.js
│   │
│   ├── cache/                         # Redis caching utilities
│   │   ├── redis-client.js
│   │   ├── cache-strategies.js
│   │   └── cache-keys.js
│   │
│   ├── queue/                         # BullMQ job queue setup
│   │   ├── processors/
│   │   ├── jobs/
│   │   ├── workers/
│   │   └── queue-config.js
│   │
│   ├── messaging/                     # Event messaging utilities
│   │   ├── events.js
│   │   ├── publishers/
│   │   └── subscribers/
│   │
│   └── utils/                         # Common utilities
│       ├── logger.js
│       ├── validator.js
│       ├── crypto.js
│       └── constants.js
│
├── scripts/                           # Development and deployment scripts
│   ├── setup.sh
│   ├── migrate.sh
│   ├── seed.sh
│   ├── build.sh
│   └── deploy.sh
│
├── docs/                              # Documentation
│   ├── api/
│   │   ├── openapi.yaml
│   │   └── endpoints.md
│   ├── deployment/
│   │   ├── docker.md
│   │   └── kubernetes.md
│   └── development/
│       ├── setup.md
│       └── testing.md
│
├── tests/                             # Test suites
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── load/
│
└── monitoring/                        # Monitoring and observability
    ├── prometheus/
    ├── grafana/
    └── logs/
```

## Service Responsibilities

### Node.js Services (API Gateway & Business Logic)
- **Gateway**: Request routing, authentication, rate limiting, API versioning
- **Auth**: JWT tokens, refresh tokens, role-based access control
- **Users**: User profiles, preferences, account management
- **Courses**: Course CRUD operations, enrollment management
- **Progress**: Learning progress tracking, completion states

### Go Services (High-Performance Tasks)
- **Analytics**: Data processing, reporting, metrics calculation
- **Content**: Video processing, file transcoding, content optimization

### Shared Components
- **Database**: PostgreSQL schemas, migrations, connection management
- **Cache**: Redis client, caching strategies, invalidation
- **Queue**: BullMQ job processing, background tasks
- **Messaging**: Event-driven communication between services

## Development Workflow

1. **Local Development**: Use `docker-compose up` to spin up all services
2. **Database Migrations**: Run `scripts/migrate.sh` for schema updates
3. **Testing**: Use `npm test` for Node.js, `go test` for Go services
4. **Building**: Use `scripts/build.sh` to create Docker images
5. **Deployment**: Use `scripts/deploy.sh` for production deployment

## Environment Configuration

Each service has its own `.env` file with:
- Database connection strings
- Redis configuration
- Service ports and URLs
- API keys and secrets
- Logging levels

## Inter-Service Communication

- **Synchronous**: HTTP/gRPC calls between services
- **Asynchronous**: Redis Pub/Sub for events
- **Queue**: BullMQ for background processing
- **Database**: Shared PostgreSQL for consistency
