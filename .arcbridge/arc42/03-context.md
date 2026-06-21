---
section: context
schema_version: 1
---
# System Scope and Context

## Business Context

arcbridge interacts with the following external systems and actors:

| Neighbor | Description | Interface |
|----------|-------------|-----------|
| End User | Application user | Browser / HTTP |
| *External API* | *Describe external dependencies* | *REST / GraphQL* |

## Technical Context

```
[Browser] --HTTP/HTTPS--> [arcbridge] --API--> [External Services]
```

### Technology Stack

- **Framework:** Express / Fastify
- **Language:** TypeScript
- **Runtime:** Node.js
