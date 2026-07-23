check "state_authorities_are_pairwise_distinct" {
  assert {
    condition = (
      length(setintersection(
        toset(var.state_runner_members),
        toset(var.state_administrator_members),
      )) == 0 &&
      length(setintersection(
        toset(var.state_runner_members),
        toset(var.break_glass_state_administrator_members),
      )) == 0 &&
      length(setintersection(
        toset(var.state_administrator_members),
        toset(var.break_glass_state_administrator_members),
      )) == 0
    )
    error_message = "State runner, administrator, and break-glass principal sets must be pairwise distinct."
  }
}
