import { sql, eq } from 'drizzle-orm';
import db from '@/lib/db';
import { domains, subscribers } from '@ondc/shared';
import DomainForm from './domain-form';
import DomainToggle from './domain-toggle';

export const dynamic = 'force-dynamic';

async function getDomains() {
  const rows = await db
    .select({
      id: domains.id,
      code: domains.code,
      name: domains.name,
      description: domains.description,
      schema_version: domains.schema_version,
      is_active: domains.is_active,
      created_at: domains.created_at,
    })
    .from(domains)
    .orderBy(sql`created_at DESC`);

  // Get participant counts per domain
  const bapCounts = await db
    .select({
      domain: subscribers.domain,
      count: sql<number>`count(*)::int`,
    })
    .from(subscribers)
    .where(eq(subscribers.type, 'BAP'))
    .groupBy(subscribers.domain);

  const bppCounts = await db
    .select({
      domain: subscribers.domain,
      count: sql<number>`count(*)::int`,
    })
    .from(subscribers)
    .where(eq(subscribers.type, 'BPP'))
    .groupBy(subscribers.domain);

  const bapMap = new Map(bapCounts.map((r) => [r.domain, r.count]));
  const bppMap = new Map(bppCounts.map((r) => [r.domain, r.count]));

  return rows.map((d) => ({
    ...d,
    bapCount: bapMap.get(d.code) ?? 0,
    bppCount: bppMap.get(d.code) ?? 0,
  }));
}

export default async function DomainsPage() {
  const domainList = await getDomains();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title font-display"><span className="text-gradient-saffron">Domains</span></h1>
        <p className="page-subtitle">Manage ONDC network domains</p>
      </div>

      {/* Create Domain Form */}
      <DomainForm />

      {/* Domains Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Description</th>
              <th>Schema Version</th>
              <th>Active BAPs</th>
              <th>Active BPPs</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {domainList.map((domain) => (
              <tr key={domain.id}>
                <td className="font-mono font-medium">{domain.code}</td>
                <td className="font-medium">{domain.name}</td>
                <td className="text-ash-500 max-w-xs truncate">{domain.description ?? '-'}</td>
                <td>{domain.schema_version}</td>
                <td>
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium">
                    {domain.bapCount}
                  </span>
                </td>
                <td>
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-teal-500/10 text-teal-400 text-sm font-medium">
                    {domain.bppCount}
                  </span>
                </td>
                <td>
                  <span className={domain.is_active ? 'badge-green' : 'badge-red'}>
                    {domain.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="text-xs text-ash-500">
                  {domain.created_at ? new Date(domain.created_at).toLocaleDateString() : '-'}
                </td>
                <td>
                  <DomainToggle id={domain.id} isActive={domain.is_active ?? true} />
                </td>
              </tr>
            ))}
            {domainList.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-ash-600">
                  No domains found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
