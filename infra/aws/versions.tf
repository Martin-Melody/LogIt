terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Local state (the default) works but keeps secrets in a plaintext .tfstate file on
  # whatever machine runs `terraform apply`, and gives you no locking if two people ever
  # run it at once. Once you have an AWS account, create an S3 bucket + DynamoDB table by
  # hand (or a tiny separate bootstrap Terraform config) and uncomment this:
  #
  # backend "s3" {
  #   bucket         = "logit-terraform-state"
  #   key            = "aws/terraform.tfstate"
  #   region         = "eu-west-1"
  #   dynamodb_table = "logit-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region
}
