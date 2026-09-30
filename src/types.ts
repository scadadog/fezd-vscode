export type ProfileId = "hosted" | "onPrem";

export interface AutomationProfile {
  id?: string;
  vendor?: string;
  toolchain?: string;
  displayName?: string;
  projectFormats?: string[];
  simulator?: { displayName?: string; families?: string[] };
  note?: string;
}

export interface WhoAmI {
  tokenId?: string;
  scopes?: string[];
}

export interface VersionInfo {
  product?: string;
  version?: string;
}

export interface ProjectUploadResult {
  projectId: string;
  fileName: string;
  sha256: string;
  size: number;
  deduplicated: boolean;
}

export interface JobResult {
  exitCode: number;
  success: boolean;
  message?: string;
  artifacts?: string[];
}

export interface JobStatus {
  id: string;
  kind?: string;
  phase: number | string;
  result?: JobResult;
}

export interface JobLogEntry {
  seq: number;
  ts?: string;
  level?: string;
  message?: string;
}

export interface JobLogs {
  entries?: JobLogEntry[];
  nextCursor: number;
  done: boolean;
}

export interface ArtifactRef {
  name?: string;
  url?: string;
}

export interface SessionStatus {
  id: string;
  phase: number | string;
  queuePosition?: number;
  queueDepth?: number;
  result?: JobResult;
  artifacts?: ArtifactRef[];
}

export interface SessionEvent {
  type?: string;
  seq?: number;
  level?: string;
  message?: string;
  phase?: string;
  exitCode?: number;
  artifacts?: ArtifactRef[];
}

export interface SessionEventsPage {
  entries?: SessionEvent[];
  nextCursor: number;
  done: boolean;
}

export interface CreateSessionRequest {
  projectId: string;
  simulator: boolean;
  targetAddress?: string;
  port: number;
  driver: string;
  run: boolean;
  force: boolean;
  returnStu: boolean;
  saveSta: boolean;
  buildBeforeDeploy: boolean;
  appPassword?: string;
  restartSimulator: boolean;
}

export interface ExportRequest {
  projectId: string;
  saveStu: boolean;
  saveSta: boolean;
  build: boolean;
  appPassword?: string;
}

export interface ErrorEnvelope {
  error?: string;
  message?: string;
  exitCode?: number;
  requestId?: string;
}
