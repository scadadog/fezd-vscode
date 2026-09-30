# Releasing the FEZD extension

Pushes to `main` tag a SemVer release, attach `fezd-<version>.vsix` to a GitHub
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
   build to the Marketplace (publisher `scadadog`, extension id `fezd`).

## Marketplace (OTA)

Create a publisher named **scadadog** at
[Visual Studio Marketplace manage](https://marketplace.visualstudio.com/manage),
then a PAT with **Marketplace → Publish** and store it as Actions secret
`VSCE_PAT`.

Until that secret exists, GitHub Releases still ship the `.vsix` for
Install-from-VSIX. Users on Marketplace get automatic updates from the editor.

## Manual version bump

To force a minor/major, edit `package.json` `version` (and `CHANGELOG.md`) then
push to `main`.
