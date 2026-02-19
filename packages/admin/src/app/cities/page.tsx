import { sql } from 'drizzle-orm';
import db from '@/lib/db';
import { cities } from '@ondc/shared';
import CityForm from './city-form';
import CityToggle from './city-toggle';

export const dynamic = 'force-dynamic';

export default async function CitiesPage() {
  const rows = await db
    .select()
    .from(cities)
    .orderBy(sql`name ASC`);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title font-display"><span className="text-gradient-saffron">Cities</span></h1>
        <p className="page-subtitle">Manage network-supported cities</p>
      </div>

      {/* Add City Form */}
      <CityForm />

      {/* Cities Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>State</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((city) => (
              <tr key={city.id}>
                <td className="font-mono font-medium">{city.code}</td>
                <td className="font-medium">{city.name}</td>
                <td>{city.state ?? '-'}</td>
                <td>
                  <span className={city.is_active ? 'badge-green' : 'badge-red'}>
                    {city.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <CityToggle id={city.id} isActive={city.is_active ?? true} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-ash-600">
                  No cities found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
