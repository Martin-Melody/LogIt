# Minimal VPC: two private subnets, no NAT gateway. Nothing in here needs outbound
# internet access — RDS just needs to be reachable from the App Runner VPC connector,
# and App Runner's own public HTTPS endpoint is managed outside the VPC entirely.
# This keeps monthly cost near zero (no NAT Gateway, no Elastic IP).

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.42.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.project_name}-private-${count.index}"
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds"
  description = "Allow Postgres from the App Runner VPC connector only"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-rds"
  }
}

resource "aws_security_group" "apprunner_connector" {
  name        = "${var.project_name}-apprunner-connector"
  description = "App Runner VPC connector egress"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-apprunner-connector"
  }
}

resource "aws_security_group_rule" "rds_from_apprunner" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.apprunner_connector.id
}
