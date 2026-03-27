import tanstack from "@tanstack/react-start/server-entry";
import { handleCronRefresh, handleDiscoveryCron } from "./server/api/cron";

export default {
  fetch: tanstack.fetch,
  async scheduled(
    event: ScheduledEvent,
    env: { CRON_SECRET: string },
    ctx: ExecutionContext
  ) {
    const makeReq = (path: string) =>
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });

    if (event.cron === "0 3 * * *") {
      ctx.waitUntil(handleCronRefresh(makeReq("/api/cron/refresh")));
    } else if (event.cron === "0 4 * * *") {
      ctx.waitUntil(handleDiscoveryCron(makeReq("/api/cron/discovery")));
    }
  },
};
