output "api_ecr_repository_url" {
  description = "Push API images here: docker push <this>:latest"
  value       = aws_ecr_repository.api.repository_url
}

output "web_ecr_repository_url" {
  description = "Push logit-web images here: docker push <this>:latest"
  value       = aws_ecr_repository.web.repository_url
}

output "api_service_url" {
  description = "The API's public HTTPS URL, managed by App Runner."
  value       = "https://${aws_apprunner_service.api.service_url}"
}

output "web_service_url" {
  description = "logit-web's public HTTPS URL — this is where paying customers actually go to view their dashboard, once they're pointed here via a custom domain (see cloudflare_cname_targets below)."
  value       = "https://${aws_apprunner_service.web.service_url}"
}

output "api_service_arn" {
  value = aws_apprunner_service.api.arn
}

output "web_service_arn" {
  value = aws_apprunner_service.web.arn
}

output "rds_endpoint" {
  description = "Not publicly reachable — only the App Runner VPC connector can reach it."
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "cloudflare_cname_targets" {
  description = "For each custom domain you want (e.g. api.logit.ie, app.logit.ie): add a CNAME record in Cloudflare pointing at the matching value here (DNS-only, not proxied), then run `aws apprunner associate-custom-domain` for that service — see README.md."
  value = {
    api = aws_apprunner_service.api.service_url
    web = aws_apprunner_service.web.service_url
  }
}
