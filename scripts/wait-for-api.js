const apiPort = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
const healthUrl = `http://127.0.0.1:${apiPort}/api/health`;
const deadline = Date.now() + 60_000;
let lastResult = "no response";

while (Date.now() < deadline) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_000) });
    if (response.ok) {
      console.log(`API is ready at ${healthUrl}; starting Vite.`);
      process.exit(0);
    }
    lastResult = `health check returned HTTP ${response.status}`;
  } catch (error) {
    lastResult = error instanceof Error ? error.message : String(error);
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
}

console.error(`API did not become healthy at ${healthUrl} within 60 seconds: ${lastResult}`);
process.exit(1);
