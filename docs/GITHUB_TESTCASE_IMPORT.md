# SmartParity GitHub Testcase Import

This guide explains how to run migration tests directly from testcase files stored in a GitHub repository.

## What this feature does

- Reads testcase files from GitHub.
- Creates a test run automatically.
- Uses testcase `steps` plus migration URLs.
- Supports both public and private repositories.
- Supports multiple testcase formats:
  - `.json`
  - `.yml` / `.yaml`
  - `.spec.ts` / `.spec.js` / `.ts`

## Supported backend endpoint

- `POST /api/testruns/github`

## Request body

```json
{
  "repository": "owner/repository",
  "filePath": "path/to/case.json",
  "branch": "main",
  "githubToken": "optional_for_private_repo",
  "steps": ["Open login page"],
  "preMigrationUrl": "http://localhost:3000/",
  "postMigrationUrl": "http://localhost:3001/"
}
```

## Field details

- `repository` (required if `githubFileUrl` not used): GitHub repo in `owner/repo` format.
- `filePath` (required if `githubFileUrl` not used): Path to testcase file (`.json/.yml/.yaml/.spec.ts`) inside the repo.
- `branch` (optional): Defaults to `main`.
- `githubToken` (optional): Needed for private repos.
- `steps` (optional fallback): Used when imported file does not contain parsable steps.
- `preMigrationUrl` (optional override): If provided, overrides value inside file.
- `postMigrationUrl` (optional override): If provided, overrides value inside file.

## Supported testcase formats

## A) JSON format (`.json`)

Your file in GitHub should include:

```json
{
  "appId": "smartparity-demo-app",
  "appCredentials": "demo-secure-token-123",
  "preMigrationUrl": "http://localhost:3000/",
  "postMigrationUrl": "http://localhost:3001/",
  "steps": [
    "Open login page",
    "Enter username demo.user@example.com",
    "Enter password Pass@12345",
    "Click Sign In button"
  ]
}
```

## B) YAML format (`.yml` / `.yaml`)

```yaml
preMigrationUrl: http://localhost:3000/
postMigrationUrl: http://localhost:3001/
steps:
  - Open login page
  - Enter username demo.user@example.com
  - Enter password Pass@12345
  - Click Sign In button
```

## C) Playwright spec format (`.spec.ts`)

For Playwright spec imports, SmartParity extracts steps in this order:
1. `test.step("...")` labels (best quality)
2. `// STEP: ...` comments
3. Fallback from common Playwright actions (`goto`, `fill`, `click`, `expect`)

Example:

```ts
test("login", async ({ page }) => {
  await test.step("Open login page", async () => {
    await page.goto("http://localhost:3000/");
  });

  await test.step("Enter username", async () => {
    await page.getByLabel("Username").fill("demo.user@example.com");
  });
});
```

Notes:
- If spec file does not include migration URLs, send them in request body.
- If extracted steps are not enough, pass `steps` in request body as fallback.

## Frontend usage

1. Open **SmartParity Test Run** page.
2. In import mode, choose **GitHub Repo**.
3. Fill:
   - `GitHub Repository` (example: `my-org/migration-tests`)
   - `Testcase File Path` (example: `cases/loan/input.json` or `cases/loan/input.yml` or `tests/loan.spec.ts`)
   - `Branch` (default `main`)
   - `GitHub Token` (optional, for private repo)
4. Fill security fields:
   - `App ID`
   - `App Credentials`
5. Fill migration URLs (or keep overrides).
6. Click **Run Migration Test**.

## cURL example (public repo)

```bash
curl -X POST http://localhost:8000/api/testruns/github \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "my-org/migration-tests",
    "filePath": "cases/loan/input.json",
    "branch": "main",
    "preMigrationUrl": "http://localhost:3000/",
    "postMigrationUrl": "http://localhost:3001/"
  }'
```

Then run the created test:

```bash
curl -X POST http://localhost:8000/api/execution/<TEST_RUN_ID>/run
```

## cURL example (private repo)

```bash
curl -X POST http://localhost:8000/api/testruns/github \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "my-org/private-migration-tests",
    "filePath": "cases/loan/input.json",
    "branch": "main",
    "githubToken": "ghp_xxxxxxxxxxxxx",
    "preMigrationUrl": "http://localhost:3000/",
    "postMigrationUrl": "http://localhost:3001/"
  }'
```

## cURL example (YAML file)

```bash
curl -X POST http://localhost:8000/api/testruns/github \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "my-org/migration-tests",
    "filePath": "cases/loan/input.yml",
    "branch": "main",
    "preMigrationUrl": "http://localhost:3000/",
    "postMigrationUrl": "http://localhost:3001/"
  }'
```

## cURL example (spec.ts file with fallback steps)

```bash
curl -X POST http://localhost:8000/api/testruns/github \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "my-org/migration-tests",
    "filePath": "tests/loan.spec.ts",
    "branch": "main",
    "preMigrationUrl": "http://localhost:3000/",
    "postMigrationUrl": "http://localhost:3001/",
    "steps": [
      "Open login page",
      "Enter username demo.user@example.com",
      "Enter password Pass@12345",
      "Click Sign In button"
    ]
  }'
```

## Common errors

- `No valid steps found. Provide steps[] in GitHub file or request body.`
  - Add `steps` in file or pass fallback `steps` in request body.
- `Failed to fetch GitHub testcase file (HTTP 404)`
  - Check repository, branch, and file path.
- `preMigrationUrl and postMigrationUrl are required`
  - Provide URLs in file or API request.
