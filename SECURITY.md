# Security

What Relay protects, how, and where the limits are. Every control below has an automated test (`node scripts/demo-check.mjs`, section "Attack resistance", and `npm test`).

## What we protect

| Asset | Threat | Control |
| --- | --- | --- |
| Accounts | Password guessing | bcrypt (cost 12); account locks for 15 minutes after 5 failures; per-network limit of 50 attempts per 10 minutes; constant-time response for unknown emails |
| Sessions | Stolen cookie | HS256-signed, HTTP-only, SameSite=Lax; `__Host-` prefixed and Secure over HTTPS. Signing out bumps a server-side version, so every earlier token stops working |
| Case data | Reading or changing someone else's case | Role and ownership checked on every API route on the server. One shared rule (`visibleCasesWhere`) decides visibility for lists and single cases. Hidden cases return 404, not 403 |
| Case data | Cross-site request forgery | SameSite cookies plus an Origin check on every state-changing request |
| History | Quiet edits after the fact | Every change appends a SHA-256 hash-chained entry in the same transaction. Verification recomputes the chain from raw rows and names the first broken entry; the head hash stored on the case catches deleted tail entries |
| Handoffs | "Nobody told me" | The context package is frozen and hashed at submission; acceptance must quote that hash |
| Documents | Malware disguised as a PDF | MIME allowlist, file-signature check against the claimed type, 10 MB cap, random storage keys, SHA-256 re-verified on every download, served as attachment with `nosniff` |
| Browser | XSS, clickjacking | React escaping, Content-Security-Policy, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, strict referrer policy, no `X-Powered-By` |
| Navigation | Open redirect after sign-in | Only same-site relative paths are followed (`/\evil.com` and `//evil.com` rejected; unit-tested) |

## Known limits

- **The hash chain detects tampering; it does not prevent it.** Someone with database write access could rewrite an entry and every entry after it, and update the stored head. Closing that needs an anchor outside the database: publish the head hash daily to an append-only store, or have an external key countersign it.
- **The per-network rate limit lives in process memory.** On serverless hosting each instance counts separately. The per-account lockout is stored in the database and is the main control.
- **`'unsafe-inline'` scripts are allowed** because Next.js injects inline bootstrap scripts. A nonce-based policy would remove that.
- **Single organisation.** There is no tenant separation; teams are a field, not a boundary.
- **Demo credentials are public.** `relay-demo` must never be used outside a demo database.
