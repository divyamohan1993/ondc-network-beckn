import { cookies } from 'next/headers';
import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';
import IssueCard from '@/components/IssueCard';

export const dynamic = 'force-dynamic';

export default async function IssuesPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value || 'en';
  const t = locale === 'hi' ? hi : en;

  // IGM issues will come from BPP API when implemented
  const issues: Array<{
    id: string;
    category: string;
    description: string;
    status: 'open' | 'resolved' | 'closed' | 'escalated';
    created_at: string;
  }> = [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t.issues.title}</h1>
        <p className="page-subtitle">{locale === 'hi' ? 'IGM शिकायत प्रबंधन' : 'IGM Issue Management'}</p>
      </div>

      {issues.length === 0 ? (
        <div className="card text-center py-12 text-ash-500">
          <svg className="w-10 h-10 text-ash-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>{t.issues.no_issues}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issueId={issue.id}
              category={issue.category}
              description={issue.description}
              status={issue.status}
              createdAt={issue.created_at}
              locale={locale}
              translations={t.issues}
            />
          ))}
        </div>
      )}
    </div>
  );
}
