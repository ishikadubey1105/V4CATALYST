// Same-site relative paths only: rejects "//evil.com" and "/\evil.com", which
// browsers treat as protocol-relative URLs. Shared by the client and the server.
export function safeNext(next: string | null | undefined): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/";
}
