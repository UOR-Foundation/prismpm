# Audit status, version 1

2026-11-20. Model: `src/App.lex.tex`, written by `tools/gen_audit.py`. A rule table, proved by `../ide-prove-rule-app.mjs` with this checkout's prism-code. Nothing is sent anywhere.

It is the first piece of phase 2 of the Prism IDE (`docs/proposals/prism-ide-phase-2.md`): the rule the audit view follows when it says what backs a guarantee.

## What it decides

What the audit view may say about one guarantee of one app: `proved`, `tested`, `refused` or `unknown`.

A request is five words, in order:

| Field | Values | Meaning |
|---|---|---|
| kernel | none, refused, accepted | what Lean's kernel, in this tab, said of the guarantee |
| kernelmodel | other, this | the model the kernel judged is the exact model on show |
| attestation | none, invalid, verified | the build's signed statement about the guarantee, as checked in this tab |
| attestedmodel | other, this | that statement names the exact model on show |
| vectors | none, failed, passed | the app's acceptance vectors, replayed in this tab through the running app |

Rules, first match decides:

1. the kernel refused it for this model → refused
2. the vectors failed → refused
3. the kernel accepted it for this model → proved
4. a verified attestation names this model → proved
5. the vectors passed → tested
6. otherwise → unknown

## Proved

Lean's kernel accepted all fourteen, for every request.

1. to 9. Without the kernel's acceptance of this model and without a verified attestation of this model, a guarantee is never shown as proved. "Without" is one of three things on each side (none, refused or another model; none, invalid or another model), so nine cases.
10. A guarantee the kernel refused for this model is always shown as refused.
11. Failing vectors always show refused.
12. Failing vectors never show proved, whatever proof exists.
13. A guarantee the kernel refused for this model is never shown as proved, whatever attestation exists.
14. With no vectors replayed, nothing is shown as tested.

Guarantees 1 to 9 are stated case by case because the kernel route does not settle guarantees written with "is not".

Model identity: `sha256:1d2bd362ffefbe0d853053654011fa6cfc5e4af010dab8bdd654418a5d02f962`.
Built app: `sha256:d820c942bcc01896fe0788b9acff4df6f9137808efea28905f5911d19f3d16cc`.

## Tested, not proved

12 of 12 acceptance vectors pass through the built judge.

## Not covered

The model proves what is said given the five words. Whether they are true is the page's job and is unproved: that the kernel judged the model on show, that the attestation's signature and subject were really checked, that the vectors ran through the app that is running.
"This model" means equality of the model's semantic identity. Computing that identity is LexLean's.
One guarantee per request. A page that shows a summary ("13 guarantees hold") must ask for each.
No page uses this model yet.
