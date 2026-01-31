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
