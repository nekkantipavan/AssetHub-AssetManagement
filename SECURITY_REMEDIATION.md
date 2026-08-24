# Security Assessment — Remediation Status

Covers the 26-item Application Security Assessment. Code fixes are in
`server/index.js`, `server/emailService.js`, and the frontend `dist/`.
Items #9, #12, #15, #17, #20, #23 are server/IIS-level — see the bottom section.

## Fixed in code (deploy `server/index.js`, `server/emailService.js`, rebuilt `dist/`)

| # | Finding | Fix |
|---|---------|-----|
| 1 | Approve by self via email parameter tampering | Initiator's email can't be selected as an approver; tokens no longer exposed (see #2) |
| 2 | Approval token exposed in API response | Global response sanitizer strips `approval_token`/`approval_token_expires`/`password_hash` from **every** JSON response |
| 3 | JWT valid after logout | `token_invalid_before` on users; `POST /api/auth/logout` sets it; `authMiddleware` rejects older tokens; also set on password change/reset |
| 4 | Weak password policy | `passwordPolicyError()` — ≥8 chars, upper+lower+digit+symbol — on change-password & reset (front + back) |
| 5 | Weak password on user creation | Same policy enforced; removed the `changeme123` default and the client-supplied `password_hash` passthrough |
| 6 | External emails accepted for approval | `emailError()` domain allowlist (`ALLOWED_EMAIL_DOMAINS`, defaults to SMTP_FROM domain) on Email Masters + both approval workflows |
| 7 | Unlimited login attempts | In-memory rate limiter: 8 login attempts / 15 min per IP+username → 429 |
| 8 | No rate limiting on admin ops / resend | 30 requests / 5 min limiter on resource creation + all approval-email resend endpoints |
| 10 | HTML injection in email templates | `esc()` HTML-escapes every user-supplied value in all email builders + the approve/reject result page |
| 11 | Arbitrary values for restricted asset fields | Asset-request items validated against Company Code / Cost Center masters + active plants |
| 13 | Excessive info in auth response | Dropped `employee_id` from the login response |
| 14 | Stack trace via JSON parse exception | Global Express error handler returns generic messages (no stack/paths); handles malformed JSON + oversized bodies |
| 16 | Stored XSS payload persisted | `stripTags()` removes markup from stored free-text (email-master name/dept, asset owner, material description, project, remarks, transfer notes); React + email escaping are the primary controls |
| 18 | X-XSS-Protection header missing | Added `X-XSS-Protection: 1; mode=block` |
| 19 | CSP header missing | Added (was done earlier) |
| 20 | HSTS missing | `Strict-Transport-Security` header added (takes effect once HTTPS is enabled — see below) |
| 21 | X-Content-Type-Options missing | Added `nosniff` |
| 22 | X-Frame-Options missing | Added `DENY` |
| 24 | Insufficient input validation | Addressed via the field-level validations above |
| 25 | Negative asset values accepted | Unit price and asset life reject negatives (assets route already rejected negative acquisition value) |
| 26 | Past expected return dates accepted | Transfer creation rejects a return date before today |

## Config to set on the production server's `.env` (optional but recommended)

```
# Restrict approver/email-master addresses to your org domain(s), comma-separated.
# If omitted, it defaults to the domain of SMTP_FROM_EMAIL (neolync.com).
ALLOWED_EMAIL_DOMAINS=neolync.com
```

## Server / IIS-level items — must be done on the production box (not code)

These are the remaining findings; they require Windows Server / IIS changes.

**#9 Insecure HTTP (no TLS), #12 Cleartext credentials, #20 HSTS effect** — enable HTTPS:
1. Obtain a TLS certificate (internal CA or a public cert if the host is reachable).
2. In IIS Manager → site → **Bindings**, add an **https** binding on 443 with the cert.
3. Add an inbound URL Rewrite rule to redirect all HTTP→HTTPS (or in `web.config`):
   ```xml
   <rule name="HTTP to HTTPS" stopProcessing="true">
     <match url="(.*)" />
     <conditions><add input="{HTTPS}" pattern="off" /></conditions>
     <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
   </rule>
   ```
   Once served over HTTPS, the HSTS header already emitted by the API/app takes effect and credentials are no longer sent in cleartext.

**#15 HTTP TRACE, #17 server name, #23 X-Powered-By** — already handled in `dist/web.config`
(`removeServerHeader="true"`, TRACE/TRACK denied, `X-Powered-By` removed) and in the Node app
(`app.disable('x-powered-by')`). Just deploy the rebuilt `dist/`.

**Disable TLS 1.0/1.1 + weak ciphers** (matches the earlier report's items) — use IIS Crypto
(nartac.com/Products/IISCrypto) → apply the "Best Practices" template → reboot.

## Deploy checklist
1. Copy `server/index.js` + `server/emailService.js` to production.
2. Copy the rebuilt `dist/` over the IIS site root.
3. (Optional) add `ALLOWED_EMAIL_DOMAINS` to production `.env`.
4. `pm2 restart assethub-api` — self-applies the `token_invalid_before` column.
5. Do the IIS/HTTPS steps above for #9/#12/#20.
6. Note: after deploy, all users must log in again (password/session changes), and any weak
   existing passwords keep working until changed — consider forcing a reset for weak ones.
