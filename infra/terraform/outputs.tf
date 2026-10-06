output "api_url" {
  value = aws_apigatewayv2_api.knowledge.api_endpoint
}

output "documents_bucket_name" {
  value = aws_s3_bucket.documents.id
}

output "lambda_artifacts_bucket_name" {
  value = aws_s3_bucket.lambda_artifacts.id
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.users.id
}

output "cognito_issuer" {
  value = local.cognito_issuer
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain_url" {
  value = "https://${aws_cognito_user_pool_domain.login.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "knowledge_log_group_name" {
  value = aws_cloudwatch_log_group.lambda["knowledge"].name
}

output "groq_api_key_ssm_parameter_name" {
  description = "SSM Parameter name for Groq API key."
  value       = length(aws_ssm_parameter.groq_api_key) > 0 ? aws_ssm_parameter.groq_api_key[0].name : var.groq_api_key_secret_arn
}

output "qdrant_api_key_ssm_parameter_name" {
  description = "SSM Parameter name for Qdrant API key."
  value       = length(aws_ssm_parameter.qdrant_api_key) > 0 ? aws_ssm_parameter.qdrant_api_key[0].name : var.qdrant_api_key_secret_arn
}
