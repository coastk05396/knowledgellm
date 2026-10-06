data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

resource "aws_ssm_parameter" "groq_api_key" {
  count       = var.groq_api_key_secret_arn == "" ? 1 : 0
  name        = "/${var.project_name}/groq-api-key"
  description = "Groq Cloud API Key for KnowledgeLLM"
  type        = "SecureString"
  value       = "CHANGE_ME"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "qdrant_api_key" {
  count       = var.qdrant_api_key_secret_arn == "" ? 1 : 0
  name        = "/${var.project_name}/qdrant-api-key"
  description = "Qdrant Cloud API Key for KnowledgeLLM"
  type        = "SecureString"
  value       = "CHANGE_ME"

  lifecycle {
    ignore_changes = [value]
  }
}

locals {
  lambda_package     = abspath("${path.module}/${var.lambda_package_path}")
  cognito_issuer     = "https://cognito-idp.${var.aws_region}.${data.aws_partition.current.dns_suffix}/${aws_cognito_user_pool.users.id}"
  qdrant_api_key_arn = var.qdrant_api_key_secret_arn != "" ? var.qdrant_api_key_secret_arn : aws_ssm_parameter.qdrant_api_key[0].arn
  groq_api_key_arn   = var.groq_api_key_secret_arn != "" ? var.groq_api_key_secret_arn : aws_ssm_parameter.groq_api_key[0].arn
  common_environment = {
    PYTHONPATH                       = "/var/task/src"
    DOCUMENTS_BUCKET                 = aws_s3_bucket.documents.id
    QDRANT_URL                       = var.qdrant_url
    QDRANT_API_KEY_SECRET_ARN        = local.qdrant_api_key_arn
    QDRANT_COLLECTION                = "knowledgellm"
    EMBEDDING_MODEL                  = "sentence-transformers/all-MiniLM-L6-v2"
    GROQ_API_KEY_SECRET_ARN          = local.groq_api_key_arn
    GROQ_MODEL                       = var.groq_model
    GROQ_INPUT_RATE_PER_MILLION_USD  = var.groq_input_rate_per_million_usd
    GROQ_OUTPUT_RATE_PER_MILLION_USD = var.groq_output_rate_per_million_usd
  }
  ingestion_environment = {
    PYTHONPATH                = "/var/task/src"
    DOCUMENTS_BUCKET          = aws_s3_bucket.documents.id
    QDRANT_URL                = var.qdrant_url
    QDRANT_API_KEY_SECRET_ARN = local.qdrant_api_key_arn
    QDRANT_COLLECTION         = "knowledgellm"
    EMBEDDING_MODEL           = "sentence-transformers/all-MiniLM-L6-v2"
  }
  lambda_trust_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  lambda_names = {
    knowledge = "${var.project_name}-knowledge"
    ingestion = "${var.project_name}-ingestion"
  }
}

resource "aws_cognito_user_pool" "users" {
  name = "${var.project_name}-users"
  username_configuration {
    case_sensitive = false
  }
  admin_create_user_config {
    allow_admin_create_user_only = true
  }
  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }
}

resource "aws_cognito_user_group" "department" {
  for_each     = toset(["finance", "operations", "people"])
  name         = each.value
  user_pool_id = aws_cognito_user_pool.users.id
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${var.project_name}-web"
  user_pool_id                         = aws_cognito_user_pool.users.id
  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  explicit_auth_flows                  = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_PASSWORD_AUTH"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "profile", "email"]
  callback_urls                        = [var.web_callback_url]
  logout_urls                          = [var.web_logout_url]
  supported_identity_providers         = ["COGNITO"]
}

resource "aws_cognito_user_pool_domain" "login" {
  domain                = var.cognito_domain_prefix
  user_pool_id          = aws_cognito_user_pool.users.id
  managed_login_version = 2
}

resource "aws_cognito_managed_login_branding" "web" {
  user_pool_id                = aws_cognito_user_pool.users.id
  client_id                   = aws_cognito_user_pool_client.web.id
  use_cognito_provided_values = true
  depends_on                  = [aws_cognito_user_pool_domain.login]
}

resource "aws_s3_bucket" "documents" {
  bucket_prefix = "${var.project_name}-docs-"
  force_destroy = false
}

resource "aws_s3_bucket" "lambda_artifacts" {
  bucket_prefix = "${var.project_name}-lambda-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "lambda_artifacts" {
  bucket                  = aws_s3_bucket.lambda_artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lambda_artifacts" {
  bucket = aws_s3_bucket.lambda_artifacts.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_object" "lambda_package" {
  bucket      = aws_s3_bucket.lambda_artifacts.id
  key         = "packages/knowledgellm-lambda.zip"
  source      = local.lambda_package
  source_hash = filebase64sha256(local.lambda_package)
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_notification" "documents" {
  bucket      = aws_s3_bucket.documents.id
  eventbridge = true
}

