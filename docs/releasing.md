# Releasing the FEZD extension

Pushes to `main` tag a SemVer release, attach `scadadog-fezd-<version>.vsix` to a GitHub
Release, and (when configured) publish to the VS Marketplace so VS Code, Cursor,
and Windsurf auto-update.

Sideloaded VSIX files **do not** auto-update. Marketplace (or Open VSX) is the
over-the-air path.

## How it works

1. Push (or merge) to `main`.
2. The Release workflow reads `version` from `package.json`.
3. If `vX.Y.Z` already exists, it auto-bumps the **patch**, commits
   `chore: release vX.Y.Z [skip ci]`, and tags.
4. `vsce package` builds the VSIX; `gh release create` uploads it.
5. If repository secret **`VSCE_PAT`** is set, `vsce publish` pushes the same
   build to the Marketplace (publisher `scadadog`, extension id `scadadog-fezd`,
   display name **SCADADOG FEZD**). `displayName` must be globally unique.

## Marketplace (OTA)

Create a publisher at
[Visual Studio Marketplace manage](https://marketplace.visualstudio.com/manage).
When adding an extension, choose **Visual Studio Code** — not **Azure DevOps**.

PAT for `vsce` / GitHub Actions: [Azure DevOps user settings → Personal access tokens](https://dev.azure.com/_usersSettings/tokens)
(you use that site even though this is a VS Code extension).

- Organization: **All accessible organizations**
- Scopes: **Custom** → **Marketplace** → **Acquire** and **Publish**
- Do not rely on Azure DevOps Build/Code scopes; those are for pipelines, not `vsce publish`

Store the token as Actions secret `VSCE_PAT`.

## Manual version bump

To force a minor/major, edit `package.json` `version` (and `CHANGELOG.md`) then
push to `main`.
