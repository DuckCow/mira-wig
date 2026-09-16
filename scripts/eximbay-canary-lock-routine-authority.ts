import type { Client } from "pg";

const EXACT_BODIES: Readonly<Record<string, string>> = {
  "mira_refund_canary_lock_payment": "\nDECLARE\n  locked boolean := false;\nBEGIN\n  SELECT true INTO locked\n  FROM public.\"Payment\" payment\n  WHERE payment.\"id\" = target_id\n  FOR UPDATE;\n  RETURN COALESCE(locked, false);\nEND\n",
  "mira_refund_canary_lock_provider_operation_binding": "\nDECLARE\n  locked boolean := false;\nBEGIN\n  SELECT true INTO locked\n  FROM public.\"RefundExecutionProviderOperationBinding\" binding\n  WHERE binding.\"id\" = target_id\n  FOR UPDATE;\n  RETURN COALESCE(locked, false);\nEND\n",
  "mira_refund_canary_lock_command_events": "\nBEGIN\n  PERFORM event.\"id\"\n  FROM public.\"RefundExecutionCommandEvent\" event\n  WHERE event.\"commandId\" = target_command_id\n  ORDER BY event.\"occurredAt\", event.\"id\"\n  FOR UPDATE;\nEND\n",
  "mira_refund_canary_lock_evidence": "\nBEGIN\n  PERFORM evidence.\"id\"\n  FROM public.\"RefundExecutionEvidence\" evidence\n  WHERE evidence.\"commandId\" = target_command_id\n  ORDER BY evidence.\"id\"\n  FOR UPDATE;\nEND\n"
};

/** F1–F4 are the only SECURITY DEFINER exception, including exact ACL and body. */
export async function verifyExactCanaryLockRoutines(database: Pick<Client, "query">): Promise<void> {
  const result = await database.query<{ name: string; body: string; valid: boolean }>(`
    SELECT p.proname AS name, p.prosrc AS body,
      n.nspname = 'public' AND p.prosecdef AND p.provolatile = 'v'
      AND l.lanname = 'plpgsql' AND p.prokind = 'f'
      AND pg_get_function_identity_arguments(p.oid) = CASE
        WHEN p.proname IN ('mira_refund_canary_lock_payment', 'mira_refund_canary_lock_provider_operation_binding')
          THEN 'target_id text' ELSE 'target_command_id text' END
      AND pg_get_function_result(p.oid) = CASE
        WHEN p.proname IN ('mira_refund_canary_lock_payment', 'mira_refund_canary_lock_provider_operation_binding')
          THEN 'boolean' ELSE 'void' END
      AND p.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::text[]
      AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND current_user NOT IN ('mira_refund_canary', 'mira_refund_preflight')
      AND (SELECT count(*) = 2 FROM aclexplode(p.proacl))
      AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) acl
        WHERE acl.privilege_type <> 'EXECUTE' OR acl.is_grantable
          OR acl.grantor <> p.proowner
          OR acl.grantee NOT IN (p.proowner, (SELECT oid FROM pg_roles WHERE rolname = 'mira_refund_canary')))
      AS valid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE p.proname = ANY($1::text[]) AND n.nspname = 'public'
  `, [Object.keys(EXACT_BODIES)]);
  if (result.rows.length !== 4 || result.rows.some((row) => row.valid !== true
    || row.body !== EXACT_BODIES[row.name])) {
    throw new Error("REFUND_AUTHORIZATION_UNSAFE_DB_ENTRYPOINT");
  }
}
