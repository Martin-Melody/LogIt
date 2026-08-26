# App Runner reads these as runtime secrets (not plain env vars) so they don't show up
# in `aws apprunner describe-service` output. Note: Terraform state still contains the
# plaintext values (SSM SecureString resources always show their value in state) — keep
# state somewhere encrypted and never commit it. See README.md.

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${var.project_name}/jwt-secret"
  type  = "SecureString"
  value = var.jwt_secret
}

resource "aws_ssm_parameter" "admin_key" {
  name  = "/${var.project_name}/admin-key"
  type  = "SecureString"
  value = var.admin_key
}

resource "aws_ssm_parameter" "connection_string" {
  name  = "/${var.project_name}/connection-string"
  type  = "SecureString"
  value = "Host=${aws_db_instance.main.address};Port=${aws_db_instance.main.port};Database=${aws_db_instance.main.db_name};Username=${aws_db_instance.main.username};Password=${var.db_password}"
}

# From your own Stripe dashboard — see docs/deployment.md's Billing section. Empty values
# are fine at first apply (checkout/webhooks just won't work until you fill them in and
# re-apply), so this doesn't block getting the rest of the infrastructure up.

resource "aws_ssm_parameter" "stripe_secret_key" {
  name  = "/${var.project_name}/stripe-secret-key"
  type  = "SecureString"
  value = var.stripe_secret_key
}

resource "aws_ssm_parameter" "stripe_webhook_secret" {
  name  = "/${var.project_name}/stripe-webhook-secret"
  type  = "SecureString"
  value = var.stripe_webhook_secret
}

resource "aws_ssm_parameter" "stripe_pro_price_id" {
  name  = "/${var.project_name}/stripe-pro-price-id"
  type  = "SecureString"
  value = var.stripe_pro_price_id
}

resource "aws_ssm_parameter" "stripe_studio_price_id" {
  name  = "/${var.project_name}/stripe-studio-price-id"
  type  = "SecureString"
  value = var.stripe_studio_price_id
}
