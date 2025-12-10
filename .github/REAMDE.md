# Release Workflow

Publishes Sapatos to GitHub Packages and npmjs with OIDC authentication.

## Workflow Flow

```mermaid
graph TD
    A[version-bump<br/>local version bump] --> B[install]
    A --> C[lint]
    A --> D[build]
    A --> E[configure-npmjs]
    D --> E
    D --> F[publish-gh]
    E --> G[build-npmjs]
    G --> H[publish-npmjs]
    F --> I[create-release<br/>tag original commit]
    H --> I
    I --> J[push-changes<br/>commit updates]

    style A fill:#e1f5fe
    style D fill:#fff3e0
    style E fill:#fff3e0
    style G fill:#fff3e0
    style I fill:#f3e5f5,stroke-dasharray: 5 5
    style J fill:#e8f5e8
```

## Job Dependencies

- `version-bump` → `lint`, `build`, `configure-npmjs`
- `build` → `configure-npmjs` → `build-npmjs`
- `lint` and `build` → `publish-gh` (must pass for publishing)
- `build-npmjs` → `publish-npmjs` (npmjs)
- `publish-gh`, `publish-npmjs`, `version-bump` → `create-release` (tag original commit)
- `create-release` → `push-changes` (commit version updates)

### Parallel Execution
- `lint` runs parallel with build and configure-npmjs
- `publish-gh` waits for both lint and build to pass
- `publish-gh` runs parallel with npmjs build chain
- TypeScript cache shared between builds

## Artifact Flow

```mermaid
graph LR
    subgraph "Build & Cache"
        A1[version-bump<br/>local version bump<br/>uploads release-files]
        A1 --> C1[lint]
        A1 --> D1[build] --> E1[TypeScript cache + dist-files]
        F1[configure-npmjs<br/>removes publishConfig]
        A1 --> F1
        D1 --> F1
        F1 --> G1[build-npmjs] --> H1[TypeScript cache + dist-files-npmjs]
        D1 -.->|cache share| G1
    end

    subgraph "Publishing"
        E1 --> I1[publish-gh<br/>GitHub Packages]
        H1 --> J1[publish-npmjs<br/>npmjs + OIDC]
        A1 --> K1[create-release<br/>tag original commit]
        I1 --> K1
        J1 --> K1
        A1 --> L1[push-changes<br/>commit version updates]
        K1 --> L1
    end

    subgraph "Cache Storage"
        M1[GitHub Actions Cache<br/>node_modules + .tsbuildinfo + dist/]
        E1 -.->|stores| M1
        G1 -.->|uses| M1
        E1 -.->|uses| M1
    end

    style A1 fill:#e1f5fe
    style D1 fill:#fff3e0
    style G1 fill:#fff3e0
    style K1 fill:#f3e5f5,stroke-dasharray: 5 5
    style L1 fill:#e8f5e8
    style M1 fill:#e8f5e8,stroke-dasharray: 3 3
    style I1 fill:#f3e5f5
    style J1 fill:#f3e5f5
```

## Usage

**Actions** → **Manual Release** → Select release type → **Run workflow**

Optional dry run mode available.
