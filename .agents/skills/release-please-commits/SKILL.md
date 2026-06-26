---
name: release-please-commits
description: >-
  Write commit messages and squash-merge PR titles that release-please can parse
  in this repo, while keeping gitmoji. Use when committing, writing a PR title,
  squash-merging a PR, or wording a changelog-relevant change.
---

# Release-please commit messages

This repo releases via **release-please**, which parses **Conventional Commits**.
The commit subject (and therefore the **PR title**, since PRs are squash-merged)
**must start with a type** like `feat:` or `fix:`. A leading gitmoji breaks the
parser (`unexpected token ' '`), so the commit is silently skipped — no version
bump, no changelog entry.

We still use gitmoji (per the repo preference): put the **emoji after the type**.

## Format

```
<type>[optional scope][!]: <gitmoji> <subject>
```

- `type` is first, lowercase, immediately followed by `:` (or `(scope):`).
- The gitmoji goes **after** the colon, then the subject.
- Pick emoji from https://gitmoji.dev (see the gitmoji specification).

## Type → changelog section

`.release-please-config.json` maps types to sections:

| Type | Section | Type | Section |
|------|---------|------|---------|
| `feat` | Added | `refactor` | Refactor |
| `fix` | Fixed | `test` | Test |
| `perf` | Improved | `build` | Build |
| `docs` | Documentation | `ci` | CI |
| `style` | Style | `chore` | Chore |

Only `feat`, `fix`, etc. drive a version bump. `chore`/`docs`/`style`/etc. show
in the changelog but (other than `feat`/`fix`/breaking) don't bump on their own.

## Breaking changes

Use `!` after the type or a `BREAKING CHANGE:` footer:

```
feat!: ✨ drop support for legacy color syntax
```

## Examples

Good:
```
feat: ✨ add PoE2 filter conditions
fix: 🐛 rank Class/BaseType suggestions by relevance
perf: ⚡️ cache parsed game data
docs: 📝 document the Import keyword
chore: 🔧 update release-please config
```

Bad (release-please skips these):
```
✨ feat: add conditions        # emoji before the type
✨ Add conditions              # no type at all
Added new conditions           # no type at all
```

## Checklist before committing / merging

- [ ] Subject starts with a `type:` (then optional gitmoji, then text).
- [ ] For a squash-merge, the **PR title** follows this format (it becomes the subject).
- [ ] Breaking changes use `!` or a `BREAKING CHANGE:` footer.
- [ ] Body explains the "why" (release-please keeps the body in the changelog link).