resource "aws_iam_role" "knowledge" {
  name               = "${var.project_name}-knowledge"
  assume_role_policy = local.lambda_trust_policy
}

resource "aws_iam_role" "ingestion" {
  name               = "${var.project_name}-ingestion"
  assume_role_policy = local.lambda_trust_policy
}

resource "aws_iam_role_policy" "knowledge" {
  name = "${var.project_name}-knowledge-runtime"
  role = aws_iam_role.knowledge.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:${data.aws_partition.current.partition}:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.lambda_names.knowledge}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.documents.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "ssm:GetParameter"
        ]
        Resource = [local.qdrant_api_key_arn, local.groq_api_key_arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "ingestion" {
  name = "${var.project_name}-ingestion-runtime"
  role = aws_iam_role.ingestion.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:${data.aws_partition.current.partition}:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.lambda_names.ingestion}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.documents.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "ssm:GetParameter"
        ]
        Resource = [local.qdrant_api_key_arn]
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = local.lambda_names
  name              = "/aws/lambda/${each.value}"
  retention_in_days = 7
}

resource "aws_lambda_function" "knowledge" {
  function_name    = local.lambda_names.knowledge
  role             = aws_iam_role.knowledge.arn
  s3_bucket        = aws_s3_bucket.lambda_artifacts.id
  s3_key           = aws_s3_object.lambda_package.key
  source_code_hash = filebase64sha256(local.lambda_package)
  handler          = "knowledgellm.handler.handler"
  runtime          = "python3.12"
  timeout          = 28
  memory_size      = 1024
  depends_on       = [aws_iam_role_policy.knowledge, aws_cloudwatch_log_group.lambda]
  environment { variables = local.common_environment }
  logging_config {
    log_format            = "JSON"
    application_log_level = "INFO"
    system_log_level      = "WARN"
    log_group             = aws_cloudwatch_log_group.lambda["knowledge"].name
  }
}

resource "aws_lambda_function" "ingestion" {
  function_name    = local.lambda_names.ingestion
  role             = aws_iam_role.ingestion.arn
  s3_bucket        = aws_s3_bucket.lambda_artifacts.id
  s3_key           = aws_s3_object.lambda_package.key
  source_code_hash = filebase64sha256(local.lambda_package)
  handler          = "knowledgellm.ingest.handler"
  runtime          = "python3.12"
  timeout          = 180
  memory_size      = 2048
  depends_on       = [aws_iam_role_policy.ingestion, aws_cloudwatch_log_group.lambda]
  environment { variables = local.ingestion_environment }
  logging_config {
    log_format            = "JSON"
    application_log_level = "INFO"
    system_log_level      = "WARN"
    log_group             = aws_cloudwatch_log_group.lambda["ingestion"].name
  }
}

resource "aws_apigatewayv2_api" "knowledge" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = [var.web_origin]
    allow_headers = ["authorization", "content-type"]
    allow_methods = ["GET", "POST", "OPTIONS"]
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.knowledge.id
  name             = "CognitoJwt"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id]
    issuer   = local.cognito_issuer
  }
}

resource "aws_apigatewayv2_integration" "knowledge" {
  api_id                 = aws_apigatewayv2_api.knowledge.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.knowledge.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.knowledge.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.knowledge.id}"
}

resource "aws_apigatewayv2_route" "protected" {
  for_each             = toset(["GET /documents", "GET /documents/{documentId}", "POST /chat"])
  api_id               = aws_apigatewayv2_api.knowledge.id
  route_key            = each.value
  target               = "integrations/${aws_apigatewayv2_integration.knowledge.id}"
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.cognito.id
  authorization_scopes = ["openid"]
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.knowledge.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowHttpApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.knowledge.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.knowledge.execution_arn}/*/*"
}

resource "aws_cloudwatch_event_rule" "document_created" {
  name = "${var.project_name}-document-created"
  event_pattern = jsonencode({
    source        = ["aws.s3"]
    "detail-type" = ["Object Created"]
    detail        = { bucket = { name = [aws_s3_bucket.documents.id] } }
  })
}

resource "aws_cloudwatch_event_target" "ingestion" {
  rule      = aws_cloudwatch_event_rule.document_created.name
  target_id = "IngestionLambda"
  arn       = aws_lambda_function.ingestion.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowS3EventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingestion.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.document_created.arn
}
