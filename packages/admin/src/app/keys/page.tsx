import { sql } from 'drizzle-orm';
import db from '@/lib/db';
import { subscribers } from '@ondc/shared';
import KeyCopyButton from './key-copy-button';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    page?: string;
  }>;
}

const PAGE_SIZE = 25;

function maskKey(key: string) {
  if (key.length <= 8) return key;
  return key.slice(0, 8) + '...';
}

export default async function KeysPage({ searchParams: searchParamsPromise }: PageProps) {
  const searchParams = await searchParamsPromise;
  const page = parseInt(searchParams.page ?? '1', 10);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, [{ count: totalCount }]] = await Promise.all([
    db
      .select({
        id: subscribers.id,
        subscriber_id: subscribers.subscriber_id,
        unique_key_id: subscribers.unique_key_id,
        signing_public_key: subscribers.signing_public_key,
        encr_public_key: subscribers.encr_public_key,
        type: subscribers.type,
        status: subscribers.status,
        created_at: subscribers.created_at,
      })
      .from(subscribers)
      .orderBy(sql`created_at DESC`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscribers),
  ]);

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title font-display">Key <span className="text-gradient-saffron">Management</span></h1>
        <p className="page-subtitle">View and manage participant public keys</p>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Subscriber ID</th>
              <th>Type</th>
              <th>Unique Key ID</th>
              <th>Signing Key</th>
              <th>Encryption Key</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.subscriber_id}</td>
                <td>
                  <span className="badge-blue">{row.type}</span>
                </td>
                <td className="font-mono text-xs">{row.unique_key_id}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <code className="text-xs bg-white/10 px-2 py-1 rounded font-mono text-ash-300">
                      {maskKey(row.signing_public_key)}
                    </code>
                    <KeyCopyButton text={row.signing_public_key} />
                  </div>
                </td>
                <td>
                  {row.encr_public_key ? (
                    <div className="flex items-center gap-1">
                      <code className="text-xs bg-white/10 px-2 py-1 rounded font-mono text-ash-300">
                        {maskKey(row.encr_public_key)}
                      </code>
                      <KeyCopyButton text={row.encr_public_key} />
                    </div>
                  ) : (
                    <span className="text-ash-600 text-xs">-</span>
                  )}
                </td>
                <td>
                  <span className={row.status === 'SUBSCRIBED' ? 'badge-green' : 'badge-gray'}>
                    {row.status}
                  </span>
                </td>
                <td className="text-xs text-ash-500">
                  {row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-ash-600">
                  No keys found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ash-500">
            Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount} keys
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/keys?page=${page - 1}`}
                className="btn-secondary text-xs"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/keys?page=${page + 1}`}
                className="btn-secondary text-xs"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
