'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default function ActivationPage() {
  const licenseEnabled = process.env.NEXT_PUBLIC_LICENSE_ENABLED === 'true';

  return (
    <div className="min-h-screen bg-[#f7f4ef] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-[#e8ded2] text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#e9d7cb] text-[#6b4f3f]">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold text-[#26211d]">License Settings</h1>
        <p className="mt-3 text-sm leading-6 text-[#6f6258]">
          {licenseEnabled
            ? 'License activation is prepared for the final production release.'
            : 'License enforcement is disabled for testing, demos, and staging access.'}
        </p>
        <Link
          href="/login"
          className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-[#6b4f3f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#563f32]"
        >
          Continue to Salon POS
        </Link>
      </div>
    </div>
  );
}
