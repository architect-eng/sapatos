# Changelog

## [0.5.4](https://github.com/architect-eng/sapatos/compare/v0.5.3...v0.5.4) (2025-11-26)


### Bug Fixes

* **generate:** sanitize schema and table names for valid TypeScript namespaces ([231d5eb](https://github.com/architect-eng/sapatos/commit/231d5eb616819563f96d8596848618fe673ffa68))

## [0.5.3](https://github.com/architect-eng/sapatos/compare/v0.5.2...v0.5.3) (2025-11-25)


### Bug Fixes

* **factory:** type createSapatosDb return values with explicit schema types ([3703a7b](https://github.com/architect-eng/sapatos/commit/3703a7b131dff90b6f8fb8c4c953f2f3de1813d9))

## [0.5.2](https://github.com/architect-eng/sapatos/compare/v0.5.1...v0.5.2) (2025-11-25)


### Bug Fixes

* **generate:** export custom types from barrel file ([306e7a3](https://github.com/architect-eng/sapatos/commit/306e7a33c70b176671a2507e37107a8e880e54ea))
* **generate:** use type aliases instead of interfaces for BaseSchema compatibility ([f2798a6](https://github.com/architect-eng/sapatos/commit/f2798a6844f93552048fa16864480a544153e823))

## [0.5.1](https://github.com/architect-eng/sapatos/compare/v0.5.0...v0.5.1) (2025-11-25)


### Bug Fixes

* **generate:** rename Schema type alias to SchemaName to avoid duplication ([a6090a3](https://github.com/architect-eng/sapatos/commit/a6090a30084e147470d38d851b4615d8439840eb))
* **generate:** use relative import for custom types in generated schema ([e2baca2](https://github.com/architect-eng/sapatos/commit/e2baca2139fef1d6888a59a30b317a20fcbc0df2))

## [0.5.0](https://github.com/architect-eng/sapatos/compare/v0.4.2...v0.5.0) (2025-11-25)


### Features

* **db:** add createSapatosDb factory and explicit type exports ([09ac59a](https://github.com/architect-eng/sapatos/commit/09ac59a49c5f3d20c8102787a08ffff6a1ba1ed2))

## [0.4.2](https://github.com/architect-eng/sapatos/compare/v0.4.1...v0.4.2) (2025-11-25)


### Reverts

* back to known good state ([fff04e2](https://github.com/architect-eng/sapatos/commit/fff04e2bca26b0242d38711abcf95512fe679084))

## [0.4.1](https://github.com/architect-eng/sapatos/compare/v0.4.0...v0.4.1) (2025-11-25)


### Bug Fixes

* **db:** ensure all exports are accessible from @architect-eng/sapatos/db ([f029d68](https://github.com/architect-eng/sapatos/commit/f029d681e9a2f045ab47ce812ee2d5c0c0fb8ca7))

## [0.4.0](https://github.com/architect-eng/sapatos/compare/v0.3.1...v0.4.0) (2025-11-25)


### Features

* proper module augmentation implementation ([df5643c](https://github.com/architect-eng/sapatos/commit/df5643c99cccb9b167d5c3dab455c4035a2ba25a))


### Bug Fixes

* **generate:** nest generated table namespaces under schema name ([6fe7d70](https://github.com/architect-eng/sapatos/commit/6fe7d70dcdc25753e4c83b051a2641acc015a3de))

## [0.3.1](https://github.com/architect-eng/sapatos/compare/v0.3.0...v0.3.1) (2025-11-24)


### Bug Fixes

* **generate:** replace dots with underscores in schema-prefixed SQLExpression type names ([a34e04f](https://github.com/architect-eng/sapatos/commit/a34e04f9868627dc2c7d39fa9f10aa8f9297c408))

## [0.3.0](https://github.com/architect-eng/sapatos/compare/v0.2.0...v0.3.0) (2025-11-24)


### Features

* **conditions:** add const type parameters for improved enum inference ([9402a94](https://github.com/architect-eng/sapatos/commit/9402a9408625354a8c839c327d924a447ec2e928))


### Bug Fixes

* use @architect-eng/sapatos instead of just sapatos in our module declarations ([1c3bd8f](https://github.com/architect-eng/sapatos/commit/1c3bd8f007c7304c277baa41d56605d2e9c54997))

## [0.2.0](https://github.com/architect-eng/sapatos/compare/v0.1.0...v0.2.0) (2025-11-24)


### Features

* **types:** add nominal typing for wrapper classes ([5ce4fe9](https://github.com/architect-eng/sapatos/commit/5ce4fe9de31f1a96135194a91e6889eee8a4ce1c))

## [0.1.0](https://github.com/architect-eng/sapatos/compare/v0.0.3...v0.1.0) (2025-11-24)


### Features

* **generate:** replace ambient module declarations with type augmentation ([8f1d82c](https://github.com/architect-eng/sapatos/commit/8f1d82c919da8785487231a24eec787ffe9ef3bf))

## [0.0.3](https://github.com/architect-eng/sapatos/compare/v0.0.2...v0.0.3) (2025-11-23)


### Bug Fixes

* selectExactlyOne now throws when used as a lateral the same way it does when used standalone ([059c4ea](https://github.com/architect-eng/sapatos/commit/059c4ea64f50ec3d49c7e9858b204c3225b17d64))

## 0.0.2 (2025-11-23)


### Bug Fixes

* money now typed as string ([1643b41](https://github.com/architect-eng/sapatos/commit/1643b414db25cc557d228e98836321781072ce31))


### Miscellaneous Chores

* release 0.0.2 ([c572a44](https://github.com/architect-eng/sapatos/commit/c572a4400dcf473bd45cd38a87e2b00a943d64d2))
