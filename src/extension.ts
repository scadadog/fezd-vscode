import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { SecretStore } from "./secrets";
import { createStatusBar } from "./statusBar";

export function activate(context: vscode.ExtensionContext): void {
  const secrets = new SecretStore(context.secrets);
  createStatusBar(context);
  registerCommands(context, secrets);
}

export function deactivate(): void {
  /* no-op */
}
