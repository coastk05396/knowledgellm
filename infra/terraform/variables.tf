variable "aws_region" {
  description = "AWS region for the prototype resources."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Prefix for named resources."
  type        = string
  default     = "knowledgellm-demo"
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$", var.project_name))
    error_message = "Use 3-30 lowercase letters, numbers, or hyphens, beginning and ending with a letter or number."
  }
}

variable "cognito_domain_prefix" {
  description = "Globally unique lowercase Cognito managed-login prefix."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", var.cognito_domain_prefix))
    error_message = "Use 1-63 lowercase letters, numbers, or hyphens, beginning and ending with a letter or number."
  }
}

variable "web_origin" {
  description = "Browser origin allowed to call the API."
  type        = string
  default     = "https://rag.rickchen.si"
}

variable "web_callback_url" {
  description = "Exact Cognito OAuth callback URL."
  type        = string
  default     = "https://rag.rickchen.si/"
}

variable "web_logout_url" {
  description = "Exact Cognito post-logout URL."
  type        = string
  default     = "https://rag.rickchen.si/"
}

variable "qdrant_url" {
  description = "Qdrant endpoint URL."
  type        = string
}

variable "qdrant_api_key_secret_arn" {
  description = "ARN of the Qdrant API key secret in Secrets Manager or SSM Parameter Store. If left blank, Terraform creates a free SSM parameter."
  type        = string
  default     = ""
  sensitive   = true
}

variable "groq_api_key_secret_arn" {
  description = "ARN of the Groq API key secret in Secrets Manager or SSM Parameter Store. If left blank, Terraform creates a free SSM parameter."
  type        = string
  default     = ""
  sensitive   = true
}

variable "groq_model" {
  description = "Groq model ID."
  type        = string
  default     = "openai/gpt-oss-20b"
}

variable "groq_input_rate_per_million_usd" {
  description = "Current input token USD price per million; blank disables estimates."
  type        = string
  default     = ""
}

variable "groq_output_rate_per_million_usd" {
  description = "Current output token USD price per million; blank disables estimates."
  type        = string
  default     = ""
}

variable "lambda_package_path" {
  description = "Path to the locally built Lambda zip package."
  type        = string
  default     = "../../build/knowledgellm-lambda.zip"
}

variable "demo_mode" {
  description = "Allow public password-free access to fictional personas through Cognito custom challenges."
  type        = bool
  default     = false
}

variable "auth_lambda_package_path" {
  description = "Small standalone Cognito challenge Lambda zip built by scripts/package-lambdas.sh."
  type        = string
  default     = "../../build/demo-auth.zip"
}

variable "answer_cache_enabled" {
  description = "Enable fixed demo-answer caching only after validating the Qdrant Cloud Inference index migration."
  type        = bool
  default     = false
}
