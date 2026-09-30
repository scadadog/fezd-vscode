import * as vscode from "vscode";
import type { ProfileId } from "./types";

export function activeProfile(): ProfileId {
  const v = vscode.workspace.getConfiguration("fezd").get<string>("activeProfile");
  return v === "onPrem" ? "onPrem" : "hosted";
}

export function profileLabel(id: ProfileId): string {
  return id === "onPrem" ? "On-prem" : "Off-prem";
}

export function gatewayUrl(id: ProfileId): string {
  const cfg = vscode.workspace.getConfiguration("fezd");
  const raw = id === "onPrem" ? cfg.get<string>("onPrem.url") : cfg.get<string>("hosted.url");
  return (raw ?? "").trim().replace(/\/+$/, "");
}

export function plcAddress(id: ProfileId): string {
  const cfg = vscode.workspace.getConfiguration("fezd");
  const raw = id === "onPrem" ? cfg.get<string>("onPrem.plcAddress") : cfg.get<string>("hosted.plcAddress");
  return (raw ?? "").trim();
}

export function plcPort(id: ProfileId): number {
  const cfg = vscode.workspace.getConfiguration("fezd");
  const n = id === "onPrem" ? cfg.get<number>("onPrem.plcPort") : cfg.get<number>("hosted.plcPort");
  return typeof n === "number" && n > 0 ? n : 502;
}

export function runAfterDeploy(): boolean {
  return vscode.workspace.getConfiguration("fezd").get<boolean>("runAfterDeploy") !== false;
}

export function forceDeploy(): boolean {
  return vscode.workspace.getConfiguration("fezd").get<boolean>("forceDeploy") === true;
}

export function allowInsecureTls(): boolean {
  return vscode.workspace.getConfiguration("fezd").get<boolean>("allowInsecureTls") === true;
}

export function artifactDirName(): string {
  const d = vscode.workspace.getConfiguration("fezd").get<string>("artifactDir");
  return (d && d.trim()) || "artifacts";
}

export async function setActiveProfile(id: ProfileId): Promise<void> {
  await vscode.workspace.getConfiguration("fezd").update(
    "activeProfile",
    id,
    vscode.ConfigurationTarget.Global
  );
}
