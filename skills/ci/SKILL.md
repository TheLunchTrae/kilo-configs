---
name: ci
description: Use when planning, implementing, or reviewing GitHub Actions or GitLab CI pipelines, actions, includes, credentials, or runner trust boundaries.
---

# CI safety and behavior

Trace callers, includes, reusable workflows, triggers, inherited settings, required check names, and job dependencies.
Inspect inaccessible dependencies as explicit gaps. Preserve the intended graph and existing project conventions.

## Performance and diagnostics

Inspect recent job and step durations before optimizing. Report measured before/after results or unmeasured limits.
Honor repository exceptions and preserve existing workflow names and required checks.

- Reuse valid caches where they reduce setup cost. Choose keys for the actual cached state and compatibility inputs,
  such as platform, toolchain, and dependency files. Preserve isolation and cache trust boundaries.
- Consider cancellation of superseded review runs only where safe. Preserve required branch, release,
  deployment, and diagnostic work; do not impose a new cancellation policy without checking those needs.
- Consider changed-file gates or separate fast/slow lanes when measured costs justify them.
  Keep required coverage reachable before relevant changes ship. Unknown changes must not silently skip checks;
  surface gate failures and preserve the host's required-status semantics.
- Avoid duplicate builds, prerequisite probes that repeat real checks, and platform-independent work in every lane.
  Build only needed architectures. Verify actual platform behavior rather than assuming a flag has an effect.
- Use normal command logs and failure status with bounded timeouts. Upload existing failure results only where useful.
  Deep diagnostics are opt-in for a specific investigation, not a mandatory stage. Bound them within the job timeout.
  Preserve original failures; do not conceal them with diagnostics or blind retries.
- Distinguish setup/runner failures from assertions. Validate reliability fixes against the observed failure;
  a faster build does not prove an unrelated runtime failure is fixed.

Use the target project's supported mechanisms; do not impose a provider, runner layout, or workflow structure.

## Safety and verification

- Grant minimum job permissions. Keep secrets out of source, logs, artifacts, and caches. Masking does not make
  transformed secrets safe. Never execute untrusted fork code with deploy credentials or privileged runner access.
- In GitHub Actions, pin third-party actions by full commit SHA. Pass untrusted event values through environment
  variables and quote them in shell scripts; do not interpolate expressions into executable shell text.
  Assess `pull_request_target`, `workflow_run`, reusable-workflow permissions, and token exposure as trust boundaries.
- In GitLab, inspect the merged configuration and `workflow`/job rules for duplicate and unintended pipelines.
  Protect sensitive variables and runner isolation. Verify cross-project `CI_JOB_TOKEN` allowlists.
- Prefer scoped OIDC federation to long-lived cloud credentials when supported. Verify audience, subject, environment,
  and deployment gates. Changes to trust policy require explicit authorization.
- Use artifacts for required job handoffs and caches only for acceleration. Bound retention, key caches appropriately,
  and ensure cache poisoning cannot cross trust levels. Set concurrency/cancellation only where cancellation is safe.
- Use configured local validation and existing tests. Do not push or trigger hosted CI merely to obtain evidence.
  Local checks do not prove hosted permissions, runner isolation, or branch protection.

Pause affected work for missing security decisions involving privileged triggers, public self-hosted runners,
credential exposure, or approval automation. Request separate security review for these high-risk changes.
Report actual checks, unresolved includes, and hosted verification limits.
