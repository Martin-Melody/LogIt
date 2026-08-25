# AWS deployment (the paid managed-hosting tier)

Runs two services on AWS App Runner, backed by one shared RDS Postgres database:

- **`logit-api`** (`services/api`) — auth, sync, social, billing. Everything talks to this.
- **`logit-web`** (`apps/clients/logit-web`) — the analytics dashboard. **One shared deployment
  for every paying customer**, the same way Bitwarden's `vault.bitwarden.com` is one web app
  that every customer logs into with their own account — not a separate deployment per
  customer. Data isolation happens per-user inside the API's database, not at the
  infrastructure level.

This is what "pay us to host it" actually runs on. Self-hosters use `docker-compose.yml` at the
repo root instead and never touch any of this — where their instance lives is entirely up to
them.

## Why App Runner, not ECS/EKS

Run the Dockerfile, get a public HTTPS URL. App Runner does that with no ALB, no cluster, and no
Kubernetes to operate — the right amount of infrastructure for two services run by one person.
Move to ECS Fargate later if this grows into something that needs a shared load balancer or more
services.

## What this creates

- A VPC with two private subnets (no NAT gateway — nothing in here needs outbound internet, so
  this costs nothing extra).
- RDS Postgres (`db.t4g.micro` by default — Free Tier eligible on a new AWS account), only
  reachable from inside the VPC — only `logit-api` connects to it, `logit-web` never touches the
  database directly, it only calls the API over HTTPS.
- Two ECR repositories, one per service.
- Two App Runner services:
  - `logit-api`, connected to RDS through a VPC connector, with secrets (`Jwt:Secret`,
    `Admin:Key`, the DB connection string) delivered via SSM Parameter Store rather than plain
    environment variables.
  - `logit-web`, plain (no VPC connector, no secrets — it doesn't need either).

## One-time setup

1. Install [Terraform](https://developer.hashicorp.com/terraform/install) and the
   [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html),
   then `aws configure` with credentials for the account you're deploying into.
2. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in `db_password`,
   `jwt_secret` (generate with `openssl rand -base64 48`), `admin_key`, and `web_origin` (the
   subdomain you intend to point at `logit-web`, e.g. `https://app.logit.ie` — SvelteKit needs
   this upfront, see the variable's description in `variables.tf`). This file is gitignored —
   never commit it.
3. `terraform init`
4. `terraform apply`

This creates the VPC/RDS/ECR/App Runner shell for both services. Neither has a real image to run
yet until you push one (next section) — the first deploy will show as failed until then, that's
expected.

## Every deploy after that

```bash
# from the repo root
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=eu-west-1   # match var.aws_region in variables.tf
REGISTRY=$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY

docker build -f services/api/Dockerfile -t $REGISTRY/logit-api:latest services/api
docker push $REGISTRY/logit-api:latest

docker build -f apps/clients/logit-web/Dockerfile -t $REGISTRY/logit-web:latest .
docker push $REGISTRY/logit-web:latest
```

(`logit-web`'s build context is the repo root, not its own directory — see the comment at the
top of its Dockerfile, it needs `packages/core` alongside it for the npm workspace.)

With `apprunner_auto_deploy = true` (the default), pushing `:latest` triggers a new deployment
automatically for whichever service's image changed — no `terraform apply` needed for routine
deploys, only when the infrastructure itself changes.

## Database: this is genuinely tested, not just written

The app auto-detects Postgres vs SQLite from the connection string
(`services/api/src/Logit.Api/Program.cs`) and runs its own migrations on startup — but EF Core
migrations bake in provider-specific column types (SQLite's `bool → INTEGER` vs Postgres's
native `boolean`), so the SQLite-authored migration files can't just be replayed against
Postgres as-is. This was a real bug, caught by actually running the API against a local Postgres
container before writing this doc: registration failed with a live type-mismatch error on the
first write.

Fixed by giving Postgres its own migration history: `Data/PostgresAppDbContext.cs` is a thin
subclass used only so Postgres gets its own model snapshot and migration set
(`Migrations/Postgres/`), independent of the SQLite ones self-hosters use. **Any future schema
change needs to be generated for both:**

```bash
cd services/api/src/Logit.Api
dotnet ef migrations add YourMigrationName --context AppDbContext -o Migrations
dotnet ef migrations add YourMigrationName --context PostgresAppDbContext -o Migrations/Postgres
```

Both were verified end-to-end against real local containers (SQLite dev db and a throwaway
`postgres:16-alpine` container) — register, login, and an authenticated write all confirmed
working, with the Postgres schema showing the correct native `boolean` column.

## Custom domains (via Cloudflare, not Route53)

DNS lives on Cloudflare, not AWS, so this isn't fully automated. After `terraform apply`, for
each of `api.logit.ie` and `app.logit.ie` (or whatever you actually pick):

1. `terraform output cloudflare_cname_targets` — the default `*.awsapprunner.com` URL for each
   service.
2. In Cloudflare's dashboard, add a CNAME for the hostname pointing at the matching value
   (**DNS-only, not proxied** — App Runner needs to see the real request to issue/validate its
   own TLS certificate for the custom domain).
3. `aws apprunner associate-custom-domain --service-arn $(terraform output -raw api_service_arn) --domain-name api.logit.ie`
   (swap in `web_service_arn` / `app.logit.ie` for the other one).
4. Wait for `aws apprunner describe-custom-domains` to show the certificate as `ACTIVE`.
5. If `app.logit.ie` ends up different from what you put in `web_origin` earlier, update that
   variable to match and `terraform apply` again — SvelteKit checks the real request origin
   against it.

## Known gaps, deliberately left for later

- **Single-AZ RDS.** Flip `multi_az = true` in `rds.tf` once real paying users depend on this —
  doubles the DB cost, not worth it before then.
- **No CI/CD.** Deploys are the manual `docker build && push` above. Worth automating via GitHub
  Actions once this is live, not before.
- **Local Terraform state by default.** See the commented-out `backend "s3"` block in
  `versions.tf` — worth switching to once there's an AWS account to hold the state bucket.
- **No autoscaling/capacity tuning.** Both services run App Runner's defaults. Fine for however
  much traffic "a few paying customers" is; revisit once that's no longer true.
