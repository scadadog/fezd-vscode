import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getLog(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("FEZD");
  }
  return channel;
}

export function logLine(level: string, message: string): void {
  const ts = new Date().toISOString();
  getLog().appendLine(`[${ts}] ${level.toUpperCase()} ${message}`);
}

export function showLog(): void {
  getLog().show(true);
}
