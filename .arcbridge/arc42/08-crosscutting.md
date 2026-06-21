---
section: crosscutting-concepts
schema_version: 1
---
# Crosscutting Concepts

This section documents patterns and conventions that apply across multiple building blocks. Update this as patterns are established — it serves as the single source of truth for "how we do things" in arcbridge.

> **For agents:** Consult this document before implementing any crosscutting concern. If you establish a new pattern, document it here so other code follows the same approach.

## Error Handling

*Document the error handling strategy once established.*

- Error response format and status codes
- Error middleware/handler approach
- Correlation IDs for request tracing

## Logging

*Document the logging strategy once established.*

- Logging library and format
- Log levels and conventions
- Request/response logging

## Authentication & Authorization

*Document the auth approach once established.*

- Auth mechanism (JWT, session, API key)
- Middleware structure for auth
- Role/permission model

## Validation

*Document the validation approach once established.*

- Validation library (Zod, Joi, etc.)
- Where validation runs (middleware, handler)
- Error format for validation failures

## Database Access

*Document the data access patterns once established.*

- ORM/query builder choice
- Connection pooling and transaction patterns
- Migration strategy

## API Contract

*Document how this service exposes its API to consumers.*

- OpenAPI/Swagger generation approach
- How consumers (frontend, other services) discover and use the API contract
- Versioning strategy for breaking changes
- Response envelope format and error conventions

## Events & Messaging

*Document if this service publishes or subscribes to events/messages.*

- Messaging infrastructure (RabbitMQ, Kafka, Redis Pub/Sub, etc.)
- Event naming conventions and schema format
- Publisher/subscriber topology
- Error handling and retry strategy for failed message processing
- Schema versioning approach for event contracts
