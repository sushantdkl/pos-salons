import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | Salon POS System',
  description: 'Terms of service placeholder for the Salon POS launch checklist.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ef] px-4 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#e7ded2] bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Launch placeholder</p>
        <h1 className="mt-3 text-3xl font-semibold text-gray-950">Terms of Service</h1>
        <p className="mt-4 leading-7 text-gray-700">
          This page is reserved for final commercial terms. Before public launch, it should cover acceptable use, billing, support,
          data responsibilities, limitation of liability, and license activation terms when licensing is enabled.
        </p>
        <Link href="/login" className="mt-8 inline-flex rounded-xl bg-gray-950 px-5 py-3 font-semibold text-white hover:bg-gray-800">
          Back to POS Login
        </Link>
      </div>
    </main>
  );
}
