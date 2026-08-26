# --- IAM: lets App Runner pull the image from ECR ---

data "aws_iam_policy_document" "apprunner_ecr_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["build.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_ecr_access" {
  name               = "${var.project_name}-apprunner-ecr-access"
  assume_role_policy = data.aws_iam_policy_document.apprunner_ecr_assume.json
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# --- IAM: lets the running App Runner instance read the SSM secrets above ---

data "aws_iam_policy_document" "apprunner_instance_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["tasks.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_instance" {
  name               = "${var.project_name}-apprunner-instance"
  assume_role_policy = data.aws_iam_policy_document.apprunner_instance_assume.json
}

data "aws_iam_policy_document" "apprunner_read_secrets" {
  statement {
    actions = ["ssm:GetParameters"]
    resources = [
      aws_ssm_parameter.jwt_secret.arn,
      aws_ssm_parameter.admin_key.arn,
      aws_ssm_parameter.connection_string.arn,
      aws_ssm_parameter.stripe_secret_key.arn,
      aws_ssm_parameter.stripe_webhook_secret.arn,
      aws_ssm_parameter.stripe_pro_price_id.arn,
      aws_ssm_parameter.stripe_studio_price_id.arn,
    ]
  }
}

resource "aws_iam_role_policy" "apprunner_read_secrets" {
  name   = "${var.project_name}-apprunner-read-secrets"
  role   = aws_iam_role.apprunner_instance.id
  policy = data.aws_iam_policy_document.apprunner_read_secrets.json
}

# --- Network: lets App Runner reach RDS privately, inside the VPC ---

resource "aws_apprunner_vpc_connector" "main" {
  vpc_connector_name = "${var.project_name}-connector"
  subnets            = aws_subnet.private[*].id
  security_groups    = [aws_security_group.apprunner_connector.id]
}

# --- The service itself ---

resource "aws_apprunner_service" "api" {
  service_name = "${var.project_name}-api"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }
    auto_deployments_enabled = var.apprunner_auto_deploy

    image_repository {
      image_identifier      = "${aws_ecr_repository.api.repository_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = "8080"

        runtime_environment_variables = {
          ASPNETCORE_ENVIRONMENT = "Production"
          Jwt__Issuer            = "logit-api"
          Jwt__Audience          = "logit-app"
        }

        runtime_environment_secrets = {
          Jwt__Secret                = aws_ssm_parameter.jwt_secret.arn
          Admin__Key                 = aws_ssm_parameter.admin_key.arn
          ConnectionStrings__Default = aws_ssm_parameter.connection_string.arn
          Stripe__SecretKey          = aws_ssm_parameter.stripe_secret_key.arn
          Stripe__WebhookSecret      = aws_ssm_parameter.stripe_webhook_secret.arn
          Stripe__ProPriceId         = aws_ssm_parameter.stripe_pro_price_id.arn
          Stripe__StudioPriceId      = aws_ssm_parameter.stripe_studio_price_id.arn
        }
      }
    }
  }

  instance_configuration {
    cpu               = var.apprunner_cpu
    memory            = var.apprunner_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.main.arn
    }
  }

  health_check_configuration {
    protocol = "HTTP"
    path     = "/health" # added to Program.cs alongside this Terraform — must return 200 with no auth required
    interval = 10
    timeout  = 5
  }

  tags = {
    Name        = "${var.project_name}-api"
    Environment = var.environment
  }
}

# --- logit-web: no VPC connector needed (it only talks to the API over HTTPS, never
# touches RDS directly), and no instance role (it doesn't call any AWS service at runtime).

resource "aws_apprunner_service" "web" {
  service_name = "${var.project_name}-web"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }
    auto_deployments_enabled = var.apprunner_auto_deploy

    image_repository {
      image_identifier      = "${aws_ecr_repository.web.repository_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = "3000"

        runtime_environment_variables = {
          PORT   = "3000"
          ORIGIN = var.web_origin
        }
      }
    }
  }

  instance_configuration {
    cpu    = var.apprunner_cpu
    memory = var.apprunner_memory
  }

  health_check_configuration {
    protocol = "HTTP"
    path     = "/login" # unauthenticated, always renders — see src/routes/login/+page.svelte
    interval = 10
    timeout  = 5
  }

  tags = {
    Name        = "${var.project_name}-web"
    Environment = var.environment
  }
}
