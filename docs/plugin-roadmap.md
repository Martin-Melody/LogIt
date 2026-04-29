# Plugin Roadmap

This roadmap is for the plugin architecture foundation on `feat/plugin-foundation-ui`.

## Goal

Let the community build and share:

- home widgets
- progression algorithms
- exercise packs
- analytics modules

The key design constraint is safety. Discovery can be federated, but installation should remain explicit and reviewable.

## Phase 1: Contract and Trust Model

Define the core plugin schema and compatibility rules.

- manifest shape
- plugin family taxonomy
- versioning and compatibility fields
- distribution metadata
- federation metadata for ActivityPub-compatible discovery
- trust and signing fields

Deliverables:

- stable plugin manifest types
- local catalog for built-in plugins
- install state model
- compatibility rules for app versions and plugin versions

## Phase 2: Discovery and Import

Let the app discover plugins from external sources without loading code yet.

- import by manifest URL
- import by fediverse actor or post metadata
- review screen before install
- enabled/disabled state management

Deliverables:

- plugin import UI
- plugin detail UI
- installed plugin list
- discovery adapter interface

## Phase 3: Runtime Loading

Turn installed manifests into actual app capabilities.

- widget rendering
- progression algorithm lookup
- exercise pack registration
- analytics plugin hooks

Deliverables:

- runtime registry abstraction
- safe loading boundary
- fallback when a plugin is unavailable or invalid

## Phase 4: Exercise Packs and Analytics

Extend the same system beyond widgets and progression.

- community exercise bundles
- analytics modules
- optional metadata enrichment

Deliverables:

- shared schema for exercise packs
- analytics plugin interface
- migration/versioning strategy for plugin-owned data

## Phase 5: Federation and Publishing

Add the social/distribution layer once the local model is solid.

- ActivityPub-compatible plugin actor
- plugin announcement posts
- manifest discovery from federated sources
- update notifications
- moderation and trust signals

Deliverables:

- publish workflow
- discovery crawler or inbox processor
- plugin verification policy

## Proposed Next Work Item

Build the import/review path for plugin manifests.

That is the smallest step that proves the architecture without committing us to the runtime loading model too early.

