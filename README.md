# FitSync API Gateway

The API Gateway for the FitSync multi-repository application. 
This service routes requests to the appropriate microservices and handles cross-cutting concerns like authentication, rate limiting, and request aggregation.

## Features

- Request routing to microservices
- Authentication and authorization
- Rate limiting
- Request/response transformation
- API composition
- Caching with Redis

## Running the Full FitSync Application

This service is part of the FitSync multi-repository application. To run the complete application:

### Prerequisites

- Docker Desktop installed and running
- Git installed

### Quick Start - Full Application

1. **Clone all repositories to the same parent directory:**

```bash
# Create parent directory
mkdir fitsync-app
cd fitsync-app

# Clone all repositories
git clone https://github.com/FitSync-G13/fitsync-docker-compose.git
git clone https://github.com/FitSync-G13/fitsync-api-gateway.git
git clone https://github.com/FitSync-G13/fitsync-user-service.git
git clone https://github.com/FitSync-G13/fitsync-training-service.git
git clone https://github.com/FitSync-G13/fitsync-schedule-service.git
git clone https://github.com/FitSync-G13/fitsync-progress-service.git
git clone https://github.com/FitSync-G13/fitsync-notification-service.git
git clone https://github.com/FitSync-G13/fitsync-frontend.git
```

2. **Run the setup script:**

```bash
cd fitsync-docker-compose

# Linux / Mac
./setup.sh

# Windows
setup.bat
```

3. **Access the application:**
   - Frontend: http://localhost:3000
   - API Gateway: http://localhost:4000
   - Login: `client@fitsync.com` / `Client@123`

### Expected Directory Structure

```
parent-directory/
├── fitsync-docker-compose/     # Orchestration
├── fitsync-api-gateway/        # THIS REPOSITORY
├── fitsync-user-service/
├── fitsync-training-service/
├── fitsync-schedule-service/
├── fitsync-progress-service/
├── fitsync-notification-service/
└── fitsync-frontend/
```

## Development - Run This Service Locally

To develop this service while running other services in Docker:

1. **Start infrastructure and other services:**
```bash
cd ../fitsync-docker-compose
docker compose up -d
docker compose stop api-gateway
```

2. **Install dependencies:**
```bash
cd ../fitsync-api-gateway
npm install
```

3. **Configure environment:**
Create `.env` file with:
```env
PORT=4000
USER_SERVICE_URL=http://localhost:3001
TRAINING_SERVICE_URL=http://localhost:3002
SCHEDULE_SERVICE_URL=http://localhost:8003
PROGRESS_SERVICE_URL=http://localhost:8004
NOTIFICATION_SERVICE_URL=http://localhost:3005
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

4. **Run in development mode:**
```bash
npm run dev
```

The API Gateway will be available at http://localhost:4000

## Common Commands

**View logs:**
```bash
cd ../fitsync-docker-compose
docker compose logs -f api-gateway
```

**Restart service:**
```bash
docker compose restart api-gateway
```

**Rebuild after changes:**
```bash
docker compose build api-gateway
docker compose up -d api-gateway
```

**Stop everything:**
```bash
docker compose down
```

## API Endpoints

The API Gateway exposes the following routes:

- `/api/auth/*`             - Authentication (User Service)
- `/api/users/*`            - User management (User Service)
- `/api/training/*`         - Workouts & exercises (Training Service)
- `/api/schedule/*`         - Bookings (Schedule Service)
- `/api/progress/*`         - Metrics & analytics (Progress Service)
- `/api/notifications/*`    - Notifications (Notification Service)

## Testing

This service uses Jest for unit testing.

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- tests/unit/tokenVerification.test.js
```

### Test Structure

```
tests/
├── setup.js                          # Test environment configuration
└── unit/
    ├── tokenVerification.test.js     # JWT verification tests (20 tests)
    ├── rateLimiting.test.js          # Rate limiting tests (24 tests)
    └── dashboardAggregation.test.js  # Dashboard logic tests (25 tests)
```

### Test Coverage

The test suite covers:

#### Token Verification (`tokenVerification.test.js`)
- **Token Extraction** - Header parsing, Bearer prefix validation
- **Valid Token Processing** - Decoding, role handling, claim verification
- **Invalid Token Handling** - Expired, invalid signature, wrong issuer/audience, malformed
- **Token Payload Variations** - Custom claims, minimal payloads
- **JWT Helper Functions** - Token generation and verification

#### Rate Limiting (`rateLimiting.test.js`)
- **Configuration Options** - Window, max requests, headers, skip function
- **Custom Values** - Environment variable overrides
- **Error Responses** - Rate limit exceeded message structure
- **Environment-based Bypass** - Development/production/test mode behavior
- **Headers** - Standard vs legacy rate limit headers

#### Dashboard Aggregation (`dashboardAggregation.test.js`)
- **Client Dashboard** - Multi-service aggregation, partial failure handling
- **Trainer Dashboard** - Today's schedule filtering, active client counting
- **Admin Dashboard** - Pagination count extraction, total statistics
- **Access Control** - Role-based dashboard access (client, trainer, admin)
- **Response Structure** - Success flags, timestamps, error formats

### Current Test Status

- **Total Tests:** 69
- **Passing:** 69
- **Coverage Areas:** Token verification, rate limiting, dashboard aggregation, access control

## More Information

- See [fitsync-docker-compose](https://github.com/FitSync-G13/fitsync-docker-compose) for complete setup documentation
- See QUICKSTART.md in docker-compose repo for quick start guide
- See SETUP.md in docker-compose repo for detailed setup instructions

## License

MIT
