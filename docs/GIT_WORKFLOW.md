# Git branches and releases

The application Git repository is `velx-academy/`. Run Git and application
commands there. The workspace above it has a separate repository; do not add the
application, deployment archives or runtime data to that parent repository.

## Branches

| Branch | Purpose | Environment mapping |
| --- | --- | --- |
| `main` | Production release baseline | Production, once deployment is connected |
| `develop` | Integration of tested changes | Local testing now; hosted development/staging later |
| `feature/<topic>` | New functionality | Local testing or a future isolated preview |
| `fix/<topic>` | Bug fix | Local testing or a future isolated preview |
| `docs/<topic>` | Documentation | Documentation review |
| `chore/<topic>` | Dependencies, tooling or maintenance | Local checks or a future isolated preview |
| `hotfix/<topic>` | Urgent production fix, based on `main` | Verify before a production release |

Every new logical change starts on its own branch before editing. Several related
files and commits can belong to one change. Commit related operator documentation
and update `AGENTS.md` when the architecture, commands or contributor rules change;
it is not a generated change log and does not update itself.

Use lowercase topics with hyphens, such as `feature/fee-discounts`,
`fix/student-admission-status` or `docs/branch-naming`. These prefixes replace the
earlier `codex/` convention for new work. Historical branches retain their names.

At initial setup on 10 November 2026, `main` was retained at `011b6b4`, the
previously published source baseline. The previously uncommitted local login and
password-recovery work was saved on `codex/local-auth-and-password-recovery` in
commit `4707395`, then merged into `develop` after validation. This workflow was
added separately on `codex/git-branch-workflow`. Earlier history is preserved.

## Working on a change

1. Confirm `git rev-parse --show-toplevel` identifies the application repository.
   Check `git status --short --branch`. Preserve unfinished work on its existing
   branch; use another worktree if a different task needs a clean checkout.
2. Start from the latest `develop`. When a remote is configured, fetch it and
   update with a fast-forward before branching. For example:

   ```powershell
   git switch develop
   git switch -c feature/fee-plan-discount
   ```

3. Implement only the task and its related documentation. Review `git diff` and
   stage the intended source files explicitly. Keep passwords, `.env` values,
   `.sites-runtime`, databases, uploaded files and generated builds out of Git.
4. Run checks appropriate to the change. Application changes normally require
   `npm run typecheck`, `npm test` and `npm run build`. Documentation-only changes
   need content/link review and `git diff --check`.
5. Commit with a descriptive message. Compare the feature with its base using
   `git diff develop...feature/fee-plan-discount` and inspect `git log --oneline`.
6. With GitHub connected, push the feature branch and open a pull request into
   `develop`. Require successful checks before merging. Use a merge commit so
   the branch's grouped history remains visible. Before a remote exists, a
   verified local `git merge --no-ff <feature-branch>` provides the same history
   grouping, without claiming a remote review occurred.

Keep the feature branch until it is integrated and backed up remotely. Avoid
force pushes to shared branches and never reset history to remove a mistake;
use a follow-up fix or a reviewed revert.

## Development and production

The normal flow is:

```text
feature/<change> -> pull request -> develop -> test -> release pull request -> main
```

`develop` should deploy to a development/staging environment when hosting is
configured. Test there before promoting the same tested code to `main` for a
production release. Record a release version/tag and the deployed commit so a
deployment can be traced to its source. For an urgent production fix, branch from
`main` as `hotfix/<topic>`, verify it, merge through the release process and
merge the resulting production history back into `develop`.

The environments need separate D1 databases, R2 buckets, authentication projects
or isolated provider settings, reset redirect URLs and secrets. Development uses
fictional records and captured/test email. Production uses actual academy records
and configured email delivery. Never seed fictional accounts into production or
copy its private records into development. Review migrations and backup needs
before applying a production release. Reverting application code does not undo
database migrations or data changes.

GitHub stores and reviews code. A hosting service runs the application. Creating
branches does not create development/production URLs, deploy either environment
or replace the current Sites authentication. Independent hosting and full
email/password sign-in remain separate implementation tasks.

## Remote setup and enforcement

At initial setup there was no configured remote. Check `git remote -v` for the
current state. These local commits are not a GitHub backup until pushed to a
confirmed repository. Use the academy's intended private GitHub repository;
preserve the existing history and do not replace an unrelated remote.

When the repository is connected:

- Push `main`, `develop` and retained task branches to that repository.
- Add CI for pull requests to `develop` and `main`, running the checked-in install,
  typecheck, test and build commands on a supported Node runtime. Do not supply
  production credentials to ordinary pull-request jobs.
- Protect `main` and `develop` with pull requests, required checks and restrictions
  on force pushes/deletion. Configure reviewer requirements for the actual team.
- Connect the development deployment to `develop` and production to `main`.
  Restrict production deployment branches and keep environment secrets separate.
  Select available protection features according to the account's GitHub plan.

These remote protections, CI jobs and deployment mappings are setup steps, not
features activated by this document. See GitHub's official guidance on
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
and [deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
