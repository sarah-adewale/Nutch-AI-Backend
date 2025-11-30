# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nutch is a browser-native AI assistant consisting of a browser extension frontend and this backend API. The backend handles authentication, AI model routing, file management, chat history, and secure API key management for users' "Bring Your Own Key" (BYOK) integrations.

## Architecture

### Core Components

1. **Authentication Service** - OAuth (Google/GitHub) + magic email links + anonymous mode
2. **AI Router** - Routes prompts to appropriate models (default Nutch keys or user BYOK)
3. **File Manager** - Auto-organizes outputs into `/code` and `/documents` folders
4. **Chat History** - Stores conversations with user limits (3 sessions for anonymous users)
5. **Security Layer** - AES-256 encryption for BYOK API keys, rate limiting

### Data Flow

```
Browser Extension → API Gateway → Auth Check → AI Router → Model APIs
                                      ↓
File Storage ← Response Handler ← AI Response
```

### User Types & Limitations

- **Anonymous Users**: 3 chat sessions max, 5 files max, no history persistence
- **Logged-in Users**: Unlimited history, searchable conversations, higher file limits

## Tech Stack (Implemented)

- **API**: NestJS with TypeScript + Express
- **Auth**: Passport.js with JWT + Google/GitHub OAuth
- **Database**: PostgreSQL with Prisma ORM + Redis cache
- **Storage**: AWS S3 for large files
- **Queue**: BullMQ for async AI model calls
- **Encryption**: AES-256 via crypto-js for BYOK API keys
- **Security**: Helmet, rate limiting, CORS for browser extension

## Current Project Structure

```
src/
├── auth/                    # Authentication & OAuth
│   ├── strategies/          # Passport.js strategies (JWT, Google, GitHub)
│   ├── auth.controller.ts   # Auth endpoints
│   ├── auth.service.ts      # Auth business logic
│   └── auth.module.ts
├── users/                   # User management
│   ├── users.controller.ts  # User profile endpoints
│   ├── users.service.ts     # User CRUD operations
│   └── users.module.ts
├── ai-router/               # AI model routing
│   ├── dto/                 # Request/response DTOs
│   ├── ai-router.controller.ts
│   ├── ai-router.service.ts
│   └── ai-router.module.ts
├── chat/                    # Chat history management
│   ├── chat.controller.ts   # Chat session endpoints
│   ├── chat.service.ts      # Chat history logic
│   └── chat.module.ts
├── files/                   # File storage & organization
│   ├── files.controller.ts  # File management endpoints
│   ├── files.service.ts     # File organization logic
│   ├── s3.service.ts        # AWS S3 integration
│   └── files.module.ts
├── encryption/              # BYOK key encryption
│   ├── encryption.service.ts # AES-256 encryption
│   └── encryption.module.ts
├── common/                  # Shared utilities
│   └── decorators/          # Custom decorators (CurrentUser)
├── database/                # Database configuration
│   ├── prisma.service.ts    # Prisma client
│   └── prisma.module.ts
├── app.module.ts           # Main app module
└── main.ts                 # Application bootstrap
```

## API Endpoints Structure

### Implemented Endpoints

**Authentication:**
- `GET /api/v1/auth/google` - Initiate Google OAuth
- `GET /api/v1/auth/google/callback` - Google OAuth callback
- `GET /api/v1/auth/github` - Initiate GitHub OAuth
- `GET /api/v1/auth/github/callback` - GitHub OAuth callback
- `POST /api/v1/auth/anonymous` - Create anonymous session

**Users:**
- `GET /api/v1/users/profile` - Get user profile with limits

**AI Router:**
- `POST /api/v1/ai/prompt` - Process AI prompt (rate limited)

**Chat History:**
- `GET /api/v1/chat/sessions` - Get user's chat sessions
- `GET /api/v1/chat/sessions/:id` - Get specific chat session
- `DELETE /api/v1/chat/sessions/:id` - Delete chat session
- `GET /api/v1/chat/search?q=query` - Search chat history

**File Management:**
- `GET /api/v1/files` - Get user's files
- `DELETE /api/v1/files/:id` - Delete file

### Core Request Format
```json
{
  "user_id": "abc123",
  "model": "gpt-4",
  "input_type": "text|code|image",
  "context": "...",
  "prompt": "..."
}
```

### Response Formats
- **Standard AI Response**: `{response, model_used, timestamp, file_type, folder}`
- **Redirect Response**: `{redirect: true, tool, reason, pre_fill}`

## Development Commands

**Setup:**
- `npm install` - Install all dependencies
- `cp .env.example .env` - Copy environment template and configure:
  - Set up PostgreSQL database URL
  - Configure OAuth keys for Google/GitHub
  - Set JWT secret and encryption keys
  - Configure Redis and AWS S3 credentials
- `npx prisma generate` - Generate Prisma client
- `npx prisma db push` - Create database tables
- `npm run start:dev` - Start development server

**Database:**
- `npx prisma generate` - Generate Prisma client
- `npx prisma db push` - Push schema to database (development)
- `npx prisma migrate dev` - Create and apply migrations
- `npx prisma migrate deploy` - Deploy migrations (production)
- `npx prisma studio` - Open Prisma Studio for database GUI

**Development:**
- `npm run start:dev` - Start development server with hot reload
- `npm run start` - Start production server
- `npm run start:debug` - Start server with debug mode

**API Documentation:**
- Swagger UI available at `http://localhost:3100/api/docs` when server is running
- Interactive API documentation with request/response examples
- JWT authentication testing built-in

**Testing:**
- `npm run test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:cov` - Run tests with coverage
- `npm run test:e2e` - Run end-to-end tests

**Code Quality:**
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

**Production:**
- `npm run build` - Build for production
- `npm run start:prod` - Start production server

## Key Implementation Notes

### Security Requirements
- All BYOK API keys must be encrypted at rest (AES-256)
- No plaintext storage of user API keys
- Rate limiting on all public endpoints
- 99.9% uptime requirement

### Model Integration
- Design for scalability - avoid hard-coded model logic
- Support routing to multiple AI providers (OpenAI, Anthropic, etc.)
- Handle model-specific limitations and redirect appropriately

### File Management
- Auto-categorization: code outputs → `/code`, text outputs → `/documents`
- Implement user storage quotas
- Support file download and deletion

### Anonymous User Handling
- Track via temporary session IDs
- Enforce strict limits (3 chats, 5 files)
- Local caching for session continuity

## Development Priorities

1. **Authentication system** - Start with one OAuth provider + anonymous mode
2. **Basic AI routing** - Single model integration first (GPT-4)
3. **File storage** - Simple S3/Supabase integration
4. **User limits enforcement** - Critical for anonymous user experience
5. **BYOK encryption** - Security-critical feature
6. **Chat history** - Persistent storage with search
7. **Smart redirects** - Handle unsupported model features

## Database Schema Considerations

### Users Table
- `user_id`, `auth_provider`, `email`, `created_at`, `subscription_tier`

### Chat Sessions
- `session_id`, `user_id`, `messages[]`, `model_used`, `created_at`

### Files
- `file_id`, `user_id`, `folder`, `filename`, `content`, `file_type`

### BYOK Keys (Encrypted)
- `user_id`, `provider`, `encrypted_key`, `key_metadata`

## Testing Strategy

- Unit tests for each service component
- Integration tests for API endpoints
- Load testing for concurrent user scenarios
- Security testing for BYOK key encryption
- Rate limiting validation