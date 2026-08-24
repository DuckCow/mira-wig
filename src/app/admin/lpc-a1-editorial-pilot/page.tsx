import { EditorialMarkdown } from "@/components/public-content/EditorialMarkdown";
import { loadLpcA1EditorialPilot } from "@/lib/public-content/repository-editorial";

export default async function LpcA1EditorialPilotPage() {
  const pilot = await loadLpcA1EditorialPilot();

  return (
    <article className="space-y-8">
      <header className="space-y-4">
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-950">NON-PRODUCTION EDITORIAL PILOT</p>
          <p className="mt-1 text-sm text-amber-900">
            This content is not approved and is not publicly published.
          </p>
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-950">{pilot.title}</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">{pilot.summary}</p>
        </div>
      </header>

      <dl className="grid gap-3 rounded-md border border-gray-200 bg-white p-5 text-sm sm:grid-cols-2">
        <PilotField label="Content identity" value={pilot.contentIdentity} />
        <PilotField label="Family" value={pilot.family} />
        <PilotField label="Locale" value={pilot.locale} />
        <PilotField label="Revision" value={pilot.revision} />
        <div className="sm:col-span-2">
          <dt className="font-medium text-gray-500">Revision digest</dt>
          <dd className="mt-1 break-all font-mono text-xs text-gray-900">
            {pilot.revisionDigest}
          </dd>
        </div>
      </dl>

      <section aria-label="Editorial body" className="rounded-md border border-gray-200 bg-white p-6">
        <EditorialMarkdown body={pilot.body} />
      </section>
    </article>
  );
}

function PilotField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-gray-900">{value}</dd>
    </div>
  );
}
