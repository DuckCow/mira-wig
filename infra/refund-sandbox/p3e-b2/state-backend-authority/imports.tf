import {
  to = module.state_bucket.google_storage_bucket.state
  id = var.bucket_name
}

import {
  for_each = toset(var.state_runner_members)

  to = module.state_bucket.google_storage_bucket_iam_member.state_runner[each.key]
  id = "b/${var.bucket_name} roles/storage.objectAdmin ${each.value}"
}

import {
  for_each = toset(var.state_administrator_members)

  to = module.state_bucket.google_storage_bucket_iam_member.state_administrator[each.key]
  id = "b/${var.bucket_name} roles/storage.admin ${each.value}"
}

import {
  for_each = toset(var.break_glass_state_administrator_members)

  to = module.state_bucket.google_storage_bucket_iam_member.break_glass_state_administrator[each.key]
  id = "b/${var.bucket_name} roles/storage.admin ${each.value}"
}
