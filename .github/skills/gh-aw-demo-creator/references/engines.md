# gh-aw engines — secrets, tokens, permissions

gh-aw agents pick an `engine:` in their YAML frontmatter. Each engine reads a specific repository secret, accepts specific token types, and needs specific permissions. **These values have been wrong in past sessions from memory — always cross-check against <https://github.github.com/gh-aw/reference/engines/> for the version of gh-aw the user has installed.**

## GitHub Copilot (default engine)

| Item | Value |
|---|---|
| Engine key in frontmatter | `engine: copilot` (or omit — it's the default) |
| Secret name | `COPILOT_GITHUB_TOKEN` (**not** `COPILOT_API_KEY`) |
| Token type | **Fine-grained PAT** (`github_pat_…`). Classic PATs (`ghp_…`) are rejected with an explicit error. |
| Generate at | <https://github.com/settings/personal-access-tokens/new> |

### Fine-grained PAT settings

- **Resource owner:** user or org that owns the demo repo
- **Repository access:** *Only selected repositories* → pick the demo repo (don't grant "All repositories")
- **Repository permissions:**
  - `Contents`: **Read-only**
  - `Pull requests`: **Read and write**
  - `Issues`: **Read and write**
  - `Metadata`: **Read** (auto-required)
- **Account permissions:**
  - `Copilot Chat`: **Read-only** ← this is the one that enables the Copilot CLI engine. "Copilot Editor Context" and "Copilot Requests" are for different surfaces; do not pick them.

### Runtime error → fix

- `Error: None of the following secrets are set: COPILOT_GITHUB_TOKEN` → secret missing or misnamed; `gh secret set COPILOT_GITHUB_TOKEN`
- `Error: COPILOT_GITHUB_TOKEN is a classic Personal Access Token (ghp_...). Classic PATs are not supported for GitHub Copilot` → regenerate as fine-grained

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

## Switching engines in an existing demo

1. Edit the `engine:` line in the agent `.md` YAML header.
2. Re-run `gh aw compile` to regenerate `.lock.yml`.
3. `gh secret set <new_secret_name>` with a key from the new provider.
4. Commit + push. The new `.lock.yml` will reference the new secret name.

## Always verify against the live docs

Before quoting any of the above to a user, fetch <https://github.github.com/gh-aw/reference/engines/> — the engine list, secret names, and required scopes are the places most likely to change between gh-aw releases.
