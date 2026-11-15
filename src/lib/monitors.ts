import { createHmac, timingSafeEqual } from "node:crypto";
import { isOfficialTenderUrl } from "@/lib/procurement-sources";
import type { TenderMonitorView } from "@/lib/types";

type AnyRecord = Record<string, unknown>;
type MonitorTokenPayload = {
  v: 1;
  id: string;
  tenderId: string;
  endsAt: string;
  frequencyHours: 6 | 24;
  createdAt: string;
};

const CONTEXT_MONITORS_URL = "https://api.context.dev/v1/monitors";

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function apiKey(): string {
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) throw new Error("Context.dev is not configured. Add CONTEXT_DEV_API_KEY to the server environment.");
  return key;
}

function validTenderUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!isOfficialTenderUrl(value)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function monitorEndpoint(id: string, suffix = ""): string {
  return `${CONTEXT_MONITORS_URL}/${encodeURIComponent(id)}${suffix}`;
}

async function contextRequest(url: string, init: RequestInit = {}, timeoutMs = 25_000): Promise<AnyRecord> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const responseText = await response.text();
  let parsed: unknown = {};
  try { parsed = JSON.parse(responseText); } catch { /* Use the request status and ID below. */ }
  const body = asRecord(parsed);
  if (!response.ok) {
    const messages: string[] = [];
    const requestIds: string[] = [];
    const codes: string[] = [];
    const collect = (value: unknown, depth = 0) => {
      if (depth > 8 || value == null) return;
      if (Array.isArray(value)) { value.forEach((item) => collect(item, depth + 1)); return; }
      if (typeof value !== "object") return;
      const record = asRecord(value);
      for (const key of ["message", "detail", "reason", "description"]) {
        const message = asString(record[key]);
        if (message) messages.push(message);
      }
      const requestId = asString(record.request_id);
      if (requestId) requestIds.push(requestId);
      const code = asString(record.error_code) || asString(record.code);
      if (code) codes.push(code);
      Object.values(record).forEach((item) => {
        if (item && typeof item === "object") collect(item, depth + 1);
      });
    };
    collect(body);
    const message = (messages.at(-1) || `Context.dev monitor request failed (${response.status}).`)
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/(?:sk|ctx)_[A-Za-z0-9_-]{12,}/g, "[redacted]");
    const code = codes[0];
    const requestId = requestIds[0] || asString(response.headers.get("x-request-id"));
    throw new Error(`${message}${code ? ` (${code})` : ""}${requestId ? ` Request ID: ${requestId}` : ""}`.slice(0, 400));
  }
  return body;
}

function unwrapMonitor(body: AnyRecord): AnyRecord {
  const data = asRecord(body.data);
  return asRecord(body.monitor ?? (data.id ? data : body));
}

function signPayload(encoded: string): string {
  const stableSecret = asString(process.env.MONITOR_TOKEN_SECRET);
  return createHmac("sha256", stableSecret || apiKey()).update(encoded).digest("base64url");
}

