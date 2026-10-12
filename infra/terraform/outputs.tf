output "api_url" {
  description = "HTTP API Gateway endpoint URL for the backend."
  value       = aws_apigatewayv2_api.knowledge.api_endpoint
}

output "documents_bucket_name" {
  description = "S3 bucket name where knowledge base documents are stored."
  value       = aws_s3_bucket.documents.id
}

output "lambda_artifacts_bucket_name" {
  description = "S3 bucket name storing Lambda deployment zip packages."
  value       = aws_s3_bucket.lambda_artifacts.id
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID for user authentication."
  value       = aws_cognito_user_pool.users.id
}

output "cognito_issuer" {
  description = "Cognito OIDC issuer URL for JWT token validation."
  value       = local.cognito_issuer
}

output "cognito_client_id" {
  description = "Cognito User Pool App Client ID used by the frontend."
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_domain_url" {
  description = "Cognito Managed Login hosted UI URL."
  value       = "https://${aws_cognito_user_pool_domain.login.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "knowledge_log_group_name" {
  description = "CloudWatch Log Group name for the knowledge lambda."
  value       = aws_cloudwatch_log_group.lambda["knowledge"].name
}

output "groq_api_key_ssm_parameter_name" {
  description = "SSM Parameter name for Groq API key."
  value       = length(aws_ssm_parameter.groq_api_key) > 0 ? aws_ssm_parameter.groq_api_key[0].name : var.groq_api_key_secret_arn
  sensitive   = true
}

output "qdrant_api_key_ssm_parameter_name" {
  description = "SSM Parameter name for Qdrant API key."
  value       = length(aws_ssm_parameter.qdrant_api_key) > 0 ? aws_ssm_parameter.qdrant_api_key[0].name : var.qdrant_api_key_secret_arn
  sensitive   = true
}

output "answer_cache_table_name" {
  description = "Shared DynamoDB demo-answer cache with five-minute logical expiry."
  value       = aws_dynamodb_table.answer_cache.name
}
