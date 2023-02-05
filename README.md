# Online Learning Platform - Production-Grade Backend

A scalable, production-grade backend system for an online learning platform built with Node.js and Go microservices architecture.

## 🏗️ Architecture Overview

This platform uses a hybrid architecture combining:
- **Node.js** (Fastify) for API gateway and business logic
- **Go** for high-performance services (analytics, content processing)
- **PostgreSQL** for relational data storage
- **Redis** for caching and background job queues
- **Docker** for containerization and deployment

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │────│  API Gateway    │────│   Load Balancer │
│ (Web/Mobile)    │    │  (Node.js)      │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Service Mesh                               │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Auth Service  │  Course Service │   Analytics Service (Go)    │
│   (Node.js)     │   (Node.js)     │                             │
├─────────────────┼─────────────────┼─────────────────────────────┤
│  User Service   │ Progress Service│   Content Service (Go)      │
│   (Node.js)     │   (Node.js)     │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                        │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   PostgreSQL    │     Redis       │      Message Queue           │
│   (Primary DB)  │   (Cache)       │    (BullMQ)                 │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Go 1.21+ (for Go services)
- PostgreSQL 15+ (if running locally)
- Redis 7+ (if running locally)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd point
```

2. **Copy environment configuration**
```bash
cp .env.example .env
```

3. **Start the platform with Docker Compose**
```bash
docker-compose up -d
```

4. **Initialize the database**
```bash
docker-compose exec postgres psql -U postgres -d learning_platform -f /docker-entrypoint-initdb.d/01-schema.sql
```

5. **Access the services**
- API Gateway: http://localhost:3000
- API Documentation: http://localhost:3000/docs
- Grafana Dashboard: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090

## 📁 Project Structure

```
point/
├── services/                          # Microservices
│   ├── gateway/                       # Node.js API Gateway
│   ├── auth/                          # Authentication Service
│   ├── users/                         # User Management
│   ├── courses/                       # Course Management
│   ├── progress/                      # Progress Tracking
│   ├── analytics-go/                  # Go Analytics Service
│   └── content-go/                    # Go Content Processing
├── shared/                            # Shared libraries
│   ├── database/                      # Database schemas & migrations
│   ├── cache/                         # Redis utilities
│   ├── queue/                         # BullMQ job queues
│   └── utils/                         # Common utilities
├── docs/                              # Documentation
├── tests/                             # Test suites
├── monitoring/                        # Monitoring configs
└── scripts/                           # Development scripts
```

## 🔧 Core Features

### Authentication & Authorization
- JWT-based authentication with refresh tokens
- Role-based access control (student, instructor, admin)
- Email verification and password reset
- API key authentication for external integrations

### Course Management
- Create, update, publish courses
- Modular course structure (modules → lessons)
- Access control (enrolled users only)
- Course reviews and ratings
- Instructor analytics

### Student Features
- Course enrollment and progress tracking
- Resume learning state
- Certificate generation
- Personalized recommendations

### Content Processing
- Video transcoding and optimization
- Thumbnail generation
- Document processing
- Content delivery via CDN

### Analytics & Reporting
- Real-time dashboard metrics
- Course performance analytics
- User behavior tracking
- Revenue and engagement reports

### Background Jobs
- Email notifications (BullMQ)
- Content processing
- Data cleanup and analytics
- Webhook delivery

## 🔌 API Endpoints

### Authentication
```
POST /api/v1/auth/register          # User registration
POST /api/v1/auth/login             # User login
POST /api/v1/auth/refresh           # Refresh token
POST /api/v1/auth/logout            # Logout
POST /api/v1/auth/forgot-password   # Password reset
```

### Courses
```
GET    /api/v1/courses              # List courses (public)
GET    /api/v1/courses/:id          # Get course details
POST   /api/v1/courses              # Create course (instructor)
PUT    /api/v1/courses/:id          # Update course (instructor)
DELETE /api/v1/courses/:id          # Delete course (instructor)
POST   /api/v1/courses/:id/enroll   # Enroll in course
```

### Progress
```
GET /api/v1/progress/courses/:id    # Course progress
POST /api/v1/progress/lessons/:id   # Mark lesson complete
GET /api/v1/progress/dashboard      # User dashboard
```

### Analytics
```
GET /api/v1/analytics/dashboard     # Dashboard metrics
GET /api/v1/analytics/courses/:id   # Course analytics
GET /api/v1/analytics/revenue       # Revenue analytics
```

## 🗄️ Database Schema

The platform uses PostgreSQL with the following key tables:

- **users** - User accounts and profiles
- **courses** - Course information and metadata
- **modules** - Course modules
- **lessons** - Individual lessons within modules
- **enrollments** - User course enrollments
- **lesson_progress** - User progress tracking
- **reviews** - Course reviews and ratings
- **payments** - Payment transactions
- **notifications** - User notifications
- **analytics_events** - Analytics event tracking

See `shared/database/schema.sql` for the complete schema.

## 🔄 Background Jobs

The platform uses BullMQ with Redis for background processing:

### Email Jobs
- Welcome emails
- Enrollment confirmations
- Course completion notifications
- Password reset emails

### Content Processing Jobs
- Video transcoding
- Thumbnail generation
- Image optimization
- Document processing

### Analytics Jobs
- Dashboard updates
- Report generation
- Metrics calculation

### Cleanup Jobs
- Old session cleanup
- Expired token removal
- Log rotation

## 🚀 Performance Optimizations

### Caching Strategy
- **Redis** for frequently accessed data
- **Multi-level caching** (application + Redis)
- **Cache invalidation** on data updates
- **Warm cache** strategies

### Database Optimizations
- **Connection pooling** (PgBouncer)
- **Read replicas** for analytics queries
- **Optimized indexes** and query patterns
- **N+1 query prevention**

### Queue Processing
- **Job prioritization** and batching
- **Retry mechanisms** with exponential backoff
- **Dead letter queues** for failed jobs
- **Concurrent processing** limits

## 🔒 Security Features

### Authentication
- **JWT tokens** with configurable expiration
- **Refresh tokens** with secure storage
- **Password hashing** with bcrypt
- **Rate limiting** on authentication endpoints

### Data Protection
- **Encryption at rest** and in transit
- **PII data masking** in logs
- **SQL injection prevention**
- **XSS protection** headers

### Access Control
- **Role-based permissions** (RBAC)
- **Resource ownership** validation
- **API rate limiting**
- **CORS configuration**

## 📊 Monitoring & Observability

### Metrics Collection
- **Prometheus** for application metrics
- **Custom business metrics** tracking
- **Database query performance**
- **Queue depth and processing times**

### Logging
- **Structured JSON logging**
- **Correlation IDs** for request tracing
- **Log aggregation** and analysis
- **Error tracking** and alerting

### Health Checks
- **Service health endpoints**
- **Database connectivity** checks
- **Cache availability** monitoring
- **Dependency health** verification

## 🧪 Testing

### Test Types
- **Unit tests** for business logic
- **Integration tests** for API endpoints
- **Load testing** for performance validation
- **Contract testing** between services

### Running Tests
```bash
# Node.js services
npm test

