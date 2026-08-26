variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-west-1"
}

variable "project_name" {
  description = "Prefix used for naming every resource."
  type        = string
  default     = "logit"
}

variable "environment" {
  description = "Environment tag (e.g. production)."
  type        = string
  default     = "production"
}

variable "db_password" {
  description = "Master password for the RDS Postgres instance. Provide via TF_VAR_db_password or a .tfvars file that is NOT committed."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Secret used to sign auth tokens (Jwt:Secret). Generate with: openssl rand -base64 48"
  type        = string
  sensitive   = true
}

variable "admin_key" {
  description = "Key required to access the API's admin endpoints (Admin:Key)."
  type        = string
  sensitive   = true
}

variable "stripe_secret_key" {
  description = "From your Stripe dashboard. Defaults to a placeholder so you can stand up the infrastructure before Stripe is ready — checkout/webhooks just fail cleanly at the Stripe API boundary until you set the real value and re-apply. Note: SSM Parameter Store rejects an actually-empty string, hence the placeholder rather than \"\"."
  type        = string
  sensitive   = true
  default     = "not-configured"
}

variable "stripe_webhook_secret" {
  description = "From the webhook endpoint you register in Stripe, pointed at https://<api-url>/billing/webhook. Same placeholder-default note as stripe_secret_key."
  type        = string
  sensitive   = true
  default     = "not-configured"
}

variable "stripe_pro_price_id" {
  description = "The Stripe Price object for the individual Pro plan. Same placeholder-default note as stripe_secret_key."
  type        = string
  sensitive   = true
  default     = "not-configured"
}

variable "stripe_studio_price_id" {
  description = "The Stripe Price object for the Studio (personal trainer) plan. Same placeholder-default note as stripe_secret_key."
  type        = string
  sensitive   = true
  default     = "not-configured"
}

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro is the cheapest ARM option and is Free Tier eligible on a new AWS account."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  description = "RDS storage size in GB."
  type        = number
  default     = 20
}

variable "apprunner_cpu" {
  description = "App Runner vCPU allocation. See https://docs.aws.amazon.com/apprunner/latest/dg/architecture.html for valid combinations with memory."
  type        = string
  default     = "1 vCPU"
}

variable "apprunner_memory" {
  description = "App Runner memory allocation."
  type        = string
  default     = "2 GB"
}

variable "apprunner_auto_deploy" {
  description = "Automatically redeploy the App Runner service whenever a new image is pushed to :latest in ECR. Turn off if you'd rather deploy explicitly (e.g. via CI)."
  type        = bool
  default     = true
}

variable "web_origin" {
  description = "Public URL logit-web will be served at once its custom domain is set up (e.g. https://app.logit.ie) — SvelteKit needs this upfront for CSRF origin checks, so pick the subdomain before the DNS/custom-domain step exists. Using the App Runner default *.awsapprunner.com URL here works too, but you'd need to change it (and redeploy) once you attach a real domain."
  type        = string
}
