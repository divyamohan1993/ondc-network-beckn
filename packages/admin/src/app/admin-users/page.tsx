'use client';

import { useEffect, useState, useCallback } from 'react';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER';
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

const roleBadgeClass: Record<string, string> = {
  SUPER_ADMIN: 'badge-saffron',
  ADMIN: 'badge-blue',
  VIEWER: 'badge-gray',
};

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  VIEWER: 'Viewer',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Add form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'ADMIN' | 'VIEWER'>('ADMIN');
  const [formError, setFormError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/admin/api/admin-users');
      if (!res.ok) throw new Error('Failed to fetch admin users');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data.users ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/admin/api/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          password: formPassword,
          role: formRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? data.error ?? 'Failed to create admin user');
      }

      setFormName('');
      setFormEmail('');
      setFormPassword('');
      setFormRole('ADMIN');
      setShowAddForm(false);
      await fetchUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create admin user');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(user: AdminUser) {
    setActionInProgress(`toggle-${user.id}`);
    try {
      const res = await fetch(`/admin/api/admin-users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error?.message ?? data.error ?? 'Failed to update user');
        return;
      }
      await fetchUsers();
    } catch {
      alert('Failed to update user');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleChangeRole(user: AdminUser, newRole: string) {
    if (newRole === user.role) return;
    setActionInProgress(`role-${user.id}`);
    try {
      const res = await fetch(`/admin/api/admin-users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error?.message ?? data.error ?? 'Failed to update role');
        return;
      }
      await fetchUsers();
    } catch {
      alert('Failed to update role');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleDeactivate(user: AdminUser) {
    if (!window.confirm(`Deactivate ${user.name}? This will revoke their access.`)) return;
    setActionInProgress(`deactivate-${user.id}`);
    try {
      const res = await fetch(`/admin/api/admin-users/${user.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error?.message ?? data.error ?? 'Failed to deactivate user');
        return;
      }
      await fetchUsers();
    } catch {
      alert('Failed to deactivate user');
    } finally {
      setActionInProgress(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">
            Admin <span className="text-gradient-saffron">Users</span>
          </h1>
          <p className="page-subtitle">Manage admin dashboard access and roles</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-primary"
        >
          {showAddForm ? 'Cancel' : '+ Add Admin'}
        </button>
      </div>

      {/* Add Admin Form */}
      {showAddForm && (
        <div className="card">
          <h3 className="card-header">Add New Admin</h3>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="input w-full"
                  placeholder="Full name"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="input w-full"
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="input w-full"
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">
                  Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as 'ADMIN' | 'VIEWER')}
                  className="select w-full"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-ash-600">
              Super Admin accounts cannot be created from the UI for security reasons.
            </p>
            {formError && (
              <div
                className="px-4 py-3 rounded-lg text-sm"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#F87171',
                }}
              >
                {formError}
              </div>
            )}
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Creating...' : 'Create Admin'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#F87171',
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-ash-500">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Loading admin users...</span>
          </div>
        </div>
      ) : (
        /* Table */
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="text-white font-medium">{user.name}</td>
                  <td className="text-ash-400">{user.email}</td>
                  <td>
                    <span className={roleBadgeClass[user.role] ?? 'badge-gray'}>
                      {roleLabels[user.role] ?? user.role}
                    </span>
                  </td>
                  <td>
                    <span className={user.isActive ? 'badge-green' : 'badge-red'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-xs text-ash-500">
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={actionInProgress !== null || user.role === 'SUPER_ADMIN'}
                        className="btn-secondary text-xs"
                        title={user.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {actionInProgress === `toggle-${user.id}`
                          ? '...'
                          : user.isActive
                          ? 'Deactivate'
                          : 'Activate'}
                      </button>
                      {user.role !== 'SUPER_ADMIN' && (
                        <select
                          value={user.role}
                          onChange={(e) => handleChangeRole(user, e.target.value)}
                          disabled={actionInProgress !== null}
                          className="select text-xs"
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                      )}
                      {user.role !== 'SUPER_ADMIN' && (
                        <button
                          onClick={() => handleDeactivate(user)}
                          disabled={actionInProgress !== null}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#F87171',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                          }}
                        >
                          {actionInProgress === `deactivate-${user.id}` ? '...' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-ash-600">
                    No admin users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
