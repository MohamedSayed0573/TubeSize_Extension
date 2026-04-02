---
name: tubesize-trpc
description: Use this skill when working on TubeSize's tRPC integration between the `tubesize` extension frontend and the `api` Fastify backend, including client setup, links, server wiring, validation, and error handling.
---

Use this skill for tRPC work in this repository.

## Scope

- Extension client code lives in `tubesize/`
- API server code lives in `api/`
- The backend uses Fastify with `@trpc/server`
- The frontend uses `@trpc/client`

## Use This Skill When

- Wiring the extension frontend to the tRPC API client
- Changing client links, batching, headers, or transport behavior
- Editing the Fastify tRPC server setup in `api/src/server.ts` or `api/src/trpc.ts`
- Adding or changing validation for API procedures and schemas
- Changing API error handling or tRPC error responses

## Repo Notes

- Prefer the existing Fastify adapter patterns in `api/src/server.ts`
- Keep validation close to procedures and schema files in `api/src/schema/`
- Keep client transport changes aligned with the extension runtime constraints
- Do not introduce new abstractions unless the existing code clearly needs them

## Reference Skills

- Client setup reference: `node_modules/@trpc/client/skills/client-setup/SKILL.md`
- Client links reference: `node_modules/@trpc/client/skills/links/SKILL.md`
- For server setup, validators, or error handling, locate the current package path with:
  `npx @tanstack/intent@latest list | grep -E 'server-setup|validators|error-handling'`
