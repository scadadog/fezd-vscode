export const PROJECT_EXTENSIONS = [".zef", ".xef", ".stu", ".sta"];
export const ARCHIVE_EXTENSIONS = [".zef", ".xef", ".sta"];

export function extOf(filePath: string): string {
  const i = filePath.lastIndexOf(".");
  return i < 0 ? "" : filePath.slice(i).toLowerCase();
}

export function isProjectFile(filePath: string): boolean {
  return PROJECT_EXTENSIONS.includes(extOf(filePath));
}

export function isArchiveFile(filePath: string): boolean {
  return ARCHIVE_EXTENSIONS.includes(extOf(filePath));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function joinUrl(base: string, path: string): string {
  const root = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return root + p;
}

export function sessionPhaseName(phase: number | string | undefined): string {
  if (typeof phase === "string") {
    return phase;
  }
  const names = ["Queued", "Waiting", "Running", "Resetting", "Succeeded", "Failed", "Cancelled"];
  if (typeof phase === "number" && phase >= 0 && phase < names.length) {
    return names[phase];
  }
  return String(phase ?? "");
}

export function isTerminalSession(phase: number | string | undefined): boolean {
  const name = sessionPhaseName(phase);
  return name === "Succeeded" || name === "Failed" || name === "Cancelled";
}

export function isTerminalJob(phase: number | string | undefined): boolean {
  if (typeof phase === "string") {
    return phase === "Succeeded" || phase === "Failed" || phase === "Cancelled";
  }
  return phase === 2 || phase === 3 || phase === 4;
}
