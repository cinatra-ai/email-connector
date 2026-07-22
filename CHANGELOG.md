# Changelog

All notable changes to this project are documented here, derived from the
project's merged pull request and release-tag history.

## v0.1.1 — 2026-06-13

- ci: adopt source-leak-gate (#1)
- ci: adopt source-leak-gate (#2)
- chore: add .gitignore (#3)
- ci: adopt org gates — SHA-pin all uses: refs, bump source-leak-gate to v0.1.0, add actions-pinned + gitignore gates (#4)
- chore: keep internal planning notes untracked (#5)
- Self-configure the email facade at serverEntry activation; merge email-send capability providers lazily (#6)
- chore: npm packaging hygiene — files allowlist + git-archive export-ignore (#7)
- Register the email-system capability from register(ctx) (cinatra#7 P721) (#8)
- ci(release): grant contents: write + pin reusable workflow to .github HEAD (#9)
- chore: Configure Renovate (#10)
- ci: repin reusable release workflow (immutable-safe decoration + corrected build-input provisioning) (#12)
- release: email-connector v0.1.1 (republish on corrected serverEntry build pipeline) (#13)

## v0.1.0 — 2026-06-03

- Initial release.

## Unreleased

- fix(facade): admit the test-delivery send correlation (`submissionId` / `draftId`) on `EmailTransportCorrelation` so it threads type-safely to the sent-email object writer for crash reconciliation (#35, cinatra#1947)
- ci: add truthful-attribution-gate (WARN / advisory mode) (#14)
- ci: adopt the reusable extension->host IoC conformance gate (org-wide rollout) (#15)
- ci: tag-driven GitHub release on v* (#16)
- ci: adopt secret-scan-gate (#17)
- docs(readme): expand README to the org standard (#18) (#19)
- ci: adopt source-leak-gate (#20)
- ci: adopt source-leak-gate (#21)
- chore: strip private engineering-tracker refs from public source (#22)
- chore: strip private tracker references from workflow comments (#25)
- ci(release): pin reusable-extension-release to gated v0.1.1 (release-approval wall) (#26)
- chore: add cinatra.vendor and displayName connector metadata (#27)
- chore(deps): declare cinatra.consumes for closure-gate enrollment (#28)

