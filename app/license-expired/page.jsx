'use client';

import { useState, useEffect } from 'react';
import { Shield, AlertCircle, Calendar, RefreshCw, Phone, Mail, Key, X } from 'lucide-react';

export default function LicenseExpiredPage() {
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showNewLicenseModal, setShowNewLicenseModal] = useState(false);
  const [newLicenseKey, setNewLicenseKey] = useState('');
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchLicenseInfo();
  }, []);

  const fetchLicenseInfo = async () => {
    try {
      const res = await fetch('/api/license/check');
      const data = await res.json();
      setLicenseInfo(data);
    } catch (error) {
      console.error('Failed to fetch license info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckLicenseStatus = async () => {
    setChecking(true);
    setMessage({ type: '', text: '' });
    
    try {
      const res = await fetch('/api/license/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'License renewed! Redirecting...' });
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        setMessage({ 
          type: 'error', 
          text: data.error || 'License is still expired. Please contact your administrator to renew.' 
        });
      }
    } catch (error) {
      console.error('Check license error:', error);
      setMessage({ 
        type: 'error', 
        text: 'Failed to check license status. Please try again.' 
      });
    } finally {
      setChecking(false);
    }
  };

  const handleUpdateLicense = async () => {
    if (!newLicenseKey.trim()) {
      setMessage({ type: 'error', text: 'Please enter a valid license key' });
      return;
    }

    setUpdating(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await fetch('/api/license/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: newLicenseKey.trim() })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'License updated successfully! Redirecting...' });
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        setMessage({ 
          type: 'error', 
          text: data.error || 'Failed to update license. Please check the license key.' 
        });
      }
    } catch (error) {
      console.error('Update license error:', error);
      setMessage({ 
        type: 'error', 
        text: 'Failed to update license. Please try again.' 
      });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  const expiryDate = licenseInfo?.license?.expiry_date 
    ? new Date(licenseInfo.license.expiry_date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : 'Unknown';

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-orange-600 p-8 text-white">
            <div className="flex items-center justify-center mb-4">
              <div className="p-4 bg-white/20 rounded-full backdrop-blur-sm">
                <AlertCircle className="w-16 h-16" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-center mb-2">
              License Expired
            </h1>
            <p className="text-center text-red-100 text-lg">
              Your salon POS license has expired and needs renewal
            </p>
          </div>

          {/* Body */}
          <div className="p-8">
            {/* License Info */}
            {licenseInfo?.license && (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 mb-6">
                <div className="flex items-start gap-3 mb-4">
                  <Shield className="w-6 h-6 text-red-600 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-3">License Details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-600">Salon</p>
                        <p className="font-semibold text-gray-900">
                          {licenseInfo.license.restaurant_name || 'Salon'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">License Key</p>
                        <p className="font-mono text-xs text-gray-900">
                          {licenseInfo.license.license_key}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Plan Type</p>
                        <p className="font-semibold text-gray-900">
                          {licenseInfo.license.plan_type}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Expired On</p>
                        <p className="font-semibold text-red-700 flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {expiryDate}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {licenseInfo.status?.in_grace_period && (
                  <div className="bg-yellow-100 border border-yellow-300 rounded p-3 mt-3">
                    <p className="text-sm text-yellow-800">
                      <strong>Grace Period:</strong> You have {licenseInfo.status.grace_days_remaining} days remaining in your grace period.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Action Required */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                Renewal Options
              </h3>
              <div className="space-y-3 text-sm text-gray-700">
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="font-semibold text-blue-600 mb-2">Option 1: Check License Status</p>
                  <p className="mb-2">If your administrator has already renewed your license in the admin panel:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                    <li>Click "Check License Status" button below</li>
                    <li>System will verify with admin server</li>
                    <li>If renewed, your local database will update automatically</li>
                  </ul>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="font-semibold text-green-600 mb-2">Option 2: Enter New License Key</p>
                  <p className="mb-2">If you received a new license key:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                    <li>Click "Enter New License Key" button below</li>
                    <li>Enter the new license key provided</li>
                    <li>System will verify and update your license</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Need Help?</h3>
              <div className="space-y-2 text-sm">
                <p className="text-gray-700">
                  Contact your salon POS administrator to renew your license.
                </p>
                <div className="flex flex-wrap gap-3 mt-3">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Phone className="w-4 h-4 text-blue-600" />
                    <span className="text-xs">Contact your provider</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <span className="text-xs">Email support</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Message Display */}
            {message.text && (
              <div className={`mb-4 p-4 rounded-lg border ${
                message.type === 'success' 
                  ? 'bg-green-50 border-green-200 text-green-800' 
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                <p className="text-sm font-medium">{message.text}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCheckLicenseStatus}
                disabled={checking}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors font-semibold"
              >
                <RefreshCw className={`w-5 h-5 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Checking...' : 'Check License Status'}
              </button>
              <button
                onClick={() => setShowNewLicenseModal(true)}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                <Key className="w-5 h-5" />
                Enter New License Key
              </button>

      {/* New License Key Modal */}
      {showNewLicenseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Key className="w-6 h-6 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Enter New License Key</h2>
              </div>
              <button
                onClick={() => {
                  setShowNewLicenseModal(false);
                  setNewLicenseKey('');
                  setMessage({ type: '', text: '' });
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Enter your new license key provided by your administrator. This will replace your current license.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  License Key
                </label>
                <input
                  type="text"
                  value={newLicenseKey}
                  onChange={(e) => setNewLicenseKey(e.target.value)}
                  placeholder="POS-2025-XXXXXXXX-XXXXXXXX"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none font-mono text-sm"
                />
              </div>

              {message.text && (
                <div className={`mb-4 p-3 rounded-lg border text-sm ${
                  message.type === 'success' 
                    ? 'bg-green-50 border-green-200 text-green-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {message.text}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowNewLicenseModal(false);
                    setNewLicenseKey('');
                    setMessage({ type: '', text: '' });
                  }}
                  disabled={updating}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateLicense}
                  disabled={updating || !newLicenseKey.trim()}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {updating ? 'Updating...' : 'Update License'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
            </div>

            {/* Warning */}
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-800 text-center">
                <strong>⚠️ System Locked:</strong> All POS features are disabled until license renewal.
                Your data is safe and will be accessible once the license is renewed.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Salon POS System © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