export function encodeMonitorToken(payload: MonitorTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signPayload(encoded)}`;
}

export function decodeMonitorToken(token: string): MonitorTokenPayload {
  if (token.length > 2_000) throw new Error("Monitor token is invalid.");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Monitor token is invalid.");
  const [encoded, signature] = parts;
  if (!encoded || !signature) throw new Error("Monitor token is invalid.");
  const received = Buffer.from(signature, "base64url");
  const signingKeys = [...new Set([asString(process.env.MONITOR_TOKEN_SECRET), asString(process.env.CONTEXT_DEV_API_KEY)].filter(Boolean))];
  const validSignature = signingKeys.some((key) => {
    const expected = createHmac("sha256", key).update(encoded).digest();
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
  if (!validSignature) throw new Error("Monitor token is invalid.");
  let payload: unknown;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw new Error("Monitor token is invalid."); }
  const value = asRecord(payload);
  const endTime = Date.parse(asString(value.endsAt));
  const createdTime = Date.parse(asString(value.createdAt));
  if (value.v !== 1 || !/^mon_[A-Za-z0-9_-]{4,120}$/.test(asString(value.id)) || !asString(value.tenderId) || !Number.isFinite(endTime) || !Number.isFinite(createdTime) || Date.now() - endTime > 366 * 86_400_000) {
    throw new Error("Monitor token is invalid or expired.");
  }
  if (value.frequencyHours !== 6 && value.frequencyHours !== 24) throw new Error("Monitor token is invalid.");
  return {
    v: 1,
    id: asString(value.id),
    tenderId: asString(value.tenderId),
    endsAt: new Date(endTime).toISOString(),
    frequencyHours: value.frequencyHours,
    createdAt: new Date(createdTime).toISOString(),
  };
}

function publicBaseUrl(): string | null {
  const configured = asString(process.env.APP_BASE_URL);
  const deployment = asString(process.env.VERCEL_URL);
  const candidate = configured || (deployment ? `https://${deployment}` : "");
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export async function createTenderMonitor(input: {
  tenderId: string;
  title: string;
  url: string;
  endsAt: string;
  frequencyHours: 6 | 24;
}): Promise<TenderMonitorView> {
  const tenderUrl = validTenderUrl(input.url);
  const endTime = Date.parse(input.endsAt);
  if (!tenderUrl) throw new Error("Monitoring is limited to HTTPS tender pages from registered public procurement sources.");
  if (!input.tenderId || input.tenderId.length > 100 || !input.title.trim() || input.title.length > 300) throw new Error("Tender details are missing or too long.");
  if (!Number.isFinite(endTime) || endTime <= Date.now() || endTime > Date.now() + 180 * 86_400_000) throw new Error("Choose an end date between tomorrow and six months from now.");
  if (input.frequencyHours !== 6 && input.frequencyHours !== 24) throw new Error("Choose a 6-hour or daily monitoring interval.");

  const baseUrl = publicBaseUrl();
  const created = await contextRequest(CONTEXT_MONITORS_URL, {
    method: "POST",
    body: JSON.stringify({
      mode: "web",
      name: `Tender: ${input.title.trim()}`.slice(0, 180),
      target: {
        type: "page",
        url: tenderUrl,
        instructions: "Track substantive changes to this public procurement notice, including its deadline, scope, eligibility and qualification requirements, documents, clarifications, amendments, cancellation, or award status. Ignore navigation, counters, timestamps, and unrelated page changes.",
        normalize_whitespace: true,
      },
      change_detection: { type: "semantic" },
      schedule: { type: "interval", frequency: input.frequencyHours === 6 ? 6 : 1, unit: input.frequencyHours === 6 ? "hours" : "days" },
      tags: ["tender-fit-radar", `end-${Math.floor(endTime / 1000)}`],
    }),
  });
  const monitor = unwrapMonitor(created);
  const id = asString(monitor.id);
  if (!id) throw new Error("Context.dev created no monitor ID.");
  const createdAt = asString(monitor.created_at) || new Date().toISOString();
  const payload: MonitorTokenPayload = {
    v: 1, id, tenderId: input.tenderId,
    endsAt: new Date(endTime).toISOString(), frequencyHours: input.frequencyHours, createdAt,
  };
  const token = encodeMonitorToken(payload);

  // Replace the setup URL once its signed capability token is available.
  if (baseUrl) {
    try {
      const updated = await contextRequest(monitorEndpoint(id), {
        method: "PATCH",
        body: JSON.stringify({
          webhook: {
            url: `${baseUrl}/api/monitors/webhook/${token}`,
            events: ["change.detected", "run.completed"],
            retry: {},
          },
        }),
      });
      Object.assign(monitor, unwrapMonitor(updated));
    } catch (error) {
      await contextRequest(monitorEndpoint(id), { method: "PATCH", body: JSON.stringify({ status: "paused" }) }).catch(() => undefined);
      throw error;
    }
  }
  return monitorView(token, payload, monitor, []);
}

function safeChanges(value: unknown, expectedUrl: string): TenderMonitorView["changes"] {
  const rows = Array.isArray(asRecord(value).data) ? asRecord(value).data as unknown[] : [];
  return rows.flatMap((item) => {
    const row = asRecord(item);
    const url = validTenderUrl(asString(row.url)) || expectedUrl;
    const id = asString(row.id);
    const detectedAt = asString(row.detected_at);
    if (!id || !detectedAt) return [];
    return [{
      id,
      title: asString(row.title).slice(0, 180) || "Tender page changed",
      summary: asString(row.summary).slice(0, 1_000),
      detectedAt,
      url,
      ...(asString(row.importance) ? { importance: asString(row.importance).slice(0, 40) } : {}),
    }];
  });
}

