'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Loader2, CheckCircle, AlertCircle, Store } from 'lucide-react';

function ActivationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isChangingLicense, setIsChangingLicense] = useState(false);
  const [step, setStep] = useState('input'); // input, validating, success, error
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState('');
  const [restaurantInfo, setRestaurantInfo] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [checkedActivation, setCheckedActivation] = useState(false);

  useEffect(() => {
    // Guard: Don't do anything if searchParams is not ready
    if (!searchParams) {
      console.log('⏳ Waiting for searchParams...');
      return;
    }
    
    // Set mounted and check if changing license
    const changeParam = searchParams.get('change');
    const changingLicense = changeParam === 'true';
    console.log('🔄 Activate page loaded - URL change param:', changeParam, '- changingLicense:', changingLicense);
    setIsChangingLicense(changingLicense);
    setMounted(true);
    
    // Only check activation if NOT changing license
    if (!changingLicense) {
      console.log('✅ Not changing license - checking activation');
      checkActivation();
    } else {
      console.log('🔑 Changing license mode - skipping activation check');
    }
    setCheckedActivation(true);
  }, [searchParams]);

  const checkActivation = async () => {
    console.log('📡 Calling /api/license/check...');
    try {
      const res = await fetch('/api/license/check');
      const data = await res.json();
      console.log('📊 License check response:', data);
      if (data.activated) {
        console.log('✅ Already activated - redirecting to login');
        router.push('/login');
      }
    } catch (err) {
      console.error('❌ Activation check failed:', err);
    }
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    setError('');
    setStep('validating');

    try {
      // Validate license with central admin server
      const validateRes = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseKey.trim() })
      });

      const data = await validateRes.json();

      if (!validateRes.ok) {
        setError(data.error || 'Invalid license key');
        setStep('error');
        return;
      }

      if (!data.valid) {
        setError(data.error || 'License validation failed');
        setStep('error');
        return;
      }

      // License valid, initialize database
      setRestaurantInfo(data.restaurant);
      setStep('success');

      // Clear old localStorage data so new restaurant info is loaded on next login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('restaurantInfo');
      localStorage.removeItem('settings');
      
      // Redirect to login after 2 seconds with full page reload
      setTimeout(() => {
        window.location.href = '/login'; // Use full page reload to clear all cached state
      }, 2000);

    } catch (err) {
      console.error('Activation error:', err);
      setError('Connection error. Please check your internet connection and try again.');
      setStep('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full mb-4 shadow-lg">
            <Shield className="w-10 h-10 text-white" />
          </div>
          {mounted ? (
            <>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {isChangingLicense ? 'Change License Key' : 'POS System Activation'}
              </h1>
              <p className="text-gray-600">
                {isChangingLicense 
                  ? 'Enter a new license key to switch databases'
                  : 'Enter your license key to get started'
                }
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                POS System Activation
              </h1>
              <p className="text-gray-600">
                Enter your license key to get started
              </p>
            </>
          )}
        </div>

        {/* Input Step */}
        {step === 'input' && (
          <form onSubmit={handleActivate} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                License Key
              </label>
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="POS-2025-X-XXXXXXXX"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-center text-lg"
                required
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500">
                Enter the license key provided by your administrator
              </p>
              {mounted && isChangingLicense && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-800">
                    <strong>Note:</strong> Changing the license key will switch to a different database. 
                    If the license key is new, a fresh database will be created. If it exists, you'll access the existing data.
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              {mounted && isChangingLicense ? 'Change License' : 'Activate System'}
            </button>
          </form>
        )}

        {/* Validating Step */}
        {step === 'validating' && (
          <div className="text-center py-8">
            <Loader2 className="w-16 h-16 text-blue-600 mx-auto mb-4 animate-spin" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Validating License...
            </h3>
            <p className="text-gray-600">
              Please wait while we verify your license key
            </p>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && restaurantInfo && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              Activation Successful!
            </h3>
            <p className="text-gray-600 mb-6">
              Welcome to POS System
            </p>
            
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 mb-6 border border-blue-200">
              <div className="flex items-center gap-3 mb-3">
                <Store className="w-6 h-6 text-blue-600" />
                <h4 className="text-lg font-semibold text-gray-900">
                  {restaurantInfo.restaurant_name}
                </h4>
              </div>
              <div className="text-sm text-gray-700 space-y-1">
                <p><span className="font-medium">Plan:</span> {restaurantInfo.plan_type}</p>
                <p><span className="font-medium">Valid Until:</span> {new Date(restaurantInfo.expiry_date).toLocaleDateString()}</p>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              Redirecting to login...
            </p>
          </div>
        )}

        {/* Error Step */}
        {step === 'error' && (
          <div className="py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4 mx-auto block">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2 text-center">
              Activation Failed
            </h3>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
            <button
              onClick={() => {
                setStep('input');
                setError('');
                setLicenseKey('');
              }}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            Need help? Contact your administrator
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ActivationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
            <Loader2 className="w-10 h-10 text-blue-600 mx-auto mb-3 animate-spin" />
            <p className="text-gray-600">Loading activation page...</p>
          </div>
        </div>
      }
    >
      <ActivationContent />
    </Suspense>
  );
}
