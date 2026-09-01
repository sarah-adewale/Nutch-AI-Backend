# ADR 001 — Encryption at rest

**Status:** accepted · **Date:** 2026-08-31

## Context

The non-functional requirements state that all user data — chat, files and API
keys — must be encrypted. The chat feature separately requires full-text search
over message content, and the current implementation uses a SQL `contains`
query.

These two requirements are in direct conflict. A column encrypted in the
application cannot be searched by the database: ciphertext does not match on
substrings, so `WHERE content ILIKE '%fibonacci%'` returns nothing regardless of
what the plaintext said. Satisfying both literally would mean either decrypting
every message on every search — unbounded work per query, growing with a user's
whole history — or adopting searchable encryption, which is a much larger piece
of work than this product currently justifies.

## Decision

Encryption is applied at the layer where it does not defeat a feature:

| Data | Protection | Why |
| --- | --- | --- |
| BYOK API keys | **AES-256-GCM, column level** | Highest value to an attacker, never queried, only ever read by exact key. |
| File contents | **AES-256-GCM, column level and in S3** | Never searched, so nothing is lost by encrypting. |
| Message content | **Storage level** (encrypted volume / RDS encryption) | Must remain searchable; storage-level encryption protects the disk and backups without breaking queries. |
| Everything else | **Storage level** | Same reasoning. |

Transport is TLS throughout, which is a deployment concern rather than an
application one.

## Consequences

- An attacker with a stolen database dump gets no API keys and no file bodies,
  but does get message text. Storage-level encryption is what protects that, so
  the production database and its backups must have it enabled — this is a
  deployment requirement, not an optional hardening step.
- `ENCRYPTION_KEY` becomes load-bearing for file reads as well as BYOK. Rotating
  it makes existing files unreadable; the ciphertext envelope is versioned
  (`v1.…`) so a future rotation can re-encrypt in place rather than guess.
- If message search later moves to a dedicated search index, that index inherits
  the same exposure and needs the same treatment.

## Alternatives considered

**Encrypt messages and search by decrypting in the application.** Rejected: cost
grows with history size, and the PRD promises unlimited history to signed-in
users, so the worst case is unbounded.

**Deterministic or order-preserving encryption to keep queries working.**
Rejected: both leak substantially — equal plaintexts produce equal ciphertexts —
and would give the appearance of protection rather than the substance.
