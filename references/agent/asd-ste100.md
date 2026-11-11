# Technical Documentation Standard

Read this reference before creating or revising technical documentation.
Its scope includes READMEs, guides, API documentation, architecture documents, decision records, codemaps,
explanatory comments, and docstrings.

## Contents

- [Precedence and scope](#precedence-and-scope)
- [Writing defaults](#writing-defaults)
- [Repository terminology](#repository-terminology)
- [Review and formal compliance](#review-and-formal-compliance)
- [Official sources](#official-sources)

## Precedence and scope

Follow explicit task instructions and applicable repository documentation standards before these defaults.
Read scoped agent instructions, contribution guides, style guides, documentation templates, and terminology lists.
Honor their language, terminology, formatting, and documentation requirements.
For each choice they leave unspecified, apply the relevant default below.
An unrelated repository preference does not disable the remaining defaults.

These defaults adapt ASD-STE100 principles for software documentation.
They are a practical writing policy, not a complete reproduction of the official standard.
Formal ASD-STE100 compliance is required only when the user or repository explicitly requires it.
Use the formal-compliance procedure below for that scope.

Edit documentation within the current task only.
Preserve executable code, identifiers, commands, paths, URLs, literal values, and exact quotations.
Apply writing rules to the surrounding prose without changing technical meaning.
Preserve required documentation syntax, including comment tags and generated sections.
Do not apply conversational fragments to technical documentation.

## Writing defaults

### STE principles

Use these selected principles from the official Issue 9 rules:

- Prefer ordinary vocabulary and consistent technical terms. (Sections 1 and 9)
- Limit noun combinations to three words. Explain longer technical names. (Section 2)
- Favor simple verb constructions and action verbs. Retain necessary technical "-ing" terms. (Section 3)
- Identify who acts. Reserve descriptive passive constructions for unknown actors. (Rule 3.6)
- Keep sentence grammar complete. Use lists to organize complex information. (Section 4)
- Give commands separately, except actions that must occur simultaneously. (Rules 5.2 and 5.3)
- State prerequisites before the dependent command. Keep instructions outside informational notes. (Rules 5.4 and 5.5)
- Target 20 words per procedural sentence and 25 per descriptive sentence. (Rules 5.1 and 6.3)
- Organize each paragraph around one subject, with at most six sentences. (Section 6)
- Identify warnings clearly. State the required action or condition and its consequence. (Section 7)
- Replace prose semicolons with sentence breaks. (Rule 8.1)
- Choose direct wording over phrasal verbs. Rephrase sentences when word substitutions are insufficient. (Section 9)

### Software documentation safeguards

The software defaults use length targets and ordinary vocabulary without requiring a formal dictionary audit.
Shortening text must not alter its behavior or contract.
If a sentence needs extra words to remain accurate, keep them and explain a material exception in the task report.
Use the official rules and counting method instead when formal compliance is required.

- Distinguish user actions from automatic behavior. Never invent an actor or a missing implementation detail.
- Keep requirement strength, probability, time relationships, negation, and exceptions intact.
  For example, "The deployment might restart workers" does not mean that it always restarts them.
- Retain verb constructions needed to express those distinctions, even when a simpler form would be shorter.
- Preserve technical names and literal syntax. Do not rename an API to fit a vocabulary or noun-length preference.
- Keep different operations distinct. A test, a review, and an approval can have different meanings.
- When splitting text, preserve shared conditions, sequence, and simultaneous actions.
  Use numbering for required order and bullets for unordered items.
- Keep needed articles and connecting words. Resolve unclear pronouns and incomplete list items.
- Preserve relevant facts, measurements, qualifications, and causes. Remove unsupported claims and repeated filler.
- Use the repository's document structure. Add headings or comparison tables when they help readers locate information.

## Repository terminology

Read the current repository's terminology sources before proposing new entries.
The local list supplies technical vocabulary, preferred spellings, definitions, and scoped usage.
It supplements ordinary language guidance. It is not an exhaustive list of permitted English words.

Keep language and framework terms in their applicable scope, especially in a repository with multiple languages.
A language keyword, an API identifier, and a domain term can need different usage rules.
Preserve their exact spelling and case. Do not apply prose substitutions to code or identifiers.
Resolve competing definitions from current repository evidence, or report the ambiguity.
Do not mark an inferred entry as an approved formal STE term without the required review.

Use `/init-docs` when the user requests repository documentation setup or a terminology refresh.
By default, it adds local documentation rules and terminology to the work repository's `AGENTS.md`.
The user can supply another repository file or directory as the destination.
Ordinary documentation edits do not require initialization or a new glossary.
Keep project terms and overrides in the work repository, not in global OpenCode configuration.

## Review and formal compliance

Before rewriting, identify the facts, requirements, conditions, and uncertainty that must remain.
After rewriting, compare the meaning, including each action's actor and each condition's scope.
Check terminology, literal preservation, relevant links, and repository documentation checks.
Report the applied documentation policy and material exceptions when a task report is required.
Do not add compliance notices to the authored document unless requested.

When formal ASD-STE100 compliance is explicitly required:

1. Use the issue specified by the project or user. If none is specified, use Issue 9 (January 15, 2025).
2. Check the applicable official writing rules and dictionary, including approved meanings and parts of speech.
   Check the rules for technical nouns and verbs against the project's terminology decisions.
3. Use the official procedure for word counts and permitted exceptions.
   Do not substitute the flexible editing targets or exceptions in this adaptation.
4. If required references or checks are unavailable, report the missing evidence and unverified scope.
   Do not treat that scope as compliant or mark a required compliance gate as passed.

The official standard is authoritative for formal compliance.
If a repository override conflicts with it, report the conflict without silently overriding the repository's policy.
A summary, a structural linter, or a general language review cannot establish full compliance.
For ordinary use of these defaults, no formal compliance claim or dictionary download is required.

## Official sources

- [ASD-STE100 Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf):
  rules cited above and the dictionary.
- [About STE](https://www.asd-ste100.org/about_STE.html): structure and technical terminology.
- [Official downloads](https://www.asd-ste100.org/STE_downloads.html): obtain the applicable issue for formal checks.

This reference explains selected principles in our own words and defines their application to software documentation.
The local safeguards and precedence policy are project choices, not additional ASD rules.
Consult the official standard for its full requirements. The official dictionary is not reproduced here.
