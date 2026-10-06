output "state_bucket_name" {
  description = "The S3 bucket name for Terraform remote state."
  value       = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  description = "The ARN of the Terraform remote state S3 bucket."
  value       = aws_s3_bucket.terraform_state.arn
}

output "aws_region" {
  description = "The AWS region where the state bucket is located."
  value       = var.aws_region
}
