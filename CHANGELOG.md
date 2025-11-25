# Changelog

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
