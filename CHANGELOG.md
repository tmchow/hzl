# [2.5.0](https://github.com/tmchow/hzl/compare/v2.4.0...v2.5.0) (2026-03-02)


### Features

* add --lease to steal and improve hooks documentation ([#164](https://github.com/tmchow/hzl/issues/164)) ([656523f](https://github.com/tmchow/hzl/commit/656523f81ef8f459ae978dcee30e5b609c79e11c))

# [2.4.0](https://github.com/tmchow/hzl/compare/v2.3.0...v2.4.0) (2026-03-01)


### Bug Fixes

* **core:** add field whitelist validation to tasks-current projector ([#151](https://github.com/tmchow/hzl/issues/151)) ([f6c12f2](https://github.com/tmchow/hzl/commit/f6c12f2ca296c892c4ab25a1768eec71453f7c80))
* **web:** move settings gear from header-left to filter bar ([#156](https://github.com/tmchow/hzl/issues/156)) ([a41fffd](https://github.com/tmchow/hzl/commit/a41fffd1ecf29d65ae59f58ba670c0600482ea9b))
* **web:** resolve PWA manifest icon and screenshot warnings ([#158](https://github.com/tmchow/hzl/issues/158)) ([d466b88](https://github.com/tmchow/hzl/commit/d466b8899031d44f18619d52a763ebf3e0913509))


### Features

* **core:** add atomic event pruning with safety triggers ([#146](https://github.com/tmchow/hzl/issues/146)) ([5f8c23b](https://github.com/tmchow/hzl/commit/5f8c23b1e8d3ce0d1f2798ef6e2c39c299694800))
* **core:** add event schema versioning with upcaster registry ([#145](https://github.com/tmchow/hzl/issues/145)) ([a3dcec2](https://github.com/tmchow/hzl/commit/a3dcec2617b19fdd20ad177bd26e888afe3c9f0b))
* **core:** add status transition matrix with validation ([#152](https://github.com/tmchow/hzl/issues/152)) ([2f2c7ab](https://github.com/tmchow/hzl/commit/2f2c7abcc93ed73decbe8d539f12510af9335fa8))
* **web:** add tag chips, filtering, and card redesign ([#159](https://github.com/tmchow/hzl/issues/159)) ([693ea76](https://github.com/tmchow/hzl/commit/693ea767990fdb8ece040adf08e2b8a2f7c4493c))
* **web:** React + Vite scaffold with build pipeline and API layer ([#154](https://github.com/tmchow/hzl/issues/154)) ([02fb4d6](https://github.com/tmchow/hzl/commit/02fb4d6c99e6ddffe08f03b808300c12682ca206))
* **web:** wire FTS5 search API to dashboard ([#157](https://github.com/tmchow/hzl/issues/157)) ([43fd26b](https://github.com/tmchow/hzl/commit/43fd26b38e4186114ccdd4c42a1d9d2780aad466))


### Performance Improvements

* **core:** replace busy-wait with Atomics.wait in transaction retry ([#150](https://github.com/tmchow/hzl/issues/150)) ([03022e1](https://github.com/tmchow/hzl/commit/03022e1c7327815fb6e1a0a97285742a56dbc359))

# [2.3.0](https://github.com/tmchow/hzl/compare/v2.2.0...v2.3.0) (2026-03-01)


### Bug Fixes

* **cli:** make parsing tolerant and output-consistent ([#142](https://github.com/tmchow/hzl/issues/142)) ([44619de](https://github.com/tmchow/hzl/commit/44619debcc948ed2690d8683b71e56833cb81b53))


### Features

* harden dev safety and automate OpenClaw skill publishing ([#141](https://github.com/tmchow/hzl/issues/141)) ([693e9e6](https://github.com/tmchow/hzl/commit/693e9e665ee88a1af2f4fabd4b10a228f5cbbc9b))
* optimize CLI output for agent workflows ([#144](https://github.com/tmchow/hzl/issues/144)) ([803e878](https://github.com/tmchow/hzl/commit/803e8780d2dc80eb1d8100e664177545f5ed265d))

# [2.2.0](https://github.com/tmchow/hzl/compare/v2.1.0...v2.2.0) (2026-02-28)


### Bug Fixes

* correct projection registration, subtask move logic, and update atomicity ([#138](https://github.com/tmchow/hzl/issues/138)) ([ceee25f](https://github.com/tmchow/hzl/commit/ceee25f8bbd4207befa5285fe263ef618d5562ac))


### Features

* improve CLI reliability, validation, and docs parity ([#133](https://github.com/tmchow/hzl/issues/133)) ([d3f0bd0](https://github.com/tmchow/hzl/commit/d3f0bd04ba2c592653f62bbc0746239af8e72941))
* **web:** add collapsible parent controls and dashboard UI polish ([#134](https://github.com/tmchow/hzl/issues/134)) ([00b2e3d](https://github.com/tmchow/hzl/commit/00b2e3d88a28ba389a1e8bf7900446d312657b40))
* **web:** add dashboard PWA support and install docs ([#135](https://github.com/tmchow/hzl/issues/135)) ([e055310](https://github.com/tmchow/hzl/commit/e055310b97352fadc695bf6ff4e6c0934dd865e2))


### Performance Improvements

* transaction-wrap rebuild and narrow listTasks SELECT ([#132](https://github.com/tmchow/hzl/issues/132)) ([4a79966](https://github.com/tmchow/hzl/commit/4a79966b5304cdb67ce0bd4054d120809a971d25))

# [2.1.0](https://github.com/tmchow/hzl/compare/v2.0.0...v2.1.0) (2026-02-27)


### Bug Fixes

* resolve lint enum comparison and rejection issues ([#127](https://github.com/tmchow/hzl/issues/127)) ([af13a03](https://github.com/tmchow/hzl/commit/af13a0390857a025c434a16683e4e1558787562c))


### Features

* add workflows, hooks, cross-project deps, and OpenClaw docs overhaul ([#129](https://github.com/tmchow/hzl/issues/129)) ([a571e61](https://github.com/tmchow/hzl/commit/a571e612df3868c68b842b1e730b08a8a69e195a)), closes [Hi#level](https://github.com/Hi/issues/level)

# [2.0.0](https://github.com/tmchow/hzl/compare/v1.34.1...v2.0.0) (2026-02-27)

## [1.34.1](https://github.com/tmchow/hzl/compare/v1.34.0...v1.34.1) (2026-02-27)


### Bug Fixes

* **ci:** avoid github-script actions method mismatch ([#125](https://github.com/tmchow/hzl/issues/125)) ([d70c23c](https://github.com/tmchow/hzl/commit/d70c23c68320edd46a8510fe41b7d1d1e865f196))
* **ci:** harden release CI guard lookup ([#124](https://github.com/tmchow/hzl/issues/124)) ([a6b1732](https://github.com/tmchow/hzl/commit/a6b1732914988c4a28df30b727c9b42a7004b9b1))
* **ci:** restore OIDC auth for release dry-run ([#123](https://github.com/tmchow/hzl/issues/123)) ([2476e66](https://github.com/tmchow/hzl/commit/2476e66ead9225b4383a76a7e4c9f542aa8c52dd))

# [1.34.0](https://github.com/tmchow/hzl/compare/v1.33.1...v1.34.0) (2026-02-26)


### Features

* **web:** deliver live assignee-centric dashboard workflow ([#120](https://github.com/tmchow/hzl/issues/120)) ([5f3b491](https://github.com/tmchow/hzl/commit/5f3b491008c99811436a04e7bd727b55d1b610ac))

## [1.33.1](https://github.com/tmchow/hzl/compare/v1.33.0...v1.33.1) (2026-02-25)


### Bug Fixes

* **web:** add missing event detail handlers in activity feed ([#119](https://github.com/tmchow/hzl/issues/119)) ([2803f2a](https://github.com/tmchow/hzl/commit/2803f2a56ac020382fd250dd9ae171665a23f3a3)), closes [#118](https://github.com/tmchow/hzl/issues/118)

# [1.33.0](https://github.com/tmchow/hzl/compare/v1.32.0...v1.33.0) (2026-02-25)


### Features

* **task:** add assignment attribution, activity history, and assignee filters ([#118](https://github.com/tmchow/hzl/issues/118)) ([9c94c4e](https://github.com/tmchow/hzl/commit/9c94c4e57d040a5751215ac87ad43c7986b2a308))

# [1.32.0](https://github.com/tmchow/hzl/compare/v1.31.0...v1.32.0) (2026-02-14)


### Features

* standardize -P flag, add --claim to task next, improve guide examples ([#116](https://github.com/tmchow/hzl/issues/116)) ([240b614](https://github.com/tmchow/hzl/commit/240b6140d04bdcdb4ee887b792b4df2cbb8ffe19))

# [1.31.0](https://github.com/tmchow/hzl/compare/v1.30.0...v1.31.0) (2026-02-13)


### Features

* add --allow-framing flag to serve command ([#112](https://github.com/tmchow/hzl/issues/112)) ([a27d8bc](https://github.com/tmchow/hzl/commit/a27d8bc5e2ea2b3cd4652b8cd39389c8301d51e1))

# [1.30.0](https://github.com/tmchow/hzl/compare/v1.29.0...v1.30.0) (2026-02-11)


### Features

* add calendar month view to web dashboard ([#111](https://github.com/tmchow/hzl/issues/111)) ([1a4071e](https://github.com/tmchow/hzl/commit/1a4071e8951f69b91c5ca9d2663c93eca59e8ebf))

# [1.29.0](https://github.com/tmchow/hzl/compare/v1.28.3...v1.29.0) (2026-02-09)


### Features

* add --deep flag, task ID prefix resolution, and adaptive short IDs ([#110](https://github.com/tmchow/hzl/issues/110)) ([e96302b](https://github.com/tmchow/hzl/commit/e96302b4b271c7441979f905a1905a339577dc42))

## [1.28.3](https://github.com/tmchow/hzl/compare/v1.28.2...v1.28.3) (2026-02-09)

## [1.28.2](https://github.com/tmchow/hzl/compare/v1.28.1...v1.28.2) (2026-02-09)

## [1.28.1](https://github.com/tmchow/hzl/compare/v1.28.0...v1.28.1) (2026-02-09)

# [1.28.0](https://github.com/tmchow/hzl/compare/v1.27.0...v1.28.0) (2026-02-09)


### Features

* keep hzl skill in repo, migrate workflow skills to tmc-marketplace ([#108](https://github.com/tmchow/hzl/issues/108)) ([f334958](https://github.com/tmchow/hzl/commit/f334958a4d41ffc90d50301447069db083770777))

# [1.27.0](https://github.com/tmchow/hzl/compare/v1.26.1...v1.27.0) (2026-02-05)


### Features

* detect existing HZL policy in install script ([#103](https://github.com/tmchow/hzl/issues/103)) ([46e191e](https://github.com/tmchow/hzl/commit/46e191eb4d6dd6c7ea7c8b263bc106c37c49cd65))

## [1.26.1](https://github.com/tmchow/hzl/compare/v1.26.0...v1.26.1) (2026-02-05)

# [1.26.0](https://github.com/tmchow/hzl/compare/v1.25.3...v1.26.0) (2026-02-04)


### Features

* add one-liner install script ([#101](https://github.com/tmchow/hzl/issues/101)) ([d30cc8f](https://github.com/tmchow/hzl/commit/d30cc8f458b3b44bfca4e8207d6e9bbf69538563))

## [1.25.3](https://github.com/tmchow/hzl/compare/v1.25.2...v1.25.3) (2026-02-04)


### Bug Fixes

* **docs:** move openclaw files to top-level, fix --author to --assignee ([#100](https://github.com/tmchow/hzl/issues/100)) ([ac1dc2b](https://github.com/tmchow/hzl/commit/ac1dc2bd01349e75bf2283de6c31d348c8daf76c))

## [1.25.2](https://github.com/tmchow/hzl/compare/v1.25.1...v1.25.2) (2026-02-04)


### Bug Fixes

* **docs:** use short policy snippet in README drop-in section ([#99](https://github.com/tmchow/hzl/issues/99)) ([08817c1](https://github.com/tmchow/hzl/commit/08817c1101d3ac29b3a55caaf01dc7673ae9a6e5))

## [1.25.1](https://github.com/tmchow/hzl/compare/v1.25.0...v1.25.1) (2026-02-04)


### Bug Fixes

* **docs:** update snippet markers to new paths ([#98](https://github.com/tmchow/hzl/issues/98)) ([ed16744](https://github.com/tmchow/hzl/commit/ed16744d6e504c7f7c33257e15720c38a5a8b303))

# [1.25.0](https://github.com/tmchow/hzl/compare/v1.24.1...v1.25.0) (2026-02-04)


### Features

* **cli:** add `hzl guide` command for workflow documentation ([#97](https://github.com/tmchow/hzl/issues/97)) ([c0d7492](https://github.com/tmchow/hzl/commit/c0d7492f53076049f50c4ac86c188148936a53c3))

## [1.24.1](https://github.com/tmchow/hzl/compare/v1.24.0...v1.24.1) (2026-02-04)

# [1.24.0](https://github.com/tmchow/hzl/compare/v1.23.0...v1.24.0) (2026-02-04)


### Features

* **cli:** add --links flag to task add and update commands ([#95](https://github.com/tmchow/hzl/issues/95)) ([d93c337](https://github.com/tmchow/hzl/commit/d93c337a08961b9e1f72a8b6a90b99d5b9d41fd6))

# [1.23.0](https://github.com/tmchow/hzl/compare/v1.22.1...v1.23.0) (2026-02-04)


### Features

* **web:** add markdown rendering for task descriptions ([#94](https://github.com/tmchow/hzl/issues/94)) ([09be69d](https://github.com/tmchow/hzl/commit/09be69d088a4294ce0fafb26fd960d46951e0e50))

## [1.22.1](https://github.com/tmchow/hzl/compare/v1.22.0...v1.22.1) (2026-02-04)


### Bug Fixes

* use 4-backtick code fences for nested snippet wrapping ([#93](https://github.com/tmchow/hzl/issues/93)) ([5cd9f76](https://github.com/tmchow/hzl/commit/5cd9f76670be27e331eb0a5b3f272db3ee8f9cd8))

# [1.22.0](https://github.com/tmchow/hzl/compare/v1.21.0...v1.22.0) (2026-02-04)


### Features

* add explicit command reference to agent-policy for skill-less agents ([#92](https://github.com/tmchow/hzl/issues/92)) ([d39f79f](https://github.com/tmchow/hzl/commit/d39f79f5b2c0cc738198c03010ec27d527f2b7c7))

# [1.21.0](https://github.com/tmchow/hzl/compare/v1.20.1...v1.21.0) (2026-02-04)


### Features

* add `task start` as alias for `task claim` ([#91](https://github.com/tmchow/hzl/issues/91)) ([91581a6](https://github.com/tmchow/hzl/commit/91581a6bf7540e5bdf43d4776323777c463bb49e))

## [1.20.1](https://github.com/tmchow/hzl/compare/v1.20.0...v1.20.1) (2026-02-04)


### Bug Fixes

* add GEMINI.md and broaden HZL usage guidance ([#90](https://github.com/tmchow/hzl/issues/90)) ([fe9a3e7](https://github.com/tmchow/hzl/commit/fe9a3e70fbdc9504b64dabf9762c4245599f890b))

# [1.20.0](https://github.com/tmchow/hzl/compare/v1.19.2...v1.20.0) (2026-02-04)


### Features

* **web:** improve task modal with tabs, pagination, and progress display ([#89](https://github.com/tmchow/hzl/issues/89)) ([d339232](https://github.com/tmchow/hzl/commit/d33923217592e1905d17bceefb140108d71dbea3))

## [1.19.2](https://github.com/tmchow/hzl/compare/v1.19.1...v1.19.2) (2026-02-04)

## [1.19.1](https://github.com/tmchow/hzl/compare/v1.19.0...v1.19.1) (2026-02-04)


### Bug Fixes

* specify pnpm lock file path in setup-node cache config ([#87](https://github.com/tmchow/hzl/issues/87)) ([94ff4fd](https://github.com/tmchow/hzl/commit/94ff4fd3c24fc6989fe60ae96b96236e21dc1b4b)), closes [#issue](https://github.com/tmchow/hzl/issues/issue)

# [1.19.0](https://github.com/tmchow/hzl/compare/v1.18.8...v1.19.0) (2026-02-03)


### Features

* **web:** enhance subtask display with filtered counts and visual styling ([#85](https://github.com/tmchow/hzl/issues/85)) ([1d3a332](https://github.com/tmchow/hzl/commit/1d3a332dd3a14e42ef21e2f429e42c7da181cdad))

## [1.18.8](https://github.com/tmchow/hzl/compare/v1.18.7...v1.18.8) (2026-02-03)


### Bug Fixes

* show all projects in web dashboard project chooser ([#84](https://github.com/tmchow/hzl/issues/84)) ([5dcee3c](https://github.com/tmchow/hzl/commit/5dcee3ccf5796a906d328552a3bcde2434594d74))

## [1.18.7](https://github.com/tmchow/hzl/compare/v1.18.6...v1.18.7) (2026-02-03)


### Bug Fixes

* replace workspace:* deps before npm publish ([#83](https://github.com/tmchow/hzl/issues/83)) ([dfb9f6f](https://github.com/tmchow/hzl/commit/dfb9f6f91c67fb11cdb68d4ba2be0bd34dbe97a6))

## [1.18.6](https://github.com/tmchow/hzl/compare/v1.18.5...v1.18.6) (2026-02-03)


### Bug Fixes

* prevent project sprawl with tiered documentation and explicit guidance ([#82](https://github.com/tmchow/hzl/issues/82)) ([5700d07](https://github.com/tmchow/hzl/commit/5700d07d4bc8358e7a655475c7fa0f796f6454fc))

## [1.18.5](https://github.com/tmchow/hzl/compare/v1.18.4...v1.18.5) (2026-02-03)


### Bug Fixes

* **db:** handle zero-event schema migration safely ([#81](https://github.com/tmchow/hzl/issues/81)) ([733d77c](https://github.com/tmchow/hzl/commit/733d77c2d700fa7f4ff0777bbffa60674bcaddbb))

## [1.18.4](https://github.com/tmchow/hzl/compare/v1.18.3...v1.18.4) (2026-02-03)


### Performance Improvements

* optimize query performance in search and task service ([#80](https://github.com/tmchow/hzl/issues/80)) ([5436f68](https://github.com/tmchow/hzl/commit/5436f68781144e303aa5bd4ddb0534291cef2e16))

## [1.18.3](https://github.com/tmchow/hzl/compare/v1.18.2...v1.18.3) (2026-02-03)


### Bug Fixes

* add git+ prefix to repository URLs in package.json ([4c50c0f](https://github.com/tmchow/hzl/commit/4c50c0f1e23f876be769f9a71f3f7828454c5f1a))

## [1.18.2](https://github.com/tmchow/hzl/compare/v1.18.1...v1.18.2) (2026-02-03)

## [1.18.1](https://github.com/tmchow/hzl/compare/v1.18.0...v1.18.1) (2026-02-03)


### Bug Fixes

* **ci:** clear token env vars for OIDC publishing ([0ff726d](https://github.com/tmchow/hzl/commit/0ff726dd9304a9ff336466b66b6f5f7b436cd37a))
* **ci:** remove registry-url to enable OIDC Trusted Publishing ([9c179e6](https://github.com/tmchow/hzl/commit/9c179e65a76a880acaf669db591b41efaa5f00b7))
* **ci:** upgrade npm to 11.5.1+ for OIDC Trusted Publishing ([415794a](https://github.com/tmchow/hzl/commit/415794a162491662f7ebefec95a5b8c05326dbdb))
* **ci:** use npx instead of pnpm exec for semantic-release ([#79](https://github.com/tmchow/hzl/issues/79)) ([bfc5c77](https://github.com/tmchow/hzl/commit/bfc5c77e39da41f54855ccd6dbacece106f55ea1)), closes [#78](https://github.com/tmchow/hzl/issues/78)
* **ci:** use OIDC Trusted Publishing instead of NPM_TOKEN ([7da5c25](https://github.com/tmchow/hzl/commit/7da5c25bc15a1fad9bdf6a15716d45bef5da0c47))
* **ci:** use unset instead of empty string for OIDC ([ad4d562](https://github.com/tmchow/hzl/commit/ad4d56223a08682f6661faf72d37d61f25741431))

## [1.18.1](https://github.com/tmchow/hzl/compare/v1.18.0...v1.18.1) (2026-02-03)


### Bug Fixes

* **ci:** clear token env vars for OIDC publishing ([0ff726d](https://github.com/tmchow/hzl/commit/0ff726dd9304a9ff336466b66b6f5f7b436cd37a))
* **ci:** remove registry-url to enable OIDC Trusted Publishing ([9c179e6](https://github.com/tmchow/hzl/commit/9c179e65a76a880acaf669db591b41efaa5f00b7))
* **ci:** use npx instead of pnpm exec for semantic-release ([#79](https://github.com/tmchow/hzl/issues/79)) ([bfc5c77](https://github.com/tmchow/hzl/commit/bfc5c77e39da41f54855ccd6dbacece106f55ea1)), closes [#78](https://github.com/tmchow/hzl/issues/78)
* **ci:** use OIDC Trusted Publishing instead of NPM_TOKEN ([7da5c25](https://github.com/tmchow/hzl/commit/7da5c25bc15a1fad9bdf6a15716d45bef5da0c47))
* **ci:** use unset instead of empty string for OIDC ([ad4d562](https://github.com/tmchow/hzl/commit/ad4d56223a08682f6661faf72d37d61f25741431))

## [1.18.1](https://github.com/tmchow/hzl/compare/v1.18.0...v1.18.1) (2026-02-03)


### Bug Fixes

* **ci:** clear token env vars for OIDC publishing ([0ff726d](https://github.com/tmchow/hzl/commit/0ff726dd9304a9ff336466b66b6f5f7b436cd37a))
* **ci:** use npx instead of pnpm exec for semantic-release ([#79](https://github.com/tmchow/hzl/issues/79)) ([bfc5c77](https://github.com/tmchow/hzl/commit/bfc5c77e39da41f54855ccd6dbacece106f55ea1)), closes [#78](https://github.com/tmchow/hzl/issues/78)
* **ci:** use OIDC Trusted Publishing instead of NPM_TOKEN ([7da5c25](https://github.com/tmchow/hzl/commit/7da5c25bc15a1fad9bdf6a15716d45bef5da0c47))
* **ci:** use unset instead of empty string for OIDC ([ad4d562](https://github.com/tmchow/hzl/commit/ad4d56223a08682f6661faf72d37d61f25741431))

## [1.18.1](https://github.com/tmchow/hzl/compare/v1.18.0...v1.18.1) (2026-02-03)


### Bug Fixes

* **ci:** clear token env vars for OIDC publishing ([0ff726d](https://github.com/tmchow/hzl/commit/0ff726dd9304a9ff336466b66b6f5f7b436cd37a))
* **ci:** use npx instead of pnpm exec for semantic-release ([#79](https://github.com/tmchow/hzl/issues/79)) ([bfc5c77](https://github.com/tmchow/hzl/commit/bfc5c77e39da41f54855ccd6dbacece106f55ea1)), closes [#78](https://github.com/tmchow/hzl/issues/78)
* **ci:** use OIDC Trusted Publishing instead of NPM_TOKEN ([7da5c25](https://github.com/tmchow/hzl/commit/7da5c25bc15a1fad9bdf6a15716d45bef5da0c47))

## [1.18.1](https://github.com/tmchow/hzl/compare/v1.18.0...v1.18.1) (2026-02-03)


### Bug Fixes

* **ci:** use npx instead of pnpm exec for semantic-release ([#79](https://github.com/tmchow/hzl/issues/79)) ([bfc5c77](https://github.com/tmchow/hzl/commit/bfc5c77e39da41f54855ccd6dbacece106f55ea1)), closes [#78](https://github.com/tmchow/hzl/issues/78)
* **ci:** use OIDC Trusted Publishing instead of NPM_TOKEN ([7da5c25](https://github.com/tmchow/hzl/commit/7da5c25bc15a1fad9bdf6a15716d45bef5da0c47))

## [1.18.1](https://github.com/tmchow/hzl/compare/v1.18.0...v1.18.1) (2026-02-03)


### Bug Fixes

* **ci:** use npx instead of pnpm exec for semantic-release ([#79](https://github.com/tmchow/hzl/issues/79)) ([bfc5c77](https://github.com/tmchow/hzl/commit/bfc5c77e39da41f54855ccd6dbacece106f55ea1)), closes [#78](https://github.com/tmchow/hzl/issues/78)

# [1.18.0](https://github.com/tmchow/hzl/compare/v1.17.1...v1.18.0) (2026-02-03)


### Features

* migrate from npm to pnpm workspaces ([#78](https://github.com/tmchow/hzl/issues/78)) ([20fab15](https://github.com/tmchow/hzl/commit/20fab150b639f8aa20c8d2707d18cf00c73e8374))

## [1.17.1](https://github.com/tmchow/hzl/compare/v1.17.0...v1.17.1) (2026-02-03)

# [1.17.0](https://github.com/tmchow/hzl/compare/v1.16.2...v1.17.0) (2026-02-03)


### Features

* **web:** Add Graph Orchard View to dashboard ([#76](https://github.com/tmchow/hzl/issues/76)) ([9fca548](https://github.com/tmchow/hzl/commit/9fca548bf8b1d6921825e121dbfd41e0308452f7))

## [1.16.2](https://github.com/tmchow/hzl/compare/v1.16.1...v1.16.2) (2026-02-03)


### Bug Fixes

* run cache migrations before schema to fix upgrade failure ([#75](https://github.com/tmchow/hzl/issues/75)) ([062ec5a](https://github.com/tmchow/hzl/commit/062ec5a2eaa9206c11a18e3d50c2fd21925799dc))

## [1.16.1](https://github.com/tmchow/hzl/compare/v1.16.0...v1.16.1) (2026-02-03)

# [1.16.0](https://github.com/tmchow/hzl/compare/v1.15.0...v1.16.0) (2026-02-03)


### Features

* **pruning:** add task prune command for cleaning old tasks ([#73](https://github.com/tmchow/hzl/issues/73)) ([30f1e2c](https://github.com/tmchow/hzl/commit/30f1e2cb29c85f5e43c646e25ed4a359143d134b))

# [1.15.0](https://github.com/tmchow/hzl/compare/v1.14.1...v1.15.0) (2026-02-03)


### Features

* **web:** responsive Kanban columns with visibility toggle ([#72](https://github.com/tmchow/hzl/issues/72)) ([3569cf0](https://github.com/tmchow/hzl/commit/3569cf0e9408b54a885af3b199cb6651b54842e5))

## [1.14.1](https://github.com/tmchow/hzl/compare/v1.14.0...v1.14.1) (2026-02-03)


### Bug Fixes

* **ci:** trigger homebrew update directly from release workflow ([#70](https://github.com/tmchow/hzl/issues/70)) ([96bf72d](https://github.com/tmchow/hzl/commit/96bf72d80f7f633757782708acf862dccbff0fde))
* include assignee in TaskCreated event data ([#71](https://github.com/tmchow/hzl/issues/71)) ([752cc18](https://github.com/tmchow/hzl/commit/752cc1856d2a23763c9c09522e6334973954f055))

# [1.14.0](https://github.com/tmchow/hzl/compare/v1.13.2...v1.14.0) (2026-02-03)


### Bug Fixes

* **ci:** use ubuntu-latest for homebrew update workflow ([f66871e](https://github.com/tmchow/hzl/commit/f66871e2fbb417487da195932c203aabfd415188))


### Features

* **ci:** add workflow_dispatch to homebrew update for manual testing ([50ffa4f](https://github.com/tmchow/hzl/commit/50ffa4f7d206fc9f07c538fa4da637acb18f6388))

## [1.13.2](https://github.com/tmchow/hzl/compare/v1.13.1...v1.13.2) (2026-02-02)


### Bug Fixes

* **ci:** use GitHub-hosted runner for release workflow ([#68](https://github.com/tmchow/hzl/issues/68)) ([5dd2218](https://github.com/tmchow/hzl/commit/5dd22185b56c1fc4f1b20381f542331408050ac8))
* include plugin.json in release assets ([#69](https://github.com/tmchow/hzl/issues/69)) ([c5f18fb](https://github.com/tmchow/hzl/commit/c5f18fba0a4784baa9dfe04264147d4581bb9654))

## [1.13.1](https://github.com/tmchow/hzl/compare/v1.13.0...v1.13.1) (2026-02-02)


### Bug Fixes

* **ci:** optimize workflows with caching and deduplication ([#67](https://github.com/tmchow/hzl/issues/67)) ([24e83b6](https://github.com/tmchow/hzl/commit/24e83b6302c2f1546ea98f7f455dbe9b0c2432d4))

# [1.13.0](https://github.com/tmchow/hzl/compare/v1.12.5...v1.13.0) (2026-02-02)


### Bug Fixes

* **web:** reorder blocked column after in_progress ([#64](https://github.com/tmchow/hzl/issues/64)) ([8ac557e](https://github.com/tmchow/hzl/commit/8ac557e950f8efed182a4670ad2eca336e8f957f))


### Features

* Add Codex skill support with repo restructure ([#65](https://github.com/tmchow/hzl/issues/65)) ([ba38abf](https://github.com/tmchow/hzl/commit/ba38abf8e6d3eec45064613e0509f63e378a4d09))

## [1.12.5](https://github.com/tmchow/hzl/compare/v1.12.4...v1.12.5) (2026-02-02)


### Bug Fixes

* Add Claude Code marketplace setup to documentation ([#63](https://github.com/tmchow/hzl/issues/63)) ([6aa14a5](https://github.com/tmchow/hzl/commit/6aa14a5e29665a4f51f30714ea30606d6ea374e9))

## [1.12.4](https://github.com/tmchow/hzl/compare/v1.12.3...v1.12.4) (2026-02-02)


### Bug Fixes

* Claude Code marketplace structure and install instructions ([#62](https://github.com/tmchow/hzl/issues/62)) ([51915c4](https://github.com/tmchow/hzl/commit/51915c41fd1c52f3c0ed2f5f8b4915d91bcb01aa))

## [1.12.3](https://github.com/tmchow/hzl/compare/v1.12.2...v1.12.3) (2026-02-02)

## [1.12.2](https://github.com/tmchow/hzl/compare/v1.12.1...v1.12.2) (2026-02-02)

## [1.12.1](https://github.com/tmchow/hzl/compare/v1.12.0...v1.12.1) (2026-02-02)

# [1.12.0](https://github.com/tmchow/hzl/compare/v1.11.2...v1.12.0) (2026-02-02)


### Features

* implement task properties (assignee, progress, blocked) ([#58](https://github.com/tmchow/hzl/issues/58)) ([5a9e5f5](https://github.com/tmchow/hzl/commit/5a9e5f51b7fa407b4bcefd84f676bbb33196f31e))

## [1.11.2](https://github.com/tmchow/hzl/compare/v1.11.1...v1.11.2) (2026-02-02)

## [1.11.1](https://github.com/tmchow/hzl/compare/v1.11.0...v1.11.1) (2026-02-02)

# [1.11.0](https://github.com/tmchow/hzl/compare/v1.10.0...v1.11.0) (2026-02-02)


### Bug Fixes

* **ci:** reorder release plugins to fix lockfile update ([#55](https://github.com/tmchow/hzl/issues/55)) ([d4aa77c](https://github.com/tmchow/hzl/commit/d4aa77cdce2a73d298182acbad7c6f0ac38bdc8b))
* **ci:** resolve release workflow race condition with doc-sync ([#54](https://github.com/tmchow/hzl/issues/54)) ([006e530](https://github.com/tmchow/hzl/commit/006e530c605e96a0a3d862984277c5800de0dbea))
* enable patch releases for docs and chore commits ([#48](https://github.com/tmchow/hzl/issues/48)) ([34ba8fd](https://github.com/tmchow/hzl/commit/34ba8fd36b85c51f9818b92e2d3a3ba3fcf9de0e))
* include package-lock.json in release commits ([#47](https://github.com/tmchow/hzl/issues/47)) ([28c3aab](https://github.com/tmchow/hzl/commit/28c3aab4e61c0d68c4a4963f53dae5e4f03b7003))


### Features

* add README include system for reusable documentation snippets ([#52](https://github.com/tmchow/hzl/issues/52)) ([a0b94dd](https://github.com/tmchow/hzl/commit/a0b94dd716822e95b25f0fdd625a7b0d5a41042d))
* **cli:** add parent/subtask hierarchy support ([#50](https://github.com/tmchow/hzl/issues/50)) ([7eebe1d](https://github.com/tmchow/hzl/commit/7eebe1db561f14340c9e925a788f0e064f0a620b))

# [1.10.0](https://github.com/tmchow/hzl/compare/v1.9.3...v1.10.0) (2026-02-01)


### Features

* add Homebrew installation support ([#46](https://github.com/tmchow/hzl/issues/46)) ([bd224c3](https://github.com/tmchow/hzl/commit/bd224c36e4b38551460407d1e148dd4ee120d278))

## [1.9.3](https://github.com/tmchow/hzl/compare/v1.9.2...v1.9.3) (2026-02-01)


### Bug Fixes

* add comprehensive field validation limits to event schemas ([#45](https://github.com/tmchow/hzl/issues/45)) ([3d4cb2a](https://github.com/tmchow/hzl/commit/3d4cb2a13fe262340fc2b50734cd0b62f6093342))

## [1.9.2](https://github.com/tmchow/hzl/compare/v1.9.1...v1.9.2) (2026-02-01)


### Bug Fixes

* **docs:** correct task list --json example output ([#44](https://github.com/tmchow/hzl/issues/44)) ([7d26a97](https://github.com/tmchow/hzl/commit/7d26a9702655bf09c69897357a2c3f15cdfa6e23))

## [1.9.1](https://github.com/tmchow/hzl/compare/v1.9.0...v1.9.1) (2026-02-01)


### Bug Fixes

* **docs:** Update README and positioning throughout docs ([#43](https://github.com/tmchow/hzl/issues/43)) ([3cf23ce](https://github.com/tmchow/hzl/commit/3cf23ce92dbe3de95632e370b1844d57d8c3215d))

# [1.9.0](https://github.com/tmchow/hzl/compare/v1.8.2...v1.9.0) (2026-02-01)


### Features

* **cli:** add destructive --force flag to init command ([#39](https://github.com/tmchow/hzl/issues/39)) ([db85c17](https://github.com/tmchow/hzl/commit/db85c17be3e3b39250bff6f39e9b55139938fbbf))

## [1.8.2](https://github.com/tmchow/hzl/compare/v1.8.1...v1.8.2) (2026-02-01)


### Bug Fixes

* correct npm publish order for hzl-web ([#37](https://github.com/tmchow/hzl/issues/37)) ([a65af71](https://github.com/tmchow/hzl/commit/a65af71091e418b2f12a21af1bc8e8df80adc8f1))

## [1.8.1](https://github.com/tmchow/hzl/compare/v1.8.0...v1.8.1) (2026-02-01)


### Bug Fixes

* add hzl-web package to semantic-release config ([#36](https://github.com/tmchow/hzl/issues/36)) ([049a5c5](https://github.com/tmchow/hzl/commit/049a5c5249d34b9e6e41255826b0c6f9e4bb917c))

# [1.8.0](https://github.com/tmchow/hzl/compare/v1.7.6...v1.8.0) (2026-02-01)


### Features

* **hzl-web:** add Kanban-style web dashboard ([#35](https://github.com/tmchow/hzl/issues/35)) ([983de00](https://github.com/tmchow/hzl/commit/983de0082552e616b1f58353311d58c4a06d4490))

## [1.7.6](https://github.com/tmchow/hzl/compare/v1.7.5...v1.7.6) (2026-02-01)


### Bug Fixes

* clear legacy dbPath from config when using --force ([#34](https://github.com/tmchow/hzl/issues/34)) ([7c6e0b8](https://github.com/tmchow/hzl/commit/7c6e0b8777f9eef718f9ce1a8e6b2bbb495537f2))

## [1.7.5](https://github.com/tmchow/hzl/compare/v1.7.4...v1.7.5) (2026-02-01)


### Bug Fixes

* read CLI version from package.json and update descriptions ([#33](https://github.com/tmchow/hzl/issues/33)) ([405e16d](https://github.com/tmchow/hzl/commit/405e16dc1a4f2c1f6898efd9377e50f0fd48a1c5))

## [1.7.4](https://github.com/tmchow/hzl/compare/v1.7.3...v1.7.4) (2026-02-01)


### Bug Fixes

* improve OpenClaw skill frontmatter formatting and description ([#32](https://github.com/tmchow/hzl/issues/32)) ([4e89850](https://github.com/tmchow/hzl/commit/4e898503373dda49526544fad05906a957dfd3fb))

## [1.7.3](https://github.com/tmchow/hzl/compare/v1.7.2...v1.7.3) (2026-02-01)


### Bug Fixes

* openclaw skill location and folder name ([#31](https://github.com/tmchow/hzl/issues/31)) ([ea74abc](https://github.com/tmchow/hzl/commit/ea74abc1b0793475388c9805e227076df1a8dd0f))

## [1.7.2](https://github.com/tmchow/hzl/compare/v1.7.1...v1.7.2) (2026-02-01)


### Bug Fixes

* openclaw skill add link to repo ([#30](https://github.com/tmchow/hzl/issues/30)) ([2d5249c](https://github.com/tmchow/hzl/commit/2d5249c642ca5aed0390ae84c0081f30286e3532))

## [1.7.1](https://github.com/tmchow/hzl/compare/v1.7.0...v1.7.1) (2026-02-01)


### Bug Fixes

* **init:** only persist dbPath when explicitly specified ([#29](https://github.com/tmchow/hzl/issues/29)) ([7e01b00](https://github.com/tmchow/hzl/commit/7e01b005bd921ab26648b4a73ff8ec937ddbb478))

# [1.7.0](https://github.com/tmchow/hzl/compare/v1.6.0...v1.7.0) (2026-02-01)


### Features

* implement Turso Remote Database Sync ([#27](https://github.com/tmchow/hzl/issues/27)) ([ae38bfd](https://github.com/tmchow/hzl/commit/ae38bfdf6541c39921981c40e915f3d6458a9ce9))

# [1.6.0](https://github.com/tmchow/hzl/compare/v1.5.1...v1.6.0) (2026-01-31)


### Features

* readme redesign and openclaw positioning and skills ([#26](https://github.com/tmchow/hzl/issues/26)) ([ede69dd](https://github.com/tmchow/hzl/commit/ede69ddf4d591cb9d93c7529722d4504af2e676c))

## [1.5.1](https://github.com/tmchow/hzl/compare/v1.5.0...v1.5.1) (2026-01-31)


### Bug Fixes

* **ci:** gate release on CI and fix npm provenance ([198645e](https://github.com/tmchow/hzl/commit/198645e338a2a46a6f3444868376c633a1dc0ad0))

# [1.5.0](https://github.com/tmchow/hzl/compare/v1.4.0...v1.5.0) (2026-01-31)


### Features

* trigger release ([cff3aae](https://github.com/tmchow/hzl/commit/cff3aae3fc0b7c72e6d80c05d1fb656f03641d82))

# [1.4.0](https://github.com/tmchow/hzl/compare/v1.3.0...v1.4.0) (2026-01-31)


### Features

* add Claude Code marketplace and skills plugin ([1e66ae3](https://github.com/tmchow/hzl/commit/1e66ae3dace0246448f539993044ff08e06ad746))

# [1.3.0](https://github.com/tmchow/hzl/compare/v1.2.0...v1.3.0) (2026-01-31)


### Features

* add dev mode isolation, XDG paths, Windows support, and security hardening ([#21](https://github.com/tmchow/hzl/issues/21)) ([b646156](https://github.com/tmchow/hzl/commit/b6461563ea9c8370adcb2484780ab11faf99a416))

# [1.2.0](https://github.com/tmchow/hzl/compare/v1.1.0...v1.2.0) (2026-01-31)


### Features

* explicit project management and noun-verb CLI restructure ([#20](https://github.com/tmchow/hzl/issues/20)) ([56bc184](https://github.com/tmchow/hzl/commit/56bc184f4133da16b7e8a23ff46add922b9978d7))

# [1.1.0](https://github.com/tmchow/hzl/compare/v1.0.0...v1.1.0) (2026-01-31)


### Features

* add persistent config file support ([#18](https://github.com/tmchow/hzl/issues/18)) ([83fdad9](https://github.com/tmchow/hzl/commit/83fdad9b9402c5237aee2539cfcf72d84bb3962f))

# 1.0.0 (2026-01-31)


### Bug Fixes

* sync package-lock.json and add pre-commit hook ([#15](https://github.com/tmchow/hzl/issues/15)) ([fab4fcc](https://github.com/tmchow/hzl/commit/fab4fccf00f98c4506cefc17891b94309cb0e12f))


### Features

* **cli:** add claim, complete, release, archive, reopen, set-status commands (Task 27) ([4c8bfc3](https://github.com/tmchow/hzl/commit/4c8bfc3a24583d8703504f502e559a5d1495ca53))
* **cli:** add CLI framework with task, search, and validate commands ([86534c0](https://github.com/tmchow/hzl/commit/86534c020b75fd2b1110ca12dd71f58df2ea929c))
* **cli:** add dependency and annotation commands (Tasks 29-30) ([ce9d0d6](https://github.com/tmchow/hzl/commit/ce9d0d665a52228dc1ca7eafe6983d5920e03826))
* **cli:** add init and which-db commands (Task 24.1-24.2) ([13ba9e7](https://github.com/tmchow/hzl/commit/13ba9e7efef47d78ee6fe435dd0099eda8ee124d))
* **cli:** add projects and rename-project commands (Task 24.3-24.4) ([0a38b4b](https://github.com/tmchow/hzl/commit/0a38b4b8803c4bf6639ff41c3b98736be4b39f28))
* **cli:** add search and validate commands (Tasks 31-32) ([bff12f4](https://github.com/tmchow/hzl/commit/bff12f4b383a52cfe96eca1439cefd9850d80d5d))
* **cli:** add show, history, update, move commands (Task 26) ([34097dc](https://github.com/tmchow/hzl/commit/34097dc2be101a47dc84f24770d304d791354733))
* **cli:** add stats and export-events commands (Tasks 33-34) ([9d62c46](https://github.com/tmchow/hzl/commit/9d62c469042a0dec9d6377007878fa183fb376d3))
* **cli:** add steal and stuck commands (Task 28) ([e91db97](https://github.com/tmchow/hzl/commit/e91db97a920df1c4fd9b4ff53028d683b9ce7448))
* **cli:** add top-level add, list, next commands (Task 25) ([3f986b9](https://github.com/tmchow/hzl/commit/3f986b96ad87b040de6f15b1322421642c454ef2))
* **core:** add availability checker and tag-aware task queries ([bca4c41](https://github.com/tmchow/hzl/commit/bca4c418b1de8645384aba1d0f3f06fab950be1c))
* **core:** add comments and checkpoints APIs to TaskService ([5432b25](https://github.com/tmchow/hzl/commit/5432b25bc319d635cb78025eb751b49f75069b80))
* **core:** add comments and checkpoints projector ([0b150c6](https://github.com/tmchow/hzl/commit/0b150c62f6034501b388d8c261a23d25eecca88b))
* **core:** add database connection manager with write transaction helper ([b2182f9](https://github.com/tmchow/hzl/commit/b2182f984aaf61a4339c46a41c8afe9b14ed0894))
* **core:** add database schema with projections, leases, tags, comments, checkpoints, FTS5 search ([7891ae5](https://github.com/tmchow/hzl/commit/7891ae528299ca5caf532bc0d534b7cb6dc00117))
* **core:** add dependencies projector ([c5f73d5](https://github.com/tmchow/hzl/commit/c5f73d5196b8420d64f36ede77b51abf48da120f))
* **core:** add event store with canonical timestamps and pagination ([2bb6679](https://github.com/tmchow/hzl/commit/2bb6679bcd82c865f8660f8923d060e4ca1e328e))
* **core:** add event types with Zod validation schemas ([ecbad75](https://github.com/tmchow/hzl/commit/ecbad758f94881d1ef21c3f36f6d2a2f9b05accb))
* **core:** add FTS5 search projector (standalone table) ([b191ad0](https://github.com/tmchow/hzl/commit/b191ad0405b87d918645173cbb463f705aa9ba71))
* **core:** add lease support with steal and stuck detection ([f81a06c](https://github.com/tmchow/hzl/commit/f81a06cb739d524ca27024fe480d19c8fa30b9dc))
* **core:** add projection engine with projector interface ([1e12af2](https://github.com/tmchow/hzl/commit/1e12af2b7bd1f51589d8d07eee29e5f1d92260ed))
* **core:** add projection rebuild API ([7b4c27e](https://github.com/tmchow/hzl/commit/7b4c27e62bfe9c6071d16dda9526aef03e0d019c))
* **core:** add SearchService with FTS5 full-text search ([f8e6c5d](https://github.com/tmchow/hzl/commit/f8e6c5dcdf1b0102f3726c923f788f3739c20bfe))
* **core:** add tags projector for fast tag filtering ([5c723e3](https://github.com/tmchow/hzl/commit/5c723e34fdd9de4bfa3910f85c136871c1799dbe))
* **core:** add tasks current projector with claim/lease support ([eca9b46](https://github.com/tmchow/hzl/commit/eca9b46de486e9f50d0b448db4a9c616f0dd2dc4))
* **core:** add TaskService claimNext with priority-based selection ([ba77812](https://github.com/tmchow/hzl/commit/ba77812fe5d2d3f9508cc4dcf511ec42cae8086d))
* **core:** add TaskService claimTask with dependency validation ([6224347](https://github.com/tmchow/hzl/commit/6224347a0e682fbb1e141988a4ba8af8a611a856))
* **core:** add TaskService status transitions (release, archive, reopen) ([72c3845](https://github.com/tmchow/hzl/commit/72c3845ef58f932597dc7a8d76593217271d3053))
* **core:** add TaskService with createTask ([3576a64](https://github.com/tmchow/hzl/commit/3576a647cadbb1cb41b487e76b0ef113490d54bf))
* **core:** add ULID generation and validation ([716a879](https://github.com/tmchow/hzl/commit/716a879f416c98d0e22082ceb4a36b623f613a36))
* **core:** add validation service with cycle detection ([9ffecda](https://github.com/tmchow/hzl/commit/9ffecda20dfa5ca9cc109fc453ce749c37c1fcf0))
