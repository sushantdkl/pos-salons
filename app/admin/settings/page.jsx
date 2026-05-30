'use client'

import { useState, useEffect } from 'react'
import AdminLayout from '@/components/admin/admin-layout'
import { Save, Store, Receipt, CreditCard, QrCode, Upload, X, Loader2, Shield, Key, AlertTriangle, Calendar, AlertCircle, RefreshCw, Moon, Sun } from 'lucide-react'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [licenseInfo, setLicenseInfo] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  
  // Credentials change states
  const [showCredentialsModal, setShowCredentialsModal] = useState(false)
  const [passwordData, setPasswordData] = useState({
    username: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  
  const [shopInfo, setShopInfo] = useState({
    shop_name: '',
    shop_address: '',
    shop_phone: '',
    shop_email: '',
    owner_name: '',
    vat_number: '',
    bank_qr_code: '',
    esewa_qr_code: ''
  })

  const [systemSettings, setSystemSettings] = useState({
    printFormat: 'thermal',
    currency: 'NPR',
    receiptFooter: 'Thank you for your business!',
    vat: 13,
    service_charge: 10
  })

  // Backup states
  const [showCloudBackupModal, setShowCloudBackupModal] = useState(false)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [cloudBackups, setCloudBackups] = useState([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState(false)

  useEffect(() => {
    loadSettings()
    loadLicenseInfo()
    loadCurrentUser()
  }, [])

  const loadCurrentUser = () => {
    const user = JSON.parse(localStorage.getItem('pos_user') || '{}')
    setCurrentUser(user)
    setPasswordData(prev => ({ ...prev, username: user.username || '' }))
  }

  const loadLicenseInfo = async () => {
    try {
      const res = await fetch('/api/license/check')
      if (res.ok) {
        const data = await res.json()
        if (data.activated && data.license) {
          setLicenseInfo(data)
        }
      }
    } catch (error) {
      console.error('Failed to load license info:', error)
    }
  }

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('pos_token')
      
      // Load settings from database
      const settingsRes = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        if (data.settings) {
          setShopInfo({
            shop_name: data.settings.restaurant_name || '',
            shop_address: data.settings.restaurant_address || '',
            shop_phone: data.settings.restaurant_phone || '',
            shop_email: data.settings.restaurant_email || '',
            owner_name: data.settings.owner_name || '',
            vat_number: data.settings.vat_number || '',
            bank_qr_code: data.settings.bank_qr_image || '',
            esewa_qr_code: data.settings.esewa_qr_image || ''
          })
          
          setSystemSettings(prev => ({
            ...prev,
            vat: data.settings.vat_percentage || 13,
            service_charge: data.settings.service_charge_percentage || 10
          }))
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  const handleQRUpload = (e, type) => {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please upload an image file' })
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      if (type === 'bank') {
        setShopInfo({ ...shopInfo, bank_qr_code: event.target.result })
      } else if (type === 'esewa') {
        setShopInfo({ ...shopInfo, esewa_qr_code: event.target.result })
      }
      setMessage({ type: 'success', text: 'QR code loaded. Click "Save Settings" to update.' })
    }
    reader.readAsDataURL(file)
  }

  const handleSaveShop = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage({ type: '', text: '' })

    try {
      const token = localStorage.getItem('pos_token')
      
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          restaurant_name: shopInfo.shop_name,
          restaurant_address: shopInfo.shop_address,
          restaurant_phone: shopInfo.shop_phone,
          restaurant_email: shopInfo.shop_email,
          owner_name: shopInfo.owner_name,
          vat_number: shopInfo.vat_number,
          vat_percentage: systemSettings.vat,
          service_charge_percentage: systemSettings.service_charge,
          bank_qr_image: shopInfo.bank_qr_code,
          esewa_qr_image: shopInfo.esewa_qr_code
        })
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' })
        setTimeout(() => setMessage({ type: '', text: '' }), 3000)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Connection error. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    
    if (!passwordData.username || passwordData.username.trim().length < 3) {
      setMessage({ type: 'error', text: 'Username must be at least 3 characters!' })
      return
    }
    
    const isChangingPassword = passwordData.newPassword || passwordData.confirmPassword
    if (isChangingPassword) {
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        setMessage({ type: 'error', text: 'New passwords do not match!' })
        return
      }
      
      if (passwordData.newPassword.length < 4) {
        setMessage({ type: 'error', text: 'Password must be at least 4 characters!' })
        return
      }
    }
    
    setSaving(true)
    try {
      const token = localStorage.getItem('pos_token')
      const res = await fetch('/api/auth/change-credentials', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currentUsername: currentUser?.username,
          newUsername: passwordData.username,
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword || null
        })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        setMessage({ type: 'success', text: data.message || 'Credentials updated successfully!' })
        
        const updatedUser = { ...currentUser, username: passwordData.username }
        localStorage.setItem('pos_user', JSON.stringify(updatedUser))
        setCurrentUser(updatedUser)
        
        setPasswordData({ username: passwordData.username, currentPassword: '', newPassword: '', confirmPassword: '' })
        setShowCredentialsModal(false)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update credentials' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Connection error. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const getLicenseStatusColor = () => {
    if (!licenseInfo?.status) return 'text-gray-600'
    const days = licenseInfo.status.days_remaining
    if (days <= 0 && licenseInfo.status.in_grace_period) return 'text-orange-600'
    if (days <= 0) return 'text-red-600'
    if (days <= 7) return 'text-yellow-600'
    return 'text-green-600'
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">Settings</h2>
        </div>

        {/* Floating Success/Error Message */}
        {message.text && (
          <div className="fixed top-20 right-6 z-50 animate-slide-in-right">
            <div className={`px-6 py-3 rounded-lg shadow-2xl text-sm font-semibold flex items-center gap-3 ${
              message.type === 'success' 
                ? 'bg-green-600 text-white' 
                : 'bg-red-600 text-white'
            }`}>
              <span className="text-2xl">
                {message.type === 'success' ? '✓' : '✗'}
              </span>
              <span>
                {message.text}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          
          <form onSubmit={handleSaveShop} className="space-y-6">
            {/* Business Information */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <Store className="text-blue-600" size={24} />
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">Business Information</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">Business Name</label>
                  <input
                    type="text"
                    value={shopInfo.shop_name}
                    onChange={(e) => setShopInfo({ ...shopInfo, shop_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    placeholder="My Restaurant"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">Owner Name</label>
                  <input
                    type="text"
                    value={shopInfo.owner_name}
                    onChange={(e) => setShopInfo({ ...shopInfo, owner_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    placeholder="Owner Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">Phone Number</label>
                  <input
                    type="tel"
                    value={shopInfo.shop_phone}
                    onChange={(e) => setShopInfo({ ...shopInfo, shop_phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    placeholder="+977-XXX-XXXXXX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">Email Address</label>
                  <input
                    type="email"
                    value={shopInfo.shop_email}
                    onChange={(e) => setShopInfo({ ...shopInfo, shop_email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    placeholder="contact@restaurant.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">VAT Number</label>
                  <input
                    type="text"
                    value={shopInfo.vat_number}
                    onChange={(e) => setShopInfo({ ...shopInfo, vat_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    placeholder="VAT-XXX-XXX-XXX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">VAT/Tax Rate (%)</label>
                  <input
                    type="number"
                    value={systemSettings.vat}
                    onChange={(e) => setSystemSettings({ ...systemSettings, vat: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="13"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold mb-2 text-gray-700">Business Address</label>
                  <textarea
                    value={shopInfo.shop_address}
                    onChange={(e) => setShopInfo({ ...shopInfo, shop_address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    rows="2"
                    placeholder="Street, City, Country"
                  />
                </div>
              </div>
            </div>

            {/* Receipt Settings */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <Receipt className="text-blue-600" size={24} />
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">Receipt Settings</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">Print Format</label>
                  <select
                    value={systemSettings.printFormat}
                    onChange={(e) => setSystemSettings({ ...systemSettings, printFormat: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                  >
                    <option value="thermal">Thermal (80mm)</option>
                    <option value="a4">A4 Paper</option>
                    <option value="a5">A5 Paper</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">Currency</label>
                  <select
                    value={systemSettings.currency}
                    onChange={(e) => setSystemSettings({ ...systemSettings, currency: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                  >
                    <option value="NPR">NPR (Rs)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="INR">INR (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">Service Charge (%)</label>
                  <input
                    type="number"
                    value={systemSettings.service_charge}
                    onChange={(e) => setSystemSettings({ ...systemSettings, service_charge: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="10"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-semibold mb-2 text-gray-700">Receipt Footer Message</label>
                  <textarea
                    value={systemSettings.receiptFooter}
                    onChange={(e) => setSystemSettings({ ...systemSettings, receiptFooter: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    rows="2"
                    placeholder="Thank you for your business!"
                  />
                </div>
              </div>
            </div>

            {/* Payment Settings */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <CreditCard className="text-blue-600" size={24} />
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">Payment QR Codes</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Bank QR Code */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4" />
                      Bank QR Code
                    </div>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleQRUpload(e, 'bank')}
                    className="hidden"
                    id="bank-qr-upload"
                  />
                  <label
                    htmlFor="bank-qr-upload"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    {shopInfo.bank_qr_code ? 'Change Bank QR' : 'Upload Bank QR'}
                  </label>
                  {shopInfo.bank_qr_code && (
                    <div className="mt-4 relative inline-block">
                      <img
                        src={shopInfo.bank_qr_code}
                        alt="Bank QR Code"
                        className="w-48 h-48 object-contain border-2 border-gray-300 rounded-lg bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShopInfo({ ...shopInfo, bank_qr_code: '' })}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* eSewa QR Code */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4" />
                      eSewa QR Code
                    </div>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleQRUpload(e, 'esewa')}
                    className="hidden"
                    id="esewa-qr-upload"
                  />
                  <label
                    htmlFor="esewa-qr-upload"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    {shopInfo.esewa_qr_code ? 'Change eSewa QR' : 'Upload eSewa QR'}
                  </label>
                  {shopInfo.esewa_qr_code && (
                    <div className="mt-4 relative inline-block">
                      <img
                        src={shopInfo.esewa_qr_code}
                        alt="eSewa QR Code"
                        className="w-48 h-48 object-contain border-2 border-gray-300 rounded-lg bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShopInfo({ ...shopInfo, esewa_qr_code: '' })}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-6 sm:px-8 py-3 rounded-lg font-semibold flex items-center gap-2 w-full justify-center text-sm sm:text-base hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Settings
                </>
              )}
            </button>
          </form>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
          
          {/* License Information Card */}
          {licenseInfo && (() => {
            const today = new Date();
            const expiryDate = licenseInfo.license?.expiry_date ? new Date(licenseInfo.license.expiry_date) : null;
            const daysRemaining = licenseInfo.status?.daysRemaining ?? licenseInfo.status?.days_remaining;
            
            const inGracePeriod = licenseInfo.status?.inGracePeriod ?? licenseInfo.status?.in_grace_period;
            const graceDaysRemaining = licenseInfo.status?.graceDaysRemaining ?? licenseInfo.status?.grace_days_remaining ?? 0;
            const gracePeriodDays = licenseInfo.license?.grace_period_days || 5;
            
            let actualGraceRemaining = gracePeriodDays;
            if (expiryDate && expiryDate < today) {
              const graceEndDate = new Date(expiryDate);
              graceEndDate.setDate(graceEndDate.getDate() + gracePeriodDays);
              const msPerDay = 1000 * 60 * 60 * 24;
              actualGraceRemaining = Math.ceil((graceEndDate - today) / msPerDay);
              if (actualGraceRemaining < 0) actualGraceRemaining = 0;
            }
            
            const isExpired = inGracePeriod || (expiryDate && expiryDate < today) || (daysRemaining !== undefined && daysRemaining <= 0);
            const isExpiringSoon = !isExpired && daysRemaining && daysRemaining <= 7;
            
            const graceEndDate = expiryDate ? new Date(expiryDate) : null;
            if (graceEndDate) graceEndDate.setDate(graceEndDate.getDate() + gracePeriodDays);
            
            return (
              <div className={`bg-white rounded-lg border-l-4 p-6 ${
                isExpired ? 'border-red-600 bg-red-50' : isExpiringSoon ? 'border-yellow-600 bg-yellow-50' : 'border-green-600 bg-green-50'
              }`}>
                <div className="flex items-center gap-2 mb-4">
                  <Shield className={`${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-yellow-600' : 'text-green-600'}`} size={20} />
                  <h3 className="text-lg font-bold text-gray-800">License Status</h3>
                </div>
                
                {/* Status Badge */}
                <div className={`px-3 py-2 rounded-lg text-center mb-4 font-bold text-sm ${
                  isExpired ? 'bg-red-100 text-red-800' : isExpiringSoon ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                }`}>
                  {isExpired ? '❌ EXPIRED' : isExpiringSoon ? '⚠️ EXPIRING SOON' : '✓ ACTIVE'}
                </div>
                
                {/* Details */}
                <div className="space-y-3 text-sm mb-4">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                    <span className="text-gray-600">License Key</span>
                    <span className="font-mono text-xs font-semibold">{licenseInfo.license?.license_key}</span>
                  </div>
                  
                  <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                    <span className="text-gray-600">Expiry Date</span>
                    <span className={`font-semibold ${isExpired ? 'text-red-700' : isExpiringSoon ? 'text-yellow-700' : 'text-green-700'}`}>
                      {expiryDate ? expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                    <span className="text-gray-600">Days Remaining</span>
                    <span className={`font-bold text-lg ${isExpired ? 'text-red-700' : isExpiringSoon ? 'text-yellow-700' : 'text-green-700'}`}>
                      {daysRemaining !== undefined && daysRemaining > 0 ? `${daysRemaining}d` : '0d'}
                    </span>
                  </div>
                  
                  {isExpired && (
                    <div className="flex justify-between items-center pb-2 border-b border-gray-200 bg-yellow-50 -mx-4 px-4 py-2">
                      <span className="text-yellow-800 font-semibold">Grace Period</span>
                      <span className="font-bold text-lg text-yellow-900">
                        {actualGraceRemaining > 0 ? `${actualGraceRemaining}d left` : 'Expired'}
                      </span>
                    </div>
                  )}
                  
                  {isExpired && actualGraceRemaining > 0 && graceEndDate && (
                    <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                      <span className="text-gray-600">System Locks On</span>
                      <span className="font-semibold text-red-700">
                        {graceEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Alert Message */}
                {(isExpired || isExpiringSoon) && (
                  <div className={`p-3 rounded-lg mb-4 text-xs ${
                    isExpired ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <p className="leading-tight">
                        {actualGraceRemaining > 0
                          ? `🚨 License expired! System will lock in ${actualGraceRemaining} days. Renew immediately!`
                          : actualGraceRemaining === 0
                            ? '❌ Grace period ended! System is now locked. Please renew to restore access.'
                            : isExpiringSoon
                              ? `License expires in ${daysRemaining} days. Renew now to avoid interruption.`
                              : 'License has expired. Please renew immediately.'}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Action Buttons */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await loadLicenseInfo();
                      setMessage({ type: 'success', text: 'License status refreshed!' });
                      setTimeout(() => {
                        window.location.reload();
                      }, 1000);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Check Status
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Clear auth tokens before changing license
                      localStorage.removeItem('pos_token');
                      localStorage.removeItem('pos_user');
                      window.location.href = '/activate?change=true';
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-semibold text-sm"
                  >
                    <Key className="w-4 h-4" />
                    Change License Key
                  </button>
                </div>
              </div>
            );
          })()}
          
          {/* Account Security */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="text-blue-600" size={24} />
              <h3 className="text-xl font-bold text-gray-800">Account Security</h3>
            </div>
            
            {currentUser && (
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="text-sm text-gray-600">Username</div>
                    <div className="font-semibold text-lg text-gray-800">{currentUser.username}</div>
                  </div>
                  <button
                    onClick={() => setShowCredentialsModal(true)}
                    className="text-sm text-blue-600 hover:underline font-semibold"
                  >
                    Edit
                  </button>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Role</div>
                  <div className="font-semibold text-lg capitalize text-gray-800">{currentUser.role}</div>
                </div>
              </div>
            )}
          </div>
          
          {/* Credentials Edit Modal */}
          {showCredentialsModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl border-2 border-gray-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="text-blue-600" size={24} />
                    <h3 className="text-xl font-bold text-gray-800">Edit Credentials</h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowCredentialsModal(false)
                      setPasswordData({ 
                        username: currentUser?.username || '', 
                        currentPassword: '', 
                        newPassword: '', 
                        confirmPassword: '' 
                      })
                    }}
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-700">Username</label>
                    <input
                      type="text"
                      value={passwordData.username}
                      onChange={(e) => setPasswordData({ ...passwordData, username: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900"
                      placeholder="Enter new username"
                      required
                      minLength={3}
                    />
                  </div>
                  
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-sm text-gray-600 mb-4">To change your credentials, enter your current password below</p>
                    <label className="block text-sm font-semibold mb-2 text-gray-700">Current Password *</label>
                    <input
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900"
                      placeholder="Enter current password"
                      required
                    />
                  </div>
                  
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-xs text-gray-500 mb-3 italic">Leave password fields empty to keep current password</p>
                    <label className="block text-sm font-semibold mb-2 text-gray-700">New Password (Optional)</label>
                    <input
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900"
                      placeholder="Enter new password (min 4 characters)"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-700">Confirm New Password</label>
                    <input
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900"
                      placeholder="Re-enter new password"
                    />
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCredentialsModal(false)
                        setPasswordData({ 
                          username: currentUser?.username || '', 
                          currentPassword: '', 
                          newPassword: '', 
                          confirmPassword: '' 
                        })
                      }}
                      className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-semibold text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </span>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Backup & Restore */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Save className="text-blue-600" size={20} />
              <h3 className="text-lg font-bold text-gray-800">Backup & Restore</h3>
            </div>
            <p className="text-xs text-gray-600 mb-4">
              Keep your data safe with regular backups and restore when needed
            </p>
            <div className="space-y-2">
              <button
                onClick={async () => {
                  try {
                    setSaving(true)
                    const res = await fetch('/api/backup/cloud', { method: 'POST' })
                    const data = await res.json()
                    if (res.ok) {
                      setMessage({ type: 'success', text: 'Backup uploaded to cloud!' })
                      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
                    } else if (res.status === 403) {
                      setShowCloudBackupModal(true)
                    } else {
                      setMessage({ type: 'error', text: data.error || 'Cloud backup failed' })
                    }
                  } catch (error) {
                    setMessage({ type: 'error', text: 'Failed to connect to admin server' })
                  } finally {
                    setSaving(false)
                  }
                }}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-sm disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {saving ? 'Uploading...' : 'Backup to Cloud'}
              </button>
              <button
                onClick={() => {
                  window.location.href = '/api/backup/download'
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-semibold text-sm"
              >
                <Save className="w-4 h-4" />
                Download Backup
              </button>
              <button
                onClick={async () => {
                  try {
                    setLoadingBackups(true)
                    setShowRestoreModal(true)
                    const res = await fetch('/api/backup/restore')
                    const data = await res.json()
                    if (res.ok) {
                      setCloudBackups(data.backups || [])
                    } else {
                      setMessage({ type: 'error', text: data.error || 'Failed to load backups' })
                      setShowRestoreModal(false)
                    }
                  } catch (error) {
                    setMessage({ type: 'error', text: 'Failed to connect to admin server' })
                    setShowRestoreModal(false)
                  } finally {
                    setLoadingBackups(false)
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-emerald-600 text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors font-semibold text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Restore from Cloud
              </button>
            </div>
          </div>

          {/* Cloud Backup Premium Feature Modal */}
          {showCloudBackupModal && (
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setShowCloudBackupModal(false)}
            >
              <div 
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-3 rounded-full">
                        <Upload size={28} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Cloud Backup</h3>
                        <p className="text-sm text-blue-100">Premium Feature</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowCloudBackupModal(false)}
                      className="text-white/80 hover:text-white transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-lg mb-4">
                    <div className="flex gap-3">
                      <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                      <div>
                        <h4 className="font-semibold text-amber-900 mb-1">Feature Not Enabled</h4>
                        <p className="text-sm text-amber-800">
                          Cloud Backup is not enabled for your license. This is a premium feature that provides secure encrypted cloud storage for your data.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Cloud Backup Benefits:</h4>
                      <ul className="space-y-2 text-sm text-gray-700">
                        <li className="flex items-start gap-2">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <span><strong>Encrypted & Secure:</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <span><strong>Automatic Protection:</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <span><strong>Disaster Recovery:</strong></span>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-900">
                        <strong>💡 Note:</strong> You can still use <strong>Download Backup</strong> to save your data locally to your computer.
                      </p>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                      <p className="text-sm text-gray-700 mb-2">
                        <strong>To enable Cloud Backup:</strong>
                      </p>
                      <ol className="text-sm text-gray-600 space-y-1 ml-4 list-decimal">
                        <li>Contact your system administrator</li>
                        <li>Request to enable Cloud Backup feature</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-6 py-4 flex gap-3">
                  <button
                    onClick={() => setShowCloudBackupModal(false)}
                    className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setShowCloudBackupModal(false)
                      window.location.href = '/api/backup/download'
                    }}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                  >
                    Download Backup
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Restore from Cloud Modal */}
          {showRestoreModal && (
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => {
                setShowRestoreModal(false)
                setCloudBackups([])
              }}
            >
              <div 
                className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-3 rounded-full">
                        <RefreshCw size={28} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Restore from Cloud</h3>
                        <p className="text-sm text-emerald-100">Select a backup to restore</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowRestoreModal(false)
                        setCloudBackups([])
                      }}
                      className="text-white/80 hover:text-white transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh]">
                  {loadingBackups ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
                      <p className="text-gray-600">Loading backups...</p>
                    </div>
                  ) : cloudBackups.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="bg-gray-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-10 h-10 text-gray-400" />
                      </div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">No Backups Found</h4>
                      <p className="text-sm text-gray-600 mb-4">
                        You haven't created any cloud backups yet.
                      </p>
                      <button
                        onClick={() => setShowRestoreModal(false)}
                        className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
                      >
                        Close
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-lg mb-6">
                        <div className="flex gap-3">
                          <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                          <div>
                            <h4 className="font-semibold text-amber-900 mb-1">Warning</h4>
                            <p className="text-sm text-amber-800">
                              Restoring a backup will <strong>replace all current data</strong>. This action cannot be undone. Make sure to download a backup of your current data first if needed.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {cloudBackups.map((backup) => (
                          <div key={backup.backup_id} className="border-2 border-gray-200 rounded-lg p-4 hover:border-emerald-500 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <h4 className="font-semibold text-gray-900">{backup.restaurant_name}</h4>
                                <p className="text-sm text-gray-600">
                                  {new Date(backup.backup_date).toLocaleString()}
                                </p>
                              </div>
                              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
                                {backup.size_kb} KB
                              </span>
                            </div>
                            
                            {backup.stats && (
                              <div className="grid grid-cols-2 gap-3 mb-3 text-xs text-gray-600">
                                <div>📦 Orders: {backup.stats.total_orders || 0}</div>
                                <div>👥 Customers: {backup.stats.total_customers || 0}</div>
                                <div>🧾 Bills: {backup.stats.total_bills || 0}</div>
                                <div>📋 Tables: {backup.stats.total_tables || 0}</div>
                              </div>
                            )}
                            
                            <button
                              onClick={async () => {
                                if (!confirm(`Are you sure you want to restore this backup from ${new Date(backup.backup_date).toLocaleString()}? This will replace ALL current data.`)) {
                                  return
                                }
                                try {
                                  setRestoringBackup(true)
                                  const res = await fetch('/api/backup/restore', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ backup_id: backup.backup_id })
                                  })
                                  const data = await res.json()
                                  if (res.ok) {
                                    setMessage({ type: 'success', text: 'Backup restored successfully! Refreshing...' })
                                    setTimeout(() => window.location.reload(), 2000)
                                  } else {
                                    setMessage({ type: 'error', text: data.error || 'Failed to restore backup' })
                                  }
                                } catch (error) {
                                  setMessage({ type: 'error', text: 'Failed to restore backup' })
                                } finally {
                                  setRestoringBackup(false)
                                  setShowRestoreModal(false)
                                }
                              }}
                              disabled={restoringBackup}
                              className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {restoringBackup ? (
                                <span className="flex items-center justify-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Restoring...
                                </span>
                              ) : (
                                'Restore This Backup'
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {!loadingBackups && cloudBackups.length > 0 && (
                  <div className="bg-gray-50 px-6 py-4">
                    <button
                      onClick={() => setShowRestoreModal(false)}
                      className="w-full px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* System Info */}
          <div className="bg-gray-100 rounded-lg p-6">
            <h3 className="text-sm font-bold mb-2 text-gray-800">System Info</h3>
            <div className="space-y-1 text-xs text-gray-600">
              <p>Version: 1.0.0</p>
              <p>Database: SQLite</p>
              {licenseInfo?.license && (
                <>
                  <p>License: {licenseInfo.license.license_key}</p>
                  <p className={getLicenseStatusColor()}>
                    Status: {licenseInfo.status?.inGracePeriod 
                      ? `Grace (${licenseInfo.status.graceDaysRemaining}d left)` 
                      : licenseInfo.status?.daysRemaining <= 0 
                        ? 'Expired'
                        : licenseInfo.status?.daysRemaining 
                          ? `Active (${licenseInfo.status.daysRemaining}d left)`
                          : 'Active'}
                  </p>
                </>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
