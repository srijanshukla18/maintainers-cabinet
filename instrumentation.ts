// Next.js instrumentation — runs once when the server starts.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServer } = await import("./lib/cron/startup");
    initServer();
  }
}
