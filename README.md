# Houndo

Houndo is an independent, local-first workbench for researching community feedback, testing possible workarounds, and drafting replies for human review.

The initial version focuses on Kagi Feedback discussions and Kagi documentation. It can test custom CSS against a private local copy of a Kagi search results page, but it never posts replies or changes Kagi account settings.

Houndo is an independent community project. It is not affiliated with, endorsed by, or approved by Kagi.

## Status

The issue 11340 vertical slice is implemented: Houndo can capture an authenticated Kagi search privately, prepare a Custom CSS candidate, verify it through a persistent Vite lab and gg file sink, and validate a Markdown reply for human review. The broader local corpus, queue, and synchronization design remains specified but unimplemented.

See the [Houndo v0 implementation specification](specs/2026-08-25-houndo-v0.md) for the full target architecture.

## Local workflow

```sh
pnpm install
pnpm check
pnpm houndo work init <issue-id>
pnpm houndo serp capture --query "..." --renderer search
pnpm houndo css prepare <issue-id> --capture <capture-id>
pnpm dev
pnpm houndo css verify <issue-id>
pnpm houndo check-work <issue-id>
```

Copy `.env.example` to `.env` when the capture browser needs a Kagi session link. The link and all captures, browser state, candidates, verifier reports, and drafts remain in gitignored local files. The human reviewer starts `pnpm dev`, judges the final appearance and wording, and posts manually.
