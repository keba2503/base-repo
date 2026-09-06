---
status: accepted
date: 2026-09-06
---

# 0013 The remote address trusts the platform header first

## Context

`remoteAddressOf` derives the caller's address from `x-forwarded-for` or `x-real-ip` to key the anonymous rate limit bucket and to pass a remote address to Turnstile. Both headers are set by whatever reverse proxy sits in front of the process. If a request reaches the Next.js server directly, or through a proxy that forwards client supplied headers verbatim, the caller sets `x-forwarded-for` itself and picks its own rate limit bucket, defeating the anonymous limiter.

The production deployment target for this repository is Vercel. Vercel's edge network sets `x-vercel-forwarded-for` to the connecting client's address on every request it proxies to the function, overwriting any value the client sent for that specific header. `x-forwarded-for` and `x-real-ip` remain useful signals for local development, self-hosting, or a deployment fronted by a different proxy, but they carry no guarantee.

## Decision

`remoteAddressOf` reads `x-vercel-forwarded-for` first. `x-forwarded-for` and `x-real-ip` stay as fallbacks, in that order, for environments that are not Vercel.

This is a trust boundary, not a validation rule: nothing in this codebase checks how many proxies sit in front of a request or which ones are trusted. Deploying behind an additional untrusted proxy in front of Vercel, or exposing the function directly outside Vercel without a proxy that sets one of these headers itself, reopens the spoofing gap the fallback headers already carried.

## Consequences

- On Vercel, the anonymous rate limit bucket and the address sent to Turnstile key on the address Vercel observed, not one a client can choose.
- Off Vercel, behaviour is unchanged: the caller is trusted to the same degree it always was, which remains a real gap worth closing before that kind of deployment ships.
- A future deployment topology that adds an untrusted hop in front of Vercel, or removes Vercel from the path, must revisit this file and this record instead of assuming the existing header order still holds.
