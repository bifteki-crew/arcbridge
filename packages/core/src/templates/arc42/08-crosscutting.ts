import type { InitProjectInput, TemplateOutput } from "../types.js";

function dotnetConcepts(): string {
  return `## Error Handling

*Document the error handling strategy once established.*

- Exception handling middleware approach (ProblemDetails / RFC 7807)
- Correlation IDs for request tracing
- Error response format and status code conventions

## Logging

*Document the logging strategy once established.*

- Logging framework (Serilog, NLog, built-in)
- Structured logging format and required fields
- Log levels and when to use each

## Authentication & Authorization

*Document the auth approach once established.*

- Auth mechanism (JWT bearer, cookie, OAuth)
- Authorization policy definitions
- Claims and role structure

## Validation

*Document the validation approach once established.*

- Validation framework (FluentValidation, data annotations)
- Where validation runs (middleware, controller, service layer)
- Error response format for validation failures

## Database Access

*Document the data access patterns once established.*

- ORM/query approach (EF Core, Dapper)
- Repository vs. direct DbContext usage
- Transaction management
- Migration strategy

## Dependency Injection

*Document DI conventions once established.*

- Service registration organization (by feature, by layer)
- Lifetime choices (Scoped, Singleton, Transient) and when to use each
- Options pattern for configuration

## API Contract

*Document how this service exposes its API to consumers.*

- OpenAPI/Swagger generation approach
- How consumers (frontend, other services) discover and use the API contract
- Versioning strategy for breaking changes
- Response envelope format and error conventions

## Events & Messaging

*Document if this service publishes or subscribes to events/messages.*

- Messaging infrastructure (RabbitMQ, Azure Service Bus, Kafka, MediatR, etc.)
- Event naming conventions and schema format
- Publisher/subscriber topology — which services produce and consume which events
- Error handling and retry strategy for failed message processing
- Schema versioning approach for event contracts
`;
}

function frontendConcepts(): string {
  return `## State Management

*Document the state management approach once established.*

- Global state solution (Context, Zustand, Redux, etc.)
- Server state management (React Query, SWR, etc.)
- When to use local vs. global state

## Component Patterns

*Document component conventions once established.*

- Component file structure and naming
- Props interface conventions
- Server vs. client component decision criteria
- Composition patterns (compound components, render props, etc.)

## Styling

*Document the styling approach once established.*

- Styling solution (Tailwind, CSS Modules, styled-components, etc.)
- Design tokens and theme structure
- Responsive breakpoints

## Error Handling

*Document error handling patterns once established.*

- Error boundary placement and behavior
- API error handling and user-facing messages
- Loading and empty state patterns

## Authentication

*Document the auth approach once established.*

- Auth flow (session, JWT, OAuth)
- Protected route implementation
- Auth state management

## Data Fetching

*Document data fetching patterns once established.*

- Server-side vs. client-side fetching strategy
- Caching and revalidation approach
- API client structure and conventions

## API Contract

*Document how this frontend communicates with backend services.*

- Backend API base URL and environment configuration
- How request/response types are defined (OpenAPI-generated, manual, shared package)
- Error response handling (how backend errors map to UI states)
- Authentication token flow (how auth tokens are passed to the API)
- If using OpenAPI: how to regenerate types when the backend contract changes
`;
}

function apiConcepts(): string {
  return `## Error Handling

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
`;
}

function unityConcepts(): string {
  return `## Scripting Architecture

*Document the code organization and scripting patterns once established.*

- MonoBehaviour vs plain C# class usage guidelines
- Assembly definition (.asmdef) boundaries and dependencies
- Component composition patterns
- Singleton vs dependency injection approach

## Asset Management

*Document how assets are organized and loaded.*

- Folder structure and naming conventions
- Resource loading strategy (Resources, Addressables, AssetBundles)
- Asset versioning and memory lifecycle
- Prefab organization and instantiation patterns

## Scene Management

*Document the scene structure and loading strategy.*

- Scene organization (main scenes, additive scenes, test scenes)
- Scene loading patterns (async loading, transition effects)
- DontDestroyOnLoad usage and persistent objects
- Scene-to-scene data passing

## Physics & Collision

*Document physics setup and collision detection.*

- Physics layers and collision matrix configuration
- Rigidbody usage guidelines (kinematic vs dynamic)
- Collision detection mode choices
- Physics performance budget

## Input Handling

*Document player input processing.*

- Input System package configuration and action maps
- Input abstraction layer for platform-independent code
- Rebinding and accessibility considerations
- Mobile/touch input handling

## Audio

*Document audio implementation.*

- AudioMixer group structure
- Music vs SFX management and pooling
- Spatial audio configuration
- Volume control and persistence

## Visual Effects & Animation

*Document visual effects and animation approach.*

- Particle system conventions
- Shader usage and material management
- Animator controller organization and state naming
- Animation event and callback patterns

## Object Pooling

*Document object pooling strategy.*

- Which objects are pooled (projectiles, effects, enemies)
- Pool sizing and growth strategy
- Return-to-pool lifecycle management

## Save System

*Document the save/load approach.*

- Serialization format (JSON, binary, PlayerPrefs)
- Save data structure and versioning
- Auto-save and checkpoint strategy
`;
}

export function crosscuttingTemplate(input: InitProjectInput): TemplateOutput {
  const isDotnet = input.template === "dotnet-webapi";
  const isFrontend = input.template === "nextjs-app-router" || input.template === "react-vite";
  const isUnity = input.template === "unity-game";

  let concepts: string;
  if (isDotnet) {
    concepts = dotnetConcepts();
  } else if (isUnity) {
    concepts = unityConcepts();
  } else if (isFrontend) {
    concepts = frontendConcepts();
  } else {
    concepts = apiConcepts();
  }

  return {
    frontmatter: {
      section: "crosscutting-concepts",
      schema_version: 1,
    },
    body: `# Crosscutting Concepts

This section documents patterns and conventions that apply across multiple building blocks. Update this as patterns are established — it serves as the single source of truth for "how we do things" in ${input.name}.

> **For agents:** Consult this document before implementing any crosscutting concern. If you establish a new pattern, document it here so other code follows the same approach.

${concepts}`,
  };
}
