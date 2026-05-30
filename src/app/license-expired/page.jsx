'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function LicenseExpiredPage() {
  const licenseEnabled = process.env.NEXT_PUBLIC_LICENSE_ENABLED === 'true';

  return (
    <div className="min-h-screen bg-[#f7f4ef] flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm border border-[#e8ded2] text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#f5e4dc] text-[#9a4f36]">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold text-[#26211d]">
          {licenseEnabled ? 'License Review Required' : 'License Checks Disabled'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#6f6258]">
          {licenseEnabled
            ? 'License enforcement hooks are available, but renewal will be completed during the final production launch.'
            : 'This testing build never blocks access with license validation or expiry checks.'}
        </p>
        <Link
          href="/login"
          className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-[#6b4f3f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#563f32]"
        >
          Back to Salon POS
        </Link>
      </div>
    </div>
  );
}
