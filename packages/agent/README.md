# @ronnakamoto/warrant

Agent CLI. Ready and act on this machine. Never print keys.

Use a JS runner already on PATH. Do not assume pnpm.

```bash
npm exec --yes -- @ronnakamoto/warrant ready
WARRANT_BEARER='<the bearer from Copy>' npm exec --yes -- @ronnakamoto/warrant act --url https://warrant-beta.vercel.app/api/agent/memo --body '{"text":"hi"}'
```

`bunx` or `pnpm dlx` of the same package is fine if that runner is already there.

Show the human http://127.0.0.1:17879/fund before you act. Do not skip that page.
