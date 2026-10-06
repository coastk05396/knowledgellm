# Demo TODO checklist

Use this list to finish the KnowledgeLLM demo safely. Check each item only after verifying it in the target AWS account.

## Before AWS setup

- [ ] Confirm the AWS account, region, and current Free Tier eligibility.
- [ ] Review current AWS, Qdrant, and Groq quotas, prices, and data handling terms.
- [ ] Create Qdrant and Groq API keys, then store them in AWS Secrets Manager.
- [ ] Set a billing alert and choose a unique Cognito domain prefix.
- [ ] Build the Python 3.12 Lambda package with `rtk bash scripts/package-lambdas.sh`.
- [ ] Review `rtk terraform -chdir=infra/terraform plan`; confirm it contains only the expected demo resources.

## Deploy and configure

- [ ] Copy `infra/terraform/terraform.tfvars.example` to `infra/terraform/terraform.tfvars` and fill in non-secret endpoints and secret ARNs.
- [ ] Run `rtk terraform -chdir=infra/terraform init`, `validate`, `plan`, then `apply`.
- [ ] Copy Terraform outputs into the local web environment file.
- [ ] Create demo users administratively and place each in exactly one department group.
- [ ] Upload only fictional sample documents under their matching department prefixes.
- [ ] Verify each user's document list and chat citations only include their own department.

## Observability and demo checks

- [ ] Ask a normal question and check CloudWatch for token counts, estimated cost, latency, and department.
- [ ] Use Logs Insights on Terraform output `knowledge_log_group_name` to group events by `guardrail_action`.
- [ ] Try a question containing an email/phone/SSN pattern and verify the guardrail outcome is logged without recording the question.
- [ ] Check that retrieved source PII is redacted and an answer containing PII is blocked.
- [ ] Verify both Lambda log groups have seven-day retention and inspect sample logs for accidental prompt, answer, document, or PII content.
- [ ] Confirm the CloudWatch account usage remains within the current free allowance; review billing after the demo.

## Clean up

- [ ] Remove all object versions from the demo S3 bucket.
- [ ] Run `rtk terraform -chdir=infra/terraform destroy` and confirm the Terraform-managed resources are gone.
- [ ] Delete external Qdrant/Groq demo keys or clusters if they are no longer needed.
