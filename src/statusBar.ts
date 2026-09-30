import * as vscode from "vscode";
import { activeProfile, profileLabel } from "./config";

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  item.command = "fezd.switchEnvironment";
  item.tooltip = "Switch FEZD off-prem / on-prem gateway";
  context.subscriptions.push(item);

  const refresh = () => {
    item.text = `FEZD: ${profileLabel(activeProfile())}`;
    item.show();
  };
  refresh();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("fezd.activeProfile")) {
        refresh();
      }
    })
  );
  return item;
}
