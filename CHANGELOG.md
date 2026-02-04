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
