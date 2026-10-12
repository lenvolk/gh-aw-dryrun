# gh-aw engines — authentication

gh-aw agents select an `engine:` in YAML frontmatter. Authentication can use a workflow permission, repository secret, or workload identity, depending on the engine. Always cross-check <https://github.github.com/gh-aw/reference/auth/> and <https://github.github.com/gh-aw/reference/engines/> for the installed gh-aw version.

## GitHub Copilot (default engine)

| Item | Value |
|---|---|
| Engine key in frontmatter | `engine: copilot` (or omit — it's the default) |
| Preferred authentication | `permissions: copilot-requests: write` |
| Preferred token | Per-run `${{ github.token }}`; no repository secret |
| Fallback secret | `COPILOT_GITHUB_TOKEN` (**not** `COPILOT_API_KEY`) |
| Fallback token type | Fine-grained PAT (`github_pat_…`) |

### Preferred: organization billing

Add `copilot-requests: write` to workflow `permissions`. This path requires an organization Copilot subscription with centralized billing. gh-aw then uses the per-run GitHub Actions token and ignores `COPILOT_GITHUB_TOKEN` for inference.

### Fallback: fine-grained PAT

Use this for a personal repository or when centralized organization billing is unavailable:

- **Resource owner:** the user account that has the Copilot license
- **Account permission:** `Copilot Requests`: **Read**
- **Secret name:** `COPILOT_GITHUB_TOKEN`
- **Unsupported token types:** classic PATs (`ghp_…`), OAuth tokens (`gho_…`), and GitHub App tokens

Set it interactively with `gh aw secrets set COPILOT_GITHUB_TOKEN` or `gh secret set COPILOT_GITHUB_TOKEN`. Do not put the token value in command history.

### Runtime error to fix

- `Error: None of the following secrets are set: COPILOT_GITHUB_TOKEN` → secret missing or misnamed; `gh secret set COPILOT_GITHUB_TOKEN`
- `403 Forbidden` with `copilot-requests: write` → verify centralized organization billing or use the PAT fallback
- PAT permission error → regenerate a fine-grained PAT with `Copilot Requests: Read`
- token type rejected → replace classic/OAuth/App token with a fine-grained PAT

## Anthropic Claude

| Item | Value |
|---|---|
| Engine key | `engine: claude` |
| Secret name | `ANTHROPIC_API_KEY` |
| Token source | <https://console.anthropic.com/> → API keys (not a GitHub token) |

## OpenAI

| Item | Value |
|---|---|
| Engine key | `engine: openai` |
| Secret name | `OPENAI_API_KEY` |
| Token source | <https://platform.openai.com/api-keys> (not a GitHub token) |

The Codex runtime uses `CODEX_API_KEY` when present and otherwise falls back to `OPENAI_API_KEY`.

## Google Gemini

| Item | Value |
|---|---|
| Engine key | `engine: gemini` |
| Secret name | `GEMINI_API_KEY` |
| Keyless alternative | Google Workload Identity Federation configured through `engine.auth` |

## Pi

Pi selects authentication from the provider prefix in `model:`. It uses Copilot authentication by default, `ANTHROPIC_API_KEY` for `anthropic/...`, and `CODEX_API_KEY` or `OPENAI_API_KEY` for OpenAI/Codex providers. Verify the current model syntax in the engine reference.

## Switching engines in an existing demo

1. Edit the `engine:` line in the agent `.md` YAML header.
2. Configure the new engine's current authentication method.
3. Re-run `gh aw compile` to regenerate `.lock.yml`.
4. Commit + push. The new `.lock.yml` will reference the new secret name.

## Always verify against the live docs

Before quoting any of the above, fetch both the authentication and engine references. Authentication defaults, secret names, and permissions are especially likely to change.
