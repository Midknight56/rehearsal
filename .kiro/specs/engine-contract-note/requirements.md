# Requirements: engine contract note

## Introduction

The engine entry point `simulate` in `src/simulation/simulate.ts` has no doc comment that states its contract. This spec adds one and adds a test that keeps it. Nothing the engine computes changes. Kiro does every task. The comment says only what `src/simulation/simulate.ts`, `.kiro/steering/units-and-determinism.md` and `docs/model-contract.md` already say.

## Requirements

### Requirement 1: a contract comment above `simulate`

**User story:** As a developer reading the engine entry point, I want its contract written directly above it, so that I know what to rely on without opening the steering files.

#### Acceptance criteria

1. THE SYSTEM SHALL carry a doc comment (`/** ... */`) directly above `export function simulate` in `src/simulation/simulate.ts`, with no code or blank line between the comment and the function.
2. THE SYSTEM SHALL state in that comment, in plain words, that time inside the engine is whole milliseconds.
3. THE SYSTEM SHALL state in that comment that the same scenario, replication and options give the same result byte for byte.
4. THE SYSTEM SHALL state in that comment that the engine never reads the wall clock.
5. THE SYSTEM SHALL state in that comment that `simulate` throws `ScenarioInvalidError` for a scenario the validator refuses.
6. THE SYSTEM SHALL contain no statement in the comment that the three source files above do not already make.

### Requirement 2: a test that keeps the comment

**User story:** As a maintainer, I want a test that fails when the contract comment is removed or loses a statement, so that the note stays true to its four points.

#### Acceptance criteria

1. THE SYSTEM SHALL provide `tests/model/engine-contract-note.test.ts`, which reads `src/simulation/simulate.ts` as text.
2. THE SYSTEM SHALL fail that test when the comment block directly above `export function simulate` is missing.
3. THE SYSTEM SHALL fail that test when that block lacks any of the words `milliseconds`, `byte for byte`, `wall clock` and `ScenarioInvalidError`.
4. THE SYSTEM SHALL write the test before the comment, and the test SHALL fail for the missing comment alone.

### Requirement 3: nothing the engine computes changes

**User story:** As the owner of the model, I want this change to leave every result as it is, so that no fixture or version moves.

#### Acceptance criteria

1. THE SYSTEM SHALL change in `src/simulation/simulate.ts` only the added comment lines.
2. THE SYSTEM SHALL leave `MODEL_VERSION` and `public/examples/harbor-hall/expected.json` as they are.
3. THE SYSTEM SHALL pass `npm run test:model` and `npm run verify` after the change.

### Requirement 4: the record

**User story:** As the owner, I want one log row for this spec, so that the work is on the record the same day.

#### Acceptance criteria

1. THE SYSTEM SHALL add one row to `docs/kiro-log.md` for this spec with the surface "Kiro IDE" and the real date of the day the task is run.
2. THE SYSTEM SHALL state in that row only checks that ran, and say "not recorded" for credits that were not read.