# Go services
go test ./...

# Integration tests
npm run test:integration

# Load tests
npm run test:load
```

## 🚦 CI/CD Pipeline

### Development Workflow
1. **Feature branch** development
2. **Automated testing** on push
3. **Code review** and approval
4. **Merge to main** branch
5. **Automated deployment** to staging
6. **Manual promotion** to production

### Deployment
- **Docker containers** for consistency
- **Kubernetes** for orchestration
- **Blue-green deployment** strategy
- **Rollback capabilities**

## 🔧 Development

### Local Development Setup
```bash
# Install dependencies
npm install

# Start services
docker-compose up -d

# Run migrations
npm run migrate

# Seed data (optional)
npm run seed

# Start development server
npm run dev
```

### Environment Variables
See `.env.example` for all available configuration options.

### Database Migrations
```bash
# Create new migration
npm run migration:create <name>

# Run migrations
npm run migrate

# Rollback migration
npm run migrate:rollback
```

## 📈 Scaling Considerations

### Horizontal Scaling
- **Stateless services** for easy scaling
- **Load balancer** distribution
- **Database read replicas**
- **Cache clustering**

### Performance Scaling
- **Service mesh** for inter-service communication
- **CDN integration** for static content
- **Background job** processing
- **Database sharding** (if needed)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation in `/docs`
- Review the API documentation at `/docs/api`

## 🗺️ Roadmap

### Phase 1 (Current)
- ✅ Core platform functionality
- ✅ Authentication and authorization
- ✅ Course management
- ✅ Progress tracking
- ✅ Basic analytics

### Phase 2 (Upcoming)
- 🔄 Real-time notifications
- 🔄 Advanced analytics
- 🔄 Mobile app APIs
- 🔄 Payment gateway integration
- 🔄 Live streaming support

### Phase 3 (Future)
- 📋 AI-powered recommendations
- 📋 Advanced reporting
- 📋 Multi-language support
- 📋 White-label capabilities
- 📋 Enterprise features

---

Built with ❤️ for the online learning community.
