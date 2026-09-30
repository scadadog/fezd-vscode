import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import { URL } from "url";
import { logLine } from "./log";
import type {
  AutomationProfile,
  CreateSessionRequest,
  ErrorEnvelope,
  ExportRequest,
  JobLogs,
  JobResult,
  JobStatus,
  ProjectUploadResult,
  SessionEventsPage,
  SessionStatus,
  VersionInfo,
  WhoAmI
} from "./types";
import { isTerminalJob, joinUrl, sleep } from "./util";

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly exitCode?: number
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export class FezdClient {
  constructor(
    readonly baseUrl: string,
    readonly token: string,
    readonly rejectUnauthorized: boolean
  ) {}

  async healthz(): Promise<void> {
    await this.request("GET", "/healthz", { auth: false });
  }

  async version(): Promise<VersionInfo> {
    return this.requestJson<VersionInfo>("GET", "/api/v1/version");
  }

  async whoami(): Promise<WhoAmI> {
    return this.requestJson<WhoAmI>("GET", "/api/v1/whoami");
  }

  async profile(): Promise<AutomationProfile> {
    return this.requestJson<AutomationProfile>("GET", "/api/v1/profile");
  }

  async uploadProject(filePath: string, fileName: string): Promise<ProjectUploadResult> {
    const stat = fs.statSync(filePath);
    const sha = await sha256File(filePath);
    logLine("info", `Uploading ${fileName} (${stat.size} bytes)...`);
    const body = fs.readFileSync(filePath);
    const result = await this.requestJson<ProjectUploadResult>("POST", "/api/v1/projects", {
      body,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Fezd-Sha256": sha,
        "X-Fezd-Filename": fileName
      }
    });
    if (!result.sha256 || result.sha256.toLowerCase() !== sha) {
      throw new GatewayError(
        `Upload integrity mismatch: local sha256=${sha}, server sha256=${result.sha256}.`
      );
    }
    logLine("info", `Upload verified: sha256=${result.sha256} (${result.size} bytes).`);
    return result;
  }

  async exportStu(projectId: string, appPassword?: string): Promise<{ jobId: string; result: JobResult }> {
    const req: ExportRequest = {
      projectId,
      saveStu: true,
      saveSta: false,
      build: true,
      appPassword: appPassword || undefined
    };
    const job = await this.requestJson<JobStatus>("POST", "/api/v1/export", {
      json: req
    });
    logLine("info", `Job ${job.id} (export) accepted.`);
    const result = await this.followJob(job.id);
    return { jobId: job.id, result };
  }

  async deploySession(create: CreateSessionRequest): Promise<{ sessionId: string; result: JobResult; artifacts: string[] }> {
    const session = await this.requestJson<SessionStatus>("POST", "/api/v1/sessions", {
      json: create
    });
    logLine(
      "info",
      `Session ${session.id} accepted (queue position ${session.queuePosition ?? 0}, depth ${session.queueDepth ?? 0}).`
    );
    const followed = await this.followSession(session.id);
    return { sessionId: session.id, result: followed.result, artifacts: followed.artifacts };
  }

  async downloadJobArtifact(jobId: string, name: string, destPath: string): Promise<void> {
    const buf = await this.requestBinary(
      "GET",
      `/api/v1/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(name)}`
    );
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
    logLine("info", `Saved artifact -> ${destPath}`);
  }

  async downloadSessionArtifact(sessionId: string, name: string, destPath: string): Promise<void> {
    const buf = await this.requestBinary(
      "GET",
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(name)}`
    );
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
    logLine("info", `Saved artifact -> ${destPath}`);
  }

  private async followJob(jobId: string): Promise<JobResult> {
    let cursor = 0;
    for (;;) {
      const logs = await this.requestJson<JobLogs>(
        "GET",
        `/api/v1/jobs/${encodeURIComponent(jobId)}/logs?after=${cursor}`
      );
      for (const e of logs.entries ?? []) {
        logLine(e.level ?? "info", e.message ?? "");
      }
      cursor = logs.nextCursor;
      if (logs.done) {
        break;
      }
      if (!logs.entries || logs.entries.length === 0) {
        await sleep(400);
      }
    }
    const status = await this.requestJson<JobStatus>(
      "GET",
      `/api/v1/jobs/${encodeURIComponent(jobId)}`
    );
    if (status.result) {
      return status.result;
    }
    if (isTerminalJob(status.phase) && (status.phase === 3 || status.phase === "Failed")) {
      return { exitCode: 1, success: false, message: "Job failed without a result." };
    }
    return status.result ?? { exitCode: 1, success: false, message: "Job finished without a result." };
  }

  private async followSession(sessionId: string): Promise<{ result: JobResult; artifacts: string[] }> {
    let cursor = 0;
    let completed: JobResult | undefined;
    for (;;) {
      const page = await this.requestJson<SessionEventsPage>(
        "GET",
        `/api/v1/sessions/${encodeURIComponent(sessionId)}/events?after=${cursor}`
      );
      for (const e of page.entries ?? []) {
        if (e.type === "log.line" && e.message) {
          logLine(e.level ?? "info", e.message);
        } else if ((e.type === "queue.updated" || e.type === "phase.changed") && e.message) {
          logLine("info", e.message);
        } else if (e.type === "session.completed") {
          const failed = e.phase === "Failed" || e.phase === "Cancelled";
          if (failed) {
            completed = {
              exitCode: e.exitCode ?? 1,
              success: false,
              message: e.message || `Session ${e.phase ?? "failed"}.`
            };
          }
        }
      }
      cursor = page.nextCursor;
      if (page.done) {
        break;
      }
      if (completed && !completed.success) {
        break;
      }
      await sleep(400);
    }

    const status = await this.requestJson<SessionStatus>(
      "GET",
      `/api/v1/sessions/${encodeURIComponent(sessionId)}`
    );
    const names: string[] = [];
    for (const a of status.artifacts ?? []) {
      if (a.name && !names.includes(a.name)) {
        names.push(a.name);
      }
    }
    const result =
      status.result ??
      completed ?? { exitCode: 1, success: false, message: "Session finished without a result." };
    if (result.artifacts) {
      for (const n of result.artifacts) {
        if (!names.includes(n)) {
          names.push(n);
        }
      }
    }
    return { result, artifacts: names };
  }

  private async requestJson<T>(
    method: string,
    path: string,
    opts?: { json?: unknown; body?: Buffer; headers?: Record<string, string>; auth?: boolean }
  ): Promise<T> {
    const res = await this.request(method, path, opts);
    const text = res.body.toString("utf8");
    if (res.status < 200 || res.status >= 300) {
      throw this.toError(res.status, text);
    }
    if (!text) {
      return {} as T;
    }
    return JSON.parse(text) as T;
  }

  private async requestBinary(method: string, path: string): Promise<Buffer> {
    const res = await this.request(method, path);
    if (res.status < 200 || res.status >= 300) {
      throw this.toError(res.status, res.body.toString("utf8"));
    }
    return res.body;
  }

  private toError(status: number, text: string): GatewayError {
    try {
      const env = JSON.parse(text) as ErrorEnvelope;
      const msg = env.message || env.error || text || `HTTP ${status}`;
      return new GatewayError(msg, status, env.exitCode);
    } catch {
      return new GatewayError(text || `HTTP ${status}`, status);
    }
  }

  private request(
    method: string,
    path: string,
    opts?: { json?: unknown; body?: Buffer; headers?: Record<string, string>; auth?: boolean }
  ): Promise<{ status: number; body: Buffer }> {
    const url = new URL(joinUrl(this.baseUrl, path));
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Fezd-Request-Id": crypto.randomBytes(16).toString("hex"),
      ...(opts?.headers ?? {})
    };
    if (opts?.auth !== false) {
      if (!this.token) {
        return Promise.reject(new GatewayError("No API key set. Run FEZD: Set API key."));
      }
      headers.Authorization = `Bearer ${this.token}`;
    }

    let body: Buffer | undefined = opts?.body;
    if (opts?.json !== undefined) {
      body = Buffer.from(JSON.stringify(opts.json), "utf8");
      headers["Content-Type"] = "application/json";
    }
    if (body) {
      headers["Content-Length"] = String(body.length);
    }

    const lib = url.protocol === "http:" ? http : https;
    const agent =
      url.protocol === "https:"
        ? new https.Agent({ rejectUnauthorized: this.rejectUnauthorized })
        : undefined;

    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers,
          agent,
          timeout: 120_000
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c as Buffer));
          res.on("end", () => {
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) });
          });
        }
      );
      req.on("error", (err) => reject(new GatewayError(err.message)));
      req.on("timeout", () => {
        req.destroy();
        reject(new GatewayError(`Request timed out: ${method} ${path}`));
      });
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (d) => hash.update(d));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
