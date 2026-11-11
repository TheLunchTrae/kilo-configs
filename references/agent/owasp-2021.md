# OWASP Top 10 (2021) — Reference

Detailed category notes for `security-reviewer`. Its agent prompt carries the short checklist.
Use this reference for concrete patterns and remediation examples when a finding needs deeper context.

## A01 Broken Access Control

**What to look for**
- Routes/handlers without an auth check (`requireAuth`, `@authenticated`, middleware on the router).
- IDOR: object IDs in URLs/bodies used to fetch records without verifying ownership.
- Forced browsing: admin-only paths reachable without role check.
- CORS with `Access-Control-Allow-Origin: *` on credentialed endpoints, or reflecting `Origin` without an allowlist.
- Default-permissive policies (e.g., RLS disabled, "deny by default" missing).

**Fix recipe**
- Centralize authz in middleware; assert ownership inside handlers (`where: { id, userId: req.user.id }`).
- Enforce CORS origin allowlists; never reflect `Origin` blindly when `credentials: 'include'`.

## A02 Cryptographic Failures

**What to look for**
- HTTP (not HTTPS) for anything carrying credentials/PII.
- Secrets in source/config (commit history too — `git log -p | grep`-able).
- Weak password hashing: MD5, SHA1, unsalted SHA256. Look for `crypto.createHash('sha256')` over user input.
- TLS pinned to deprecated versions (TLS 1.0/1.1).
- PII written to logs unredacted.

**Fix recipe**
- Passwords: argon2id (preferred) or bcrypt cost ≥ 12. Never SHA-anything raw.
- Secrets: env vars + secret manager (Vault, AWS SM, 1Password CLI). Never `.env` checked in.

## A03 Injection

**What to look for**
- String-built SQL: `\`SELECT * FROM users WHERE id = ${id}\``.
- `eval`, `Function(...)`, `vm.runInNewContext(userInput)`.
- `child_process.exec(\`cmd ${input}\`)` — use `execFile` with arg array.
- `innerHTML = userInput`, `dangerouslySetInnerHTML={{__html: userInput}}`.
- NoSQL: `Model.find(req.body)` (operator injection — `{$ne: null}`).
- Template injection (Jinja, Handlebars): user input rendered as a template.

**Fix recipe**
- SQL: parameterized queries / prepared statements / ORM bindings.
- Shell: `execFile(cmd, [arg1, arg2])`, never string-concatenated.
- HTML: framework auto-escape + `textContent` for innerHTML; `DOMPurify.sanitize()` only when HTML is required.

## A04 Insecure Design

**What to look for**
- Missing rate limits on public, expensive, or abuse-prone endpoints (login, password reset, signup, AI inference).
- No threat model for new feature surfaces (file upload, webhook receiver, payment flow).
- Trust boundaries blurred — internal services exposed publicly without explicit gateway.

**Fix recipe**
- Rate limit at the edge (CDN/WAF) and at the app (express-rate-limit, `rack-attack`, etc.).
- Document trust boundaries explicitly; deny-by-default at every boundary.

A04 often shows up as questions rather than findings on a diff-only review — surface them as such.

## A05 Security Misconfiguration

**What to look for**
- Debug mode in production (`DEBUG=true`, `app.set('env', 'development')`).
- Default credentials still in place.
- Missing security headers (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`).
- XML parsers with external entity resolution enabled (XXE — formerly its own category).
- Verbose error pages leaking stack traces / SQL / paths to clients.

**Fix recipe**
- Use `helmet` (Express) / framework equivalent for default-good headers.
- XML: configure parser with `noent: false` / disable external entities.
- Error handlers: log internally, return generic message to client.

## A06 Vulnerable & Outdated Components

**What to look for**
- Lockfile pinning known-CVE versions of high-blast-radius packages (auth libs, web frameworks, image/parser libs).
- No SCA (Software Composition Analysis) in CI.
- Direct dependencies from sketchy sources (random gist URLs, abandoned packages).

**Fix recipe**
- `npm audit --audit-level=high`, `pip-audit`, `bundler-audit`, `cargo audit` — or Snyk/Dependabot in CI.
- Pin and update on a cadence; treat security advisories as priority.

A06 is often best deferred to a CI job; the reviewer flags suspicious versions but doesn't run audits inline.

## A07 Identification & Authentication Failures

**What to look for**
- Plaintext password storage or comparison (`password === user.password`).
- Predictable password reset tokens (using `Math.random`, `Date.now`).
- Long-lived sessions without rotation; sessions not invalidated on password change.
- No brute-force protection on login (per-account lockout, IP throttle).
- MFA optional or absent for admin/privileged users.

**Fix recipe**
- `bcrypt.compare()` / `argon2.verify()`, never `===`.
- Tokens via `crypto.randomBytes(32).toString('hex')`.
- Rotate session ID on login + privilege change; expire idle sessions.

## A08 Software & Data Integrity Failures

**What to look for**
- Deserialization of untrusted input: `pickle.loads(user_data)`, `Marshal.load(params[:x])`, Java `ObjectInputStream`.
- CI/CD pulling unsigned artifacts, dependencies from untrusted registries.
- Auto-update mechanisms that fetch + execute without signature verification.
- `npm install` from a tarball URL the user controls.

**Fix recipe**
- Never deserialize untrusted input into language objects; use JSON / a schema-validated format.
- Verify package signatures (`npm install --signature-policy=strict`, Sigstore for OCI images).

## A09 Security Logging & Monitoring Failures

**What to look for**
- No log of auth failures, privilege changes, payment events, admin actions.
- Logs containing passwords, tokens, full credit-card numbers (PCI scope).
- No alerts wired to security events; logs go to stdout and nothing reads them.

**Fix recipe**
- Structured logs for security events with a stable schema; ship to a SIEM or at minimum a queryable store.
- Redact at log-call site, not after; assume any log line will be exfiltrated.

A09 is hard to evaluate on a diff alone — surface as a question when the change adds new auth/privilege paths.

## A10 SSRF (Server-Side Request Forgery)

**What to look for**
- Outbound HTTP with a user-controlled URL: `fetch(req.body.url)`, `requests.get(image_url)`, image-resize/preview/thumbnail services.
- No allowlist of permitted hosts.
- No block on internal/private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`).
- Webhook URLs accepted without validation.

**Fix recipe**
- Allowlist hosts (or domains) the app may fetch from; reject everything else.
- Block private and link-local CIDRs; specifically block `169.254.169.254` (cloud metadata endpoint).
- Use a forward proxy with egress filtering for production.

---

## Cross-cutting: severity calibration

| Pattern | Default severity | Notes |
|---------|------------------|-------|
| Hardcoded production secret in committed source | CRITICAL | Always block. Recommend rotation. |
| Test-only credential in `*.test.*` or fixture file | LOW | Verify it's actually scoped to tests. |
| `.env.example` / `.env.sample` content | NOT A FINDING | Examples, not real secrets. |
| Public API key flagged as "hardcoded" | LOW or NOT A FINDING | Verify key is genuinely public-by-design (e.g., publishable Stripe key, public Algolia key). |
| MD5/SHA1 used for password hashing | CRITICAL | Always block. |
| MD5/SHA1 used for non-security checksum (file dedupe, cache key) | NOT A FINDING | Acceptable when collision resistance isn't required. |