function monitorView(token: string, payload: MonitorTokenPayload, monitor: AnyRecord, changes: TenderMonitorView["changes"]): TenderMonitorView {
  const webhook = asRecord(monitor.webhook);
  const lastError = asRecord(monitor.last_error);
  const status = asString(monitor.status);
  const schedule = asRecord(monitor.schedule);
  const targetUrl = validTenderUrl(asString(asRecord(monitor.target).url));
  if (!targetUrl) throw new Error("Context.dev returned a monitor without a registered public tender URL.");
  const scheduleHours = schedule.unit === "hours" && Number(schedule.frequency) === 6 ? 6
    : schedule.unit === "days" && Number(schedule.frequency) === 1 ? 24
      : payload.frequencyHours;
  const title = asString(monitor.name).replace(/^Tender:\s*/i, "").slice(0, 300) || "Tender notice";
  return {
    token,
    tenderId: payload.tenderId,
    tenderTitle: title,
    tenderUrl: targetUrl,
    endsAt: payload.endsAt,
    frequencyHours: scheduleHours,
    status: status === "active" ? "active" : status === "paused" ? "paused" : "failed",
    createdAt: asString(monitor.created_at) || payload.createdAt,
    lastRunAt: asString(monitor.last_run_at) || null,
    nextRunAt: asString(monitor.next_run_at) || null,
    lastError: asString(lastError.message) || null,
    webhookConnected: Boolean(asString(webhook.url)),
    changes,
  };
}

export async function retrieveTenderMonitor(token: string): Promise<TenderMonitorView> {
  const payload = decodeMonitorToken(token);
  let monitor = unwrapMonitor(await contextRequest(monitorEndpoint(payload.id)));
  if (asString(monitor.status) !== "paused" && Date.now() >= Date.parse(payload.endsAt)) {
    monitor = unwrapMonitor(await contextRequest(monitorEndpoint(payload.id), {
      method: "PATCH", body: JSON.stringify({ status: "paused" }),
    }));
  }
  const changes = await contextRequest(monitorEndpoint(payload.id, "/changes"));
  const targetUrl = validTenderUrl(asString(asRecord(monitor.target).url));
  if (!targetUrl) throw new Error("Context.dev returned a monitor without a registered public tender URL.");
  return monitorView(token, payload, monitor, safeChanges(changes, targetUrl));
}

export async function pauseTenderMonitor(token: string): Promise<TenderMonitorView> {
  const payload = decodeMonitorToken(token);
  const monitor = unwrapMonitor(await contextRequest(monitorEndpoint(payload.id), {
    method: "PATCH", body: JSON.stringify({ status: "paused" }),
  }));
  const changes = await contextRequest(monitorEndpoint(payload.id, "/changes"));
  const targetUrl = validTenderUrl(asString(asRecord(monitor.target).url));
  if (!targetUrl) throw new Error("Context.dev returned a monitor without a registered public tender URL.");
  return monitorView(token, payload, monitor, safeChanges(changes, targetUrl));
}

export async function pauseExpiredMonitorForWebhook(token: string, rawBody: Buffer, headers: Headers): Promise<"accepted" | "unauthorized" | "bad_request"> {
  const payload = decodeMonitorToken(token);
  const rawMonitor = await contextRequest(monitorEndpoint(payload.id), {}, 6_000);
  const monitor = unwrapMonitor(rawMonitor);
  const secret = asString(asRecord(monitor.webhook).secret);
  if (!secret) throw new Error("Monitor webhook secret is unavailable.");

  const signature = headers.get("X-Context-Signature") || "";
  const parts = new Map<string, string>();
  for (const part of signature.split(",")) {
    const [name, value, ...extra] = part.trim().split("=");
    if (!name || !value || extra.length || parts.has(name)) return "unauthorized";
    parts.set(name, value);
  }
  const timestamp = parts.get("t") || "";
  const digest = parts.get("v1") || "";
  if (!/^\d{1,12}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(digest) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return "unauthorized";
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest();
  const received = Buffer.from(digest, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return "unauthorized";

  let event: AnyRecord;
  try { event = asRecord(JSON.parse(rawBody.toString("utf8"))); } catch { throw new Error("Webhook event body is invalid JSON."); }
  const eventName = asString(event.event);
  const eventId = asString(event.id);
  if (!eventId || eventId !== headers.get("X-Context-Id") || !eventName || eventName !== headers.get("X-Context-Event")) return "bad_request";
  const data = asRecord(event.data);
  const run = asRecord(data.run);
  const change = asRecord(data.change);
  const eventMonitorId = asString(run.monitor_id) || asString(change.monitor_id);
  if (eventMonitorId !== payload.id) return "bad_request";
  if (Date.now() < Date.parse(payload.endsAt) || asString(monitor.status) === "paused") return "accepted";
  await contextRequest(monitorEndpoint(payload.id), {
    method: "PATCH", body: JSON.stringify({ status: "paused" }),
  }, 6_000);
  return "accepted";
}
