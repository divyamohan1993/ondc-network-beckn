import { sql } from 'drizzle-orm';
import db from '@/lib/db';
import { networkPolicies } from '@ondc/shared';
import PolicyForm from './policy-form';
import PolicyEditRow from './policy-edit-row';

export const dynamic = 'force-dynamic';

export default async function PoliciesPage() {
  const rows = await db
    .select()
    .from(networkPolicies)
    .orderBy(sql`domain NULLS FIRST, key ASC`);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title font-display">Network <span className="text-gradient-saffron">Policies</span></h1>
        <p className="page-subtitle">Configure global and domain-specific network policies</p>
      </div>

      {/* Create Policy Form */}
      <PolicyForm />

      {/* Policies Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
              <th>Domain</th>
              <th>Description</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((policy) => (
              <PolicyEditRow key={policy.id} policy={policy} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-ash-600">
                  No policies configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
