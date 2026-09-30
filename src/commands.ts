import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { FezdClient, GatewayError } from "./client";
import {
  activeProfile,
  allowInsecureTls,
  artifactDirName,
  forceDeploy,
  gatewayUrl,
  plcAddress,
  plcPort,
  profileLabel,
  runAfterDeploy,
  setActiveProfile
} from "./config";
import { logLine, showLog } from "./log";
import type { SecretStore } from "./secrets";
import type { CreateSessionRequest, ProfileId } from "./types";
import { isArchiveFile, isProjectFile } from "./util";

export function registerCommands(context: vscode.ExtensionContext, secrets: SecretStore): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("fezd.health", () => runHealth(secrets)),
    vscode.commands.registerCommand("fezd.setApiKey", () => setApiKey(secrets)),
    vscode.commands.registerCommand("fezd.setAppPassword", () => setAppPassword(secrets)),
    vscode.commands.registerCommand("fezd.switchEnvironment", () => switchEnvironment()),
    vscode.commands.registerCommand("fezd.convertZefToStu", (uri?: vscode.Uri) =>
      convertZefToStu(secrets, uri)
    ),
    vscode.commands.registerCommand("fezd.deploy", (uri?: vscode.Uri) => deploy(secrets, uri))
  );
}

async function switchEnvironment(): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: "Off-prem", description: "Hosted FEZD gateway (simulator by default)", id: "hosted" as ProfileId },
      { label: "On-prem", description: "Local fezd-server + plant PLC IP", id: "onPrem" as ProfileId }
    ],
    { title: "FEZD environment", placeHolder: "Which gateway should convert and deploy use?" }
  );
  if (!pick) {
    return;
  }
  await setActiveProfile(pick.id);
  vscode.window.showInformationMessage(`FEZD: ${pick.label}`);
}

async function setApiKey(secrets: SecretStore): Promise<void> {
  const id = await pickProfile("Which profile should store this API key?");
  if (!id) {
    return;
  }
  const value = await vscode.window.showInputBox({
    title: `FEZD API key (${profileLabel(id)})`,
    password: true,
    prompt: "Bearer token from fezd-server license issue (FEZD_TOKEN).",
    ignoreFocusOut: true
  });
  if (value === undefined) {
    return;
  }
  await secrets.setToken(id, value.trim());
  vscode.window.showInformationMessage(`FEZD API key saved for ${profileLabel(id)}.`);
}

async function setAppPassword(secrets: SecretStore): Promise<void> {
  const id = await pickProfile("Which profile should store the Control Expert application password?");
  if (!id) {
    return;
  }
  const value = await vscode.window.showInputBox({
    title: `Application password (${profileLabel(id)})`,
    password: true,
    prompt: "Optional. Required for many protected / M580 archive projects. Leave empty to clear.",
    ignoreFocusOut: true
  });
  if (value === undefined) {
    return;
  }
  await secrets.setAppPassword(id, value);
  vscode.window.showInformationMessage(
    value ? `Application password saved for ${profileLabel(id)}.` : `Application password cleared for ${profileLabel(id)}.`
  );
}

async function pickProfile(placeHolder: string): Promise<ProfileId | undefined> {
  const current = activeProfile();
  const pick = await vscode.window.showQuickPick(
    [
      {
        label: "Off-prem",
        description: current === "hosted" ? "active" : undefined,
        id: "hosted" as ProfileId
      },
      {
        label: "On-prem",
        description: current === "onPrem" ? "active" : undefined,
        id: "onPrem" as ProfileId
      }
    ],
    { placeHolder }
  );
  return pick?.id;
}

async function runHealth(secrets: SecretStore): Promise<void> {
  showLog();
  try {
    const client = await makeClient(secrets);
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "FEZD: checking gateway…" },
      async () => {
        await client.healthz();
        const [who, ver, profile] = await Promise.all([
          client.whoami(),
          client.version(),
          client.profile()
        ]);
        const families = profile.simulator?.families?.join(", ") || "—";
        const lines = [
          `${profileLabel(activeProfile())}  ${client.baseUrl}`,
          `${ver.product ?? "FEZD"} ${ver.version ?? ""}`.trim(),
          `Vendor: ${profile.vendor ?? "—"}`,
          `Toolchain: ${profile.toolchain ?? "—"}`,
          `Simulator: ${profile.simulator?.displayName ?? "—"} (${families})`,
          `Token: ${who.tokenId ?? "—"}  scopes: ${(who.scopes ?? []).join(", ") || "—"}`
        ];
        for (const line of lines) {
          logLine("info", line);
        }
        await vscode.window.showInformationMessage(lines.join("  ·  "));
      }
    );
  } catch (err) {
    showError(err);
  }
}

async function convertZefToStu(secrets: SecretStore, uri?: vscode.Uri): Promise<void> {
  showLog();
  const file = await pickProject(uri, "archive");
  if (!file) {
    return;
  }
  try {
    const client = await makeClient(secrets);
    const id = activeProfile();
    const appPassword = await secrets.getAppPassword(id);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "FEZD: converting to .stu…",
        cancellable: false
      },
      async () => {
        const upload = await client.uploadProject(file, path.basename(file));
        const { jobId, result } = await client.exportStu(upload.projectId, appPassword);
        if (!result.success) {
          await downloadBuildErrors(client, "job", jobId, result.artifacts ?? [], file);
          throw new GatewayError(result.message || "Export failed.", undefined, result.exitCode);
        }
        const destDir = artifactFolder(file);
        for (const name of result.artifacts ?? []) {
          await client.downloadJobArtifact(jobId, name, path.join(destDir, name));
        }
        vscode.window.showInformationMessage(`FEZD saved .stu under ${destDir}`);
      }
    );
  } catch (err) {
    showError(err);
  }
}

