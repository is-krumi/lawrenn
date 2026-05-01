const SENTRY_DSN = Deno.env.get("SENTRY_DSN") ?? "";

export async function captureException(
  err: Error,
  context: Record<string, any> = {}
): Promise<void> {
  if (!SENTRY_DSN) return;

  try {
    // Parse DSN
    const dsn = new URL(SENTRY_DSN);
    const projectId = dsn.pathname.replace("/", "");
    const sentryUrl = `${dsn.protocol}//${dsn.host}/api/${projectId}/envelope/`;
    const publicKey = dsn.username;

    const envelope = [
      JSON.stringify({ dsn: SENTRY_DSN, sdk: { name: "sentry.deno", version: "1.0.0" } }),
      JSON.stringify({ type: "event" }),
      JSON.stringify({
        event_id: crypto.randomUUID().replace(/-/g, ""),
        timestamp: new Date().toISOString(),
        platform: "node",
        level: "error",
        exception: {
          values: [{
            type:       err.name,
            value:      err.message,
            stacktrace: { frames: parseStack(err.stack ?? "") },
          }],
        },
        extra: context,
        tags: { runtime: "deno-edge-function" },
      }),
    ].join("\n");

    await fetch(sentryUrl, {
      method:  "POST",
      headers: {
        "Content-Type":   "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}`,
      },
      body: envelope,
    });
  } catch {
    // Never let Sentry errors break the function
  }
}

function parseStack(stack: string): any[] {
  return stack.split("\n").slice(1).map(line => {
    const match = line.trim().match(/at (.+) \((.+):(\d+):(\d+)\)/);
    if (match) {
      return {
        function: match[1],
        filename: match[2],
        lineno:   parseInt(match[3]),
        colno:    parseInt(match[4]),
        in_app:   true,
      };
    }
    return { filename: line.trim(), in_app: true };
  }).filter(Boolean).reverse();
}