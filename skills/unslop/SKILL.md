---
name: unslop
description:
  Use when polishing or reviewing an interface with generic styling, weak hierarchy, distracting decoration, or
  repetitive copy, and when writing or tightening UI labels, hints, messages, confirmations, or empty states.
---

# Unslop

Make the interface easier to understand and use. Judge each change against the user's task and the actual product,
not a preferred visual fashion. Keep distinctive choices that work.

## Bound the work

Use this procedure within the current role, request, and permissions. Loading it does not authorize edits, purchases,
installation, publication, or changes to the product's capabilities.

- For a review, return findings and proposed changes without editing.
- For a copy request, work on text and its immediate presentation. Do not redesign the screen.
- For targeted polish, correct the observed defects using the existing components and design system.
- For a broader redesign, describe the intended hierarchy and visual approach before editing. Ask about consequential
  choices that the user has not delegated. Do not reopen choices already authorized.

Preserve functionality, factual meaning, required disclosures, navigation, section order, and established branding
unless the request explicitly permits changing them. Redundant text and decoration can be removed within an authorized
cleanup. Removing useful information or a capability requires separate scope agreement.

Use the current session's tools. This skill needs no external examples, downloaded instructions, or bundled scripts.
If a required tool is unavailable, state the resulting limit and complete the work that remains possible.

## Understand the screen

1. Identify the audience, their immediate goal, and the decisions the screen asks them to make.
2. Read the relevant source and inspect the rendered interface when available. Include nearby controls and the states
   that change their meaning: loading, empty, populated, invalid, failed, disabled, and completed.
3. Check the current design tokens, components, terminology, content requirements, and localization conventions.
4. Record concrete problems with their locations and effects. Distinguish observed defects from preferences and
   unverified assumptions. Do not infer that a feature is unnecessary because it is unfamiliar.
5. Choose the smallest set of changes that resolves those problems. A sound interface may need no change.

For a screenshot, assess only what it shows. Do not infer working interactions or hidden states. A URL review does not
authorize editing the live site. If an authorized reproduction is needed, distinguish it from the original product.

## Decide what the copy contributes

Evaluate a string in context before rewriting it. Check its consumers and the behavior it describes. Shorter wording
is useful only when people retain the information needed to understand, choose, act, and recover.

Choose one outcome for each problem:

| Outcome | Use it when |
| --- | --- |
| Keep | The text supplies necessary meaning, guidance, status, or an accessible name. |
| Cut | It adds no information beyond the surrounding interface or records an obsolete implementation detail. |
| Rewrite | It conveys something useful but is vague, repetitive, inaccurate, or unnecessarily complicated. |
| Move | It matters only in a particular state and can remain discoverable at the point of need. |

### Protect necessary information first

- Retain consequences, prerequisites, limits, compatibility requirements, permissions, and recovery instructions.
  Explain an irreversible or destructive effect before the user commits to it.
- Keep units, formats, comparison periods, and scope where a value or action would otherwise be ambiguous.
- Give unfamiliar features enough context for the intended audience. Do not assume expertise from a short label.
- Distinguish an empty result from loading, failure, filtering, and lack of access. Offer an available next step when
  it helps. Do not invent one.
- Preserve visible labels, accessible names, descriptions, and status announcements. A placeholder is not a label.
  Information may be necessary to assistive technology even when the visual interface conveys it elsewhere.
- Preserve required legal, privacy, security, and safety information. Flag questionable requirements rather than
  silently removing them.

### Remove repetition and unsupported reassurance

Check whether a caption merely repeats its heading, a hint restates its field, or several messages make the same point.
Remove the duplicate statement rather than replacing it with a shorter duplicate.

Separate present behavior from development history. Verify that an old limitation is gone before removing its warning.
Keep a current consequence or restriction even when a past defect prompted the explanation. Remove obsolete commentary
about the repair, internal debate, or implementation process.

Use direct descriptions instead of praise, hype, or reassurance without evidence. Preserve the product's terminology
and voice. Do not manufacture customer counts, endorsements, capabilities, results, or guarantees. If a claim is
unverified, flag it; remove it only within an authorized editing scope.

### Write and place the remaining text

- Name actions and outcomes precisely. Make destructive actions distinguishable from reversible ones.
- Use sentence case unless established terminology or brand rules require another form. Use punctuation for sentences,
  not decorative emphasis on short controls.
