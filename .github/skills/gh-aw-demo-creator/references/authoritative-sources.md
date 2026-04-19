# Authoritative gh-aw sources

The canonical documentation is at <https://github.github.com/gh-aw/>. Fetch the relevant page before claiming any schema fact. This file maps "question you need to answer" to "page to fetch".

## Source map

| Question | Page to fetch |
|---|---|
| What secret does engine X require? | <https://github.github.com/gh-aw/reference/engines/> |
| Does the engine accept classic or fine-grained PATs? What permissions? | <https://github.github.com/gh-aw/reference/engines/#github-copilot-default> (anchors per engine) |
| What keys are valid in the `.md` YAML frontmatter? | <https://github.github.com/gh-aw/reference/frontmatter/> |
| What `safe-outputs` types exist and what do they do? | <https://github.github.com/gh-aw/reference/safe-outputs/> |
| What `on:` triggers are supported? | <https://github.github.com/gh-aw/reference/triggers/> |
| What `gh aw` subcommands exist? | <https://github.github.com/gh-aw/reference/cli/> |
| How does the 5-job architecture work and why? | <https://github.github.com/gh-aw/introduction/architecture/> |
| How do I debug a failed run? | <https://github.github.com/gh-aw/guides/debugging/> |
| What tools can agents use (MCP, etc.)? | <https://github.github.com/gh-aw/reference/tools/> |

## Secondary (when docs lag behind code)

| Source | Why |
|---|---|
| <https://github.com/githubnext/gh-aw> (`/docs/` folder + Releases tab) | Versioned with the code; shows which keys are new/deprecated |
| <https://github.com/githubnext/gh-aw/issues> | Real-user errors and fixes, often before docs are updated |
| <https://github.com/githubnext/agentics> | Working example agents — copy-paste reference for current syntax |
| The user's own compiled `.lock.yml` | Ground truth for what this version of gh-aw actually generates |
| `gh run view <id> --log-failed` output | The activation job prints the exact secret name it was looking for |

## Protocol

1. Before writing any non-trivial gh-aw instruction, fetch the matching page from the source map.
2. If the question isn't in the map, go to the hosted docs homepage and navigate — do not guess.
3. Cite the gh-aw version when recommending something non-obvious: `gh aw version`.
4. Prefer copy-paste from `githubnext/agentics` over hand-reconstructed YAML.
