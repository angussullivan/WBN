# Deploying the Well Beyond Now chatbot backend

This is a one-time setup on Cloudflare's free tier. No coding, no local
tools — everything happens in Cloudflare's dashboard.

## 1. Create a Cloudflare account (skip if you have one)

Go to `dash.cloudflare.com` and sign up for free.

## 2. Create the Worker

1. In the dashboard sidebar, go to **Workers & Pages**.
2. Click **Create** -> **Workers** -> **Create Worker**.
3. Give it a name, e.g. `wbn-chatbot`.
4. Click **Deploy** to create it with the default placeholder code (you'll replace it next).

## 3. Paste in the real code

1. Click **Edit code** (opens the Quick Edit browser editor).
2. Delete everything in the editor.
3. Paste in the entire contents of `worker/chatbot-worker.js` from this repo.
4. Click **Save and deploy**.

## 4. Add your Anthropic API key as a secret

1. Go to the Worker's **Settings** tab -> **Variables and Secrets**.
2. Click **Add** -> choose **Secret** (not plain text — this keeps it encrypted and hidden).
3. Name: `ANTHROPIC_API_KEY`
4. Value: your Anthropic API key (starts with `sk-ant-...`) — get one from `console.anthropic.com` if you don't have one yet, under **API Keys**.
5. Save.

## 5. (Recommended) Add rate-limiting protection

This caps how many messages one visitor can send per minute, so the endpoint can't be abused to run up your bill.

1. In the dashboard sidebar, go to **Storage & Databases** -> **KV**.
2. Click **Create namespace**, name it `wbn-chat-ratelimit`, create it.
3. Go back to your Worker -> **Settings** -> **Bindings** -> **Add binding** -> **KV Namespace**.
4. Variable name: `RATE_LIMIT_KV` (must match exactly).
5. Select the `wbn-chat-ratelimit` namespace you just created.
6. Save.

If you skip this step, the chatbot still works — it just has no rate limiting, which is fine to start with on low traffic but worth adding before the site gets busy.

## 6. Grab the Worker's URL

On the Worker's overview page, you'll see a URL like:

```
https://wbn-chatbot.<your-subdomain>.workers.dev
```

Copy it.

## 7. Send me that URL

I'll paste it into `js/chatbot-config.js` (`CHATBOT_WORKER_URL`) and push — the chat bubble will appear on the site automatically once that's set (it stays hidden until then).

## Cost expectations

- Cloudflare Workers: free tier covers 100,000 requests/day — you won't come close to this.
- Anthropic API (Claude Sonnet 5): pay-per-use, roughly $2 per million input tokens / $10 per million output tokens. A typical short chat exchange costs a fraction of a cent. Realistic early-stage traffic (a handful of chats a day) should run well under a dollar a month; monitor actual usage at `console.anthropic.com` under **Usage**.
