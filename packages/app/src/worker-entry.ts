import tanstack from "@tanstack/react-start/server-entry";
import { handleCronRefresh } from "./server/api/cron";

export default {
  fetch: tanstack.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: { CRON_SECRET: string },
    ctx: ExecutionContext
  ) {
    const request = new Request("http://localhost/api/cron/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
    ctx.waitUntil(handleCronRefresh(request));
  },
};
