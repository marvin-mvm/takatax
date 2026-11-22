# Week 4 Graded Mini Project: submission index

**Project:** Takatax, AI for your BIR figures and tax monitoring. **Author:** marvin-mvm.
**Repository:** <https://github.com/marvin-mvm/takatax> · **Live app:** <https://takatax.netlify.app>

Each deliverable has its own file in this repository. All of them are also consolidated, with a
title on every slide, in one PDF: [`docs/Takatax-submission.pdf`](Takatax-submission.pdf).

| #   | Deliverable                                                                                                                             | Where                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Idea Validation Report**: all 7 validation steps with evidence, why now, differentiating angle                                        | [`docs/01-idea-validation-report.md`](01-idea-validation-report.md)                                                                                                                                                       |
| 2   | **Product Requirements Document (PRD)**: one page, 6 components, acceptance criteria per feature                                        | [`docs/02-PRD.md`](02-PRD.md)                                                                                                                                                                                             |
| 3   | **Spec file (spec.md) + Architecture notes**: AI module design, inputs, outputs, acceptance criteria, system architecture and data flow | [`spec.md`](../spec.md) · [`docs/03-architecture-notes.md`](03-architecture-notes.md)                                                                                                                                     |
| 4   | **GitHub repository**: meaningful commit history, README, CI/CD workflow (GitHub Actions)                                               | [README](../README.md) · [commit history](https://github.com/marvin-mvm/takatax/commits/main) · [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) · [Actions runs](https://github.com/marvin-mvm/takatax/actions) |
| 5   | **Live deployed application**: functional AI-powered web app                                                                            | <https://takatax.netlify.app> (hosted on Netlify)                                                                                                                                                                         |
| 6   | **Demo recording (2 minutes)**: the core AI feature in action                                                                           | DEMO_LINK                                                                                                                                                                                                                 |
| 7   | **Reflection write-up (1 page)**: learnings, challenges, improvements                                                                   | [`docs/07-reflection.md`](07-reflection.md)                                                                                                                                                                               |

## Also in the repository

- AI coding rules: [`AGENTS.md`](../AGENTS.md), [`CLAUDE.md`](../CLAUDE.md),
  [`.cursorrules`](../.cursorrules).
- v2 improvement: [issue #44, VAT returns (2550Q)](https://github.com/marvin-mvm/takatax/issues/44).
- Unit tests: 418 in 42 files, for example
  `supabase/functions/_shared/domain/*.test.ts` (tax engine) and
  `supabase/functions/_shared/parser/*.test.ts` (the AI reader's checks).
- Pitch deck (all deliverables as slides): <https://takatax.netlify.app/deck>.

## Stack: recommended and used

| Recommended                      | Used instead                                              |
| -------------------------------- | --------------------------------------------------------- |
| Next.js 14 + Tailwind            | TanStack Start (React 19) + Tailwind CSS 4                |
| Vercel AI SDK + Claude or OpenAI | OpenRouter API: Gemini Flash and Pro, Claude Haiku        |
| Supabase                         | Supabase                                                  |
| Clerk or Supabase Auth           | Supabase Auth                                             |
| Vercel + GitHub Actions          | Netlify + GitHub Actions                                  |
| Cursor                           | Claude Code (AGENTS.md, CLAUDE.md; .cursorrules included) |
