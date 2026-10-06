terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "registry.terraform.io/hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "knowledgellm-tfstate-768363152398"
    key          = "knowledgellm/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "Terraform"
    }
  }
}
