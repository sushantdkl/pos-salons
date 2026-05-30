'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Key, Calendar, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function LicenseWarning() {
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [showActivation, setShowActivation] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkLicense();
    // Check every hour
    const interval = setInterval(checkLicense, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkLicense = async () => {
    try {
      const res = await fetch('/api/license/check');
      const data = await res.json();
      setLicenseStatus(data);
      
      // Show activation modal if no license
      if (!data.license) {
        setShowActivation(true);
      }
    } catch (error) {
      console.error('License check failed:', error);
    }
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    setError('');
    setActivating(true);

    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseKey })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Activation failed');
        return;
      }

      alert('License activated successfully!');
      setShowActivation(false);
      checkLicense();
    } catch (error) {
      setError('Connection error. Please check your internet.');
    } finally {
      setActivating(false);
    }
  };

  if (!licenseStatus) return null;

  const { status } = licenseStatus;

  // No license - show activation modal
  if (status?.status === 'no_license') {
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <ShieldAlert className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">License Required</h2>
            <p className="text-gray-600">Please enter your license key to activate the system.</p>
          </div>

          <form onSubmit={handleActivate} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                License Key
              </label>
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="POS-2025-XXX-XXXXXXXX"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                required
                disabled={activating}
              />
            </div>

            <button
              type="submit"
              disabled={activating}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {activating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Activating...
                </>
              ) : (
                <>
                  <Key className="w-5 h-5" />
                  Activate License
                </>
              )}
            </button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-6">
            Contact support if you don't have a license key
          </p>
        </div>
      </div>
    );
  }

  // Expired - show blocking modal
  if (status?.status === 'expired' && !status?.isValid) {
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">License Expired</h2>
            <p className="text-gray-600 mb-6">
              Your license has expired {Math.abs(status.daysRemaining)} days ago.
              Grace period has ended.
            </p>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 font-semibold mb-2">System Access Restricted</p>
              <p className="text-red-700 text-sm">
                Please contact support to renew your license and continue using the system.
              </p>
            </div>

            {licenseStatus.license && (
              <div className="text-left bg-gray-50 rounded-lg p-4 text-sm">
                <p className="text-gray-600 mb-1">License Key:</p>
                <code className="text-gray-900 font-mono text-xs">{licenseStatus.license.license_key}</code>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Grace period or expiring soon - show warning banner
  if (status?.showWarning || status?.in_grace_period) {
    const isGrace = status.status === 'grace' || status.in_grace_period;
    const bgColor = isGrace ? 'bg-red-600' : 'bg-yellow-500';
    const icon = isGrace ? AlertTriangle : Calendar;
    const Icon = icon;
    const daysLeft = isGrace ? (status.grace_days_remaining || status.graceRemaining) : status.days_remaining;

    return (
      <div className={`${bgColor} text-white px-4 py-3 shadow-lg`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">
                {isGrace 
                  ? `⚠️ License Expired - Grace Period Active`
                  : `License expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                }
              </p>
              {isGrace && (
                <p className="text-sm text-white/90 mt-0.5">
                  Grace period: {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining. Update license to avoid system lockout.
                </p>
              )}
            </div>
          </div>
          <a
            href="/admin/settings"
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
          >
            Update License
          </a>
        </div>
      </div>
    );
  }

  return null;
}