async function deploy(secrets: SecretStore, uri?: vscode.Uri): Promise<void> {
  showLog();
  const file = await pickProject(uri, "any");
  if (!file) {
    return;
  }
  try {
    const client = await makeClient(secrets);
    const id = activeProfile();
    const create = await buildSessionRequest(id, secrets);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: create.simulator ? "FEZD: deploying to simulator…" : `FEZD: deploying to ${create.targetAddress}…`,
        cancellable: false
      },
      async () => {
        const upload = await client.uploadProject(file, path.basename(file));
        create.projectId = upload.projectId;
        const { sessionId, result, artifacts } = await client.deploySession(create);
        const destDir = artifactFolder(file);
        if (!result.success) {
          await downloadNamed(
            (n, dest) => client.downloadSessionArtifact(sessionId, n, dest),
            artifacts,
            destDir,
            true
          );
          throw new GatewayError(result.message || "Deploy failed.", undefined, result.exitCode);
        }
        await downloadNamed(
          (n, dest) => client.downloadSessionArtifact(sessionId, n, dest),
          artifacts,
          destDir,
          false
        );
        vscode.window.showInformationMessage(
          create.simulator
            ? "FEZD deploy to simulator finished."
            : `FEZD deploy to ${create.targetAddress} finished.`
        );
      }
    );
  } catch (err) {
    showError(err);
  }
}

async function buildSessionRequest(id: ProfileId, secrets: SecretStore): Promise<CreateSessionRequest> {
  const addr = plcAddress(id);
  const simulator = id === "hosted" ? !addr : false;
  if (!simulator && !addr) {
    throw new GatewayError(
      id === "onPrem"
        ? "Set fezd.onPrem.plcAddress (plant PLC IP) or switch to Off-prem for the simulator."
        : "Set fezd.hosted.plcAddress or leave it empty to deploy to the simulator."
    );
  }
  const appPassword = await secrets.getAppPassword(id);
  return {
    projectId: "",
    simulator,
    targetAddress: simulator ? undefined : addr,
    port: plcPort(id),
    driver: "TCPIP",
    run: runAfterDeploy(),
    force: forceDeploy(),
    returnStu: true,
    saveSta: false,
    buildBeforeDeploy: true,
    appPassword: appPassword || undefined,
    restartSimulator: simulator
  };
}

async function pickProject(
  uri: vscode.Uri | undefined,
  kind: "archive" | "any"
): Promise<string | undefined> {
  if (uri?.fsPath && fs.existsSync(uri.fsPath)) {
    if (kind === "archive" && !isArchiveFile(uri.fsPath)) {
      vscode.window.showErrorMessage("FEZD convert expects a .zef, .xef, or .sta archive.");
      return undefined;
    }
    if (kind === "any" && !isProjectFile(uri.fsPath)) {
      vscode.window.showErrorMessage("FEZD deploy expects a .zef, .xef, .stu, or .sta file.");
      return undefined;
    }
    return uri.fsPath;
  }
  const filters: { [name: string]: string[] } =
    kind === "archive"
      ? { "Control Expert archive": ["zef", "xef", "sta"] }
      : { "Control Expert project": ["zef", "xef", "stu", "sta"] };
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters,
    title: kind === "archive" ? "Select a .zef to convert" : "Select a project to deploy"
  });
  const file = picked?.[0]?.fsPath;
  return file;
}

async function makeClient(secrets: SecretStore): Promise<FezdClient> {
  const id = activeProfile();
  const url = gatewayUrl(id);
  if (!url) {
    throw new GatewayError(
      `Set fezd.${id === "onPrem" ? "onPrem" : "hosted"}.url to the gateway HTTPS endpoint.`
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new GatewayError("Gateway URL must start with https:// (or http:// for lab only).");
  }
  const token = (await secrets.getToken(id))?.trim() ?? "";
  if (!token) {
    throw new GatewayError(`No API key for ${profileLabel(id)}. Run FEZD: Set API key.`);
  }
  return new FezdClient(url, token, !allowInsecureTls());
}

function artifactFolder(projectFile: string): string {
  const folders = vscode.workspace.workspaceFolders;
  const root = folders?.[0]?.uri.fsPath ?? path.dirname(projectFile);
  const dir = path.join(root, artifactDirName());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function downloadBuildErrors(
  client: FezdClient,
  kind: "job" | "session",
  id: string,
  artifacts: string[],
  projectFile: string
): Promise<void> {
  const destDir = artifactFolder(projectFile);
  for (const name of artifacts) {
    if (name.toLowerCase() !== "build-errors.txt") {
      continue;
    }
    try {
      if (kind === "job") {
        await client.downloadJobArtifact(id, name, path.join(destDir, name));
      } else {
        await client.downloadSessionArtifact(id, name, path.join(destDir, name));
      }
    } catch (err) {
      logLine("warn", `Could not download ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function downloadNamed(
  fetch: (name: string, dest: string) => Promise<void>,
  artifacts: string[],
  destDir: string,
  errorsOnly: boolean
): Promise<void> {
  for (const name of artifacts) {
    if (errorsOnly && name.toLowerCase() !== "build-errors.txt") {
      continue;
    }
    try {
      await fetch(name, path.join(destDir, name));
    } catch (err) {
      logLine("warn", `Could not download ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function showError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  logLine("error", msg);
  showLog();
  vscode.window.showErrorMessage(`FEZD: ${msg}`);
}
