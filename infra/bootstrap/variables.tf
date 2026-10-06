variable "aws_region" {
  description = "AWS region for the remote state S3 bucket."
  type        = string
  default     = "ap-southeast-1"
}

variable "state_bucket_name" {
  description = "Name of the S3 bucket to store Terraform state."
  type        = string
  default     = "knowledgellm-tfstate-768363152398"
}