- Keep conditions, uncertainty, negation, and time relationships intact. Do not turn a possibility into a promise.
- Put a requirement before the affected action. Show state-specific help when the state occurs, without hiding
  essential information behind hover-only controls or an undiscoverable help icon.
- Preserve interpolation variables, plural rules, localization keys, and accessible relationships. Check shared string
  usages before changing them. Delete a now-unused hint element or property only after checking those dependencies.

Examples of decisions, with behavior verified first:

- A field labeled **Download attempts** has the hint **Number of download attempts**. Cut the hint, not the field label.
- **Clear offline drafts** has a warning that unsent drafts will be deleted. Keep the warning before confirmation.
- An upload action stops after the current file and retains completed files. State those effects if the action label
  does not make them clear. Do not replace them with a vague assurance that cancellation is safe.
- A compatibility note applies only to an older credential type. Keep it where users can identify affected credentials
  before acting. Do not remove it merely because most credentials are newer.

## Improve the visual presentation

Apply only the areas implicated by the audit. Do not run unrelated visual changes for a copy-only task.

### Hierarchy and layout

Make the main task, current state, and next action easy to locate. Group related information and separate unrelated
decisions. Align repeated elements consistently. Use the existing spacing scale and component variants rather than
adding isolated offsets.

Choose density for the task. A monitoring view may need compact, comparable rows; an introduction may need more room
for explanation. Do not replace every layout with equal cards, a centered hero, or a fixed sidebar recipe. Preserve
reading order and all required actions when adapting the layout to narrow screens.

Reduce competing emphasis. Reserve the strongest treatment for the most important decision or information. Use borders,
backgrounds, and spacing to communicate structure, not to make every container look equally important.

### Type, color, and controls

Reuse established fonts, text styles, colors, and icons. Consolidate accidental variations without replacing an
intentional design system. Keep labels readable at normal size and with text enlargement. Format comparable numbers
consistently; retain their units and context.

Check contrast against the actual background in each relevant state. For WCAG AA text contrast, use at least 4.5:1 for
ordinary text and 3:1 for qualifying large text. Check non-text contrast where applicable. Do not use color alone to
communicate an error, selection, or status.

Keep interactive targets usable for their input methods. Preserve visible keyboard focus, meaningful names, disabled
states, and distinctions between links and actions. Use consistent icon geometry and alignment. Remove an icon only
when it contributes nothing and its removal does not reduce comprehension or accessibility.

Treat gradients, shadows, badges, emoji, and decorative textures as choices to assess, not automatic defects. Retain
deliberate branding and useful signals. Remove treatments that obstruct reading, imply a false state, or compete with
the task without adding meaning.

### Data, images, and motion

Select a chart or other display for the question it answers. Preserve the values, comparisons, labels, scales, and
interactions users need. Do not improve appearance by omitting inconvenient data or inventing trends.

Prefer real product content when it explains the interface. Add artwork only for a clear communication purpose.
Reuse suitable project assets and respect their licensing. Keep functional UI and readable text in native components,
not embedded inside decorative images. Give informative images useful alternatives and decorative images empty ones.

Generate assets only with available tools and applicable authorization, including any cost approval. Save approved
assets through the project's normal workflow. If generation or an asset is unavailable, report the gap and offer a
feasible alternative. Do not present a placeholder, fabricated screenshot, or mock data as a finished real feature.

Use animation to explain a change or provide feedback. Remove distracting repetition and unnecessary movement.
Respect reduced-motion settings. Avoid expensive continuous work and layout shifts. Pause optional offscreen effects
and release their resources when the component is removed.

## Verify and report

Compare the changed interface with the original task and audit. Check that removed text carried no unique requirement
or meaning, rewritten text still describes the implementation, and moved text appears before it is needed.

Inspect the affected render and states with the available tools. Check responsive layout, text expansion, keyboard
navigation, accessible names, focus, contrast, and motion preferences where relevant. Exercise changed actions and
failure paths through the project's established checks. Follow the task's verification limits; do not invent tools or
claim unavailable checks passed.

Return the substantive changes and remaining findings. For copy findings, give `file:line` or a precise UI location,
the current text, the proposed outcome or replacement, and a short reason. Report only changed or problematic strings
unless a complete inventory was requested. State actual verification, missing evidence, and outstanding decisions.
Keep an unverified visual assessment separate from a rendered or interaction-tested result.
