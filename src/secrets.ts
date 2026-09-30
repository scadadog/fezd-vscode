import * as vscode from "vscode";
import type { ProfileId } from "./types";

const TOKEN_PREFIX = "fezd.token.";
const APP_PASSWORD_PREFIX = "fezd.appPassword.";

export class SecretStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  tokenKey(id: ProfileId): string {
    return TOKEN_PREFIX + id;
  }

  appPasswordKey(id: ProfileId): string {
    return APP_PASSWORD_PREFIX + id;
  }

  getToken(id: ProfileId): Thenable<string | undefined> {
    return this.secrets.get(this.tokenKey(id));
  }

  setToken(id: ProfileId, value: string): Thenable<void> {
    return this.secrets.store(this.tokenKey(id), value);
  }

  getAppPassword(id: ProfileId): Thenable<string | undefined> {
    return this.secrets.get(this.appPasswordKey(id));
  }

  setAppPassword(id: ProfileId, value: string): Thenable<void> {
    if (!value) {
      return this.secrets.delete(this.appPasswordKey(id));
    }
    return this.secrets.store(this.appPasswordKey(id), value);
  }
}
