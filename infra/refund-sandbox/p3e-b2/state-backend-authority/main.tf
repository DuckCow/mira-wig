module "state_bucket" {
  source = "../modules/state-bucket"

  project_id                              = var.project_id
  bucket_name                             = var.bucket_name
  location                                = var.location
  state_runner_members                    = var.state_runner_members
  state_administrator_members             = var.state_administrator_members
  break_glass_state_administrator_members = var.break_glass_state_administrator_members
  recovery_configuration                  = var.recovery_configuration
}
