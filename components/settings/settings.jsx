'use client'

import { useState, useEffect } from 'react'
import { Save, Download, Upload, Store, Receipt, Bell, Shield, Palette, Database, Trash2, AlertTriangle, RefreshCw } from 'lucide-react'

export default function Settings() {
  const [settings, setSettings] = useState({
    businessName: 'My Retail Store',
    businessAddress: '',
    businessPhone: '+977-XXX-XXXXXX',
    businessEmail: '',
    vat: 13,
    printFormat: 'thermal',
    currency: 'NPR',
    lowStockThreshold: 10,
    autoBackup: true,
    receiptFooter: 'Thank you for your business!',
    theme: 'system',
    bankQR: '',
    esewaQR: ''
  })

  const [saveStatus, setSaveStatus] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => {
    // Load last sync time
    const savedLastSync = localStorage.getItem('lastSync')
    if (savedLastSync) setLastSync(savedLastSync)
    
    // Load theme from standalone key first (priority)
    const savedTheme = localStorage.getItem('theme') || 'system'
    
    // Load settings from localStorage
    const saved = localStorage.getItem('posSettings')
    if (saved) {
      const loadedSettings = JSON.parse(saved)
      setSettings({
        ...loadedSettings,
        theme: savedTheme, // Use standalone theme value
        bankQR: loadedSettings.bankQR || '',
        esewaQR: loadedSettings.esewaQR || ''
      })
    } else {
      // No saved settings, but update theme from localStorage
      setSettings(prev => ({ ...prev, theme: savedTheme }))
    }
    
    // Apply current theme
    applyTheme(savedTheme)
  }, [])

  const applyTheme = (theme) => {
    // Store theme preference
    localStorage.setItem('theme', theme)
    
    // Remove existing theme class
    document.documentElement.classList.remove('light', 'dark')
    
    if (theme === 'system') {
      // Use system preference
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (systemPrefersDark) {
        document.documentElement.classList.add('dark')
      }
    } else {
      // Apply selected theme
      document.documentElement.classList.add(theme)
    }
  }

  const handleThemeChange = (newTheme) => {
    setSettings({ ...settings, theme: newTheme })
    applyTheme(newTheme)
  }

  const handleQRUpload = (e, type) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result
      if (type === 'bank') {
        setSettings({ ...settings, bankQR: base64 })
      } else if (type === 'esewa') {
        setSettings({ ...settings, esewaQR: base64 })
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    try {
      localStorage.setItem('posSettings', JSON.stringify(settings))
      // Apply and save theme separately to ensure it persists
      applyTheme(settings.theme)
      console.log('Settings saved:', settings)
      console.log('Theme saved to localStorage:', settings.theme)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus(''), 3000)
    } catch (error) {
      setSaveStatus('error')
      console.error('Error saving settings:', error)
    }
  }

  const handleSyncDatabase = async () => {
    setSyncing(true)
    setSyncMessage('')

    try {
      const shopInfo = JSON.parse(localStorage.getItem('shopInfo') || '{}')
      
      const response = await fetch('/api/shop/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopInfo.shop_id })
      })

      const data = await response.json()

      if (data.success) {
        const now = new Date().toLocaleString()
        localStorage.setItem('lastSync', now)
        setLastSync(now)
        setSyncMessage(`✅ Sync successful! ${data.synced.transactions} transactions, ${data.synced.products} products uploaded.`)
      } else {
        setSyncMessage(`❌ Sync failed: ${data.error}`)
      }
    } catch (error) {
      setSyncMessage('❌ Sync failed. Please check your internet connection.')
    } finally {
      setSyncing(false)
    }
  }

  const handleBackup = async () => {
    try {
      // Fetch products from database
      const productsRes = await fetch('/api/products')
      const productsData = await productsRes.json()
      
      // Fetch transactions from database
      const transactionsRes = await fetch('/api/transactions')
      const transactionsData = await transactionsRes.json()
      
      const data = {
        settings,
        products: productsData.success ? productsData.products : [],
        transactions: transactionsData.success ? transactionsData.transactions : [],
        timestamp: new Date().toISOString()
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pos-backup-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      
      alert('Backup downloaded successfully!')
    } catch (error) {
      alert('Failed to create backup')
      console.error(error)
    }
  }

  const handleRestore = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result)
        
        // Restore settings
        if (data.settings) {
          setSettings(data.settings)
          localStorage.setItem('posSettings', JSON.stringify(data.settings))
        }
        
        // Restore products to database
        if (data.products && Array.isArray(data.products)) {
          for (const product of data.products) {
            // Check if product exists, if not create it
            const checkRes = await fetch(`/api/products?id=${product.id}`)
            const checkData = await checkRes.json()
            
            if (!checkData.success || !checkData.product) {
              // Create new product
              await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product)
              })
            } else {
              // Update existing product
              await fetch('/api/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product)
              })
            }
          }
        }
        
        // Note: Transactions are immutable, so we don't restore them to prevent data corruption
        
        alert('Data restored successfully! Please refresh the page.')
        setTimeout(() => window.location.reload(), 1000)
      } catch (error) {
        alert('Invalid backup file or restore failed')
        console.error(error)
      }
    }
    reader.readAsText(file)
  }

  const handleClearData = () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true)
      return
    }
    
    localStorage.clear()
    alert('All data cleared! The page will reload.')
    window.location.reload()
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold">Settings</h2>
        {saveStatus && (
          <div className={`px-4 py-2 rounded-lg text-sm font-semibold ${
            saveStatus === 'success' ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-600'
          }`}>
            {saveStatus === 'success' ? '✓ Settings saved successfully!' : '✗ Failed to save settings'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Business Details */}
          <div className="pos-stat-card">
            <div className="flex items-center gap-2 mb-4 sm:mb-6">
              <Store className="text-primary" size={24} />
              <h3 className="text-lg sm:text-xl font-bold text-foreground">Business Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Business Name *</label>
                <input
                  type="text"
                  value={settings.businessName}
                  onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                  placeholder="My Retail Store"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Phone Number *</label>
                <input
                  type="tel"
                  value={settings.businessPhone}
                  onChange={(e) => setSettings({ ...settings, businessPhone: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                  placeholder="+977-XXX-XXXXXX"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-2">Business Address</label>
                <input
                  type="text"
                  value={settings.businessAddress}
                  onChange={(e) => setSettings({ ...settings, businessAddress: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                  placeholder="Street, City, Country"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-2">Email Address</label>
                <input
                  type="email"
                  value={settings.businessEmail}
                  onChange={(e) => setSettings({ ...settings, businessEmail: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                  placeholder="contact@business.com"
                />
              </div>
            </div>
          </div>

          {/* Print & Receipt Settings */}
          <div className="pos-stat-card">
            <div className="flex items-center gap-2 mb-4 sm:mb-6">
              <Receipt className="text-primary" size={24} />
              <h3 className="text-lg sm:text-xl font-bold text-foreground">Receipt Settings</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Print Format</label>
                <select
                  value={settings.printFormat}
                  onChange={(e) => setSettings({ ...settings, printFormat: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                >
                  <option value="thermal">Thermal (80mm)</option>
                  <option value="a4">A4 Paper</option>
                  <option value="a5">A5 Paper</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Currency</label>
                <select
                  value={settings.currency}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                >
                  <option value="NPR">NPR (Rs)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="INR">INR (₹)</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-2">Receipt Footer Message</label>
                <textarea
                  value={settings.receiptFooter}
                  onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                  rows="2"
                  placeholder="Thank you for your business!"
                />
              </div>
            </div>
          </div>

          {/* Payment QR Codes */}
          <div className="pos-stat-card">
            <div className="flex items-center gap-2 mb-4 sm:mb-6">
              <Receipt className="text-primary" size={24} />
              <h3 className="text-lg sm:text-xl font-bold text-foreground">Payment QR Codes</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Bank QR Code</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleQRUpload(e, 'bank')}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                <p className="text-xs text-muted-foreground mt-1">Upload Bank QR code image</p>
                {settings.bankQR && (
                  <div className="mt-2 relative inline-block">
                    <img src={settings.bankQR} alt="Bank QR" className="w-32 h-32 border border-border rounded" />
                    <button
                      onClick={() => setSettings({ ...settings, bankQR: '' })}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-destructive/90"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">eSewa QR Code</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleQRUpload(e, 'esewa')}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                <p className="text-xs text-muted-foreground mt-1">Upload eSewa QR code image</p>
                {settings.esewaQR && (
                  <div className="mt-2 relative inline-block">
                    <img src={settings.esewaQR} alt="eSewa QR" className="w-32 h-32 border border-border rounded" />
                    <button
                      onClick={() => setSettings({ ...settings, esewaQR: '' })}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-destructive/90"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tax & Inventory Settings */}
          <div className="pos-stat-card">
            <div className="flex items-center gap-2 mb-4 sm:mb-6">
              <Bell className="text-primary" size={24} />
              <h3 className="text-lg sm:text-xl font-bold text-foreground">System Configuration</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">VAT/Tax Percentage (%)</label>
                <input
                  type="number"
                  value={settings.vat}
                  min="0"
                  max="100"
                  step="0.1"
                  onChange={(e) => setSettings({ ...settings, vat: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                />
                <p className="text-xs text-muted-foreground mt-1">Standard VAT in Nepal is 13%</p>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Low Stock Alert Threshold</label>
                <input
                  type="number"
                  value={settings.lowStockThreshold}
                  min="1"
                  onChange={(e) => setSettings({ ...settings, lowStockThreshold: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                />
                <p className="text-xs text-muted-foreground mt-1">Alert when stock falls below this number</p>
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoBackup}
                    onChange={(e) => setSettings({ ...settings, autoBackup: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-semibold">Enable automatic daily backups</span>
                </label>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="pos-stat-card">
            <div className="flex items-center gap-2 mb-4 sm:mb-6">
              <Palette className="text-primary" size={24} />
              <h3 className="text-lg sm:text-xl font-bold text-foreground">Appearance</h3>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Theme</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    settings.theme === 'light'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-white to-gray-100 border-2 border-gray-300 flex items-center justify-center">
                      <div className="w-6 h-6 rounded bg-gray-800"></div>
                    </div>
                    <span className="text-xs font-semibold">Light</span>
                  </div>
                </button>
                
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    settings.theme === 'dark'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gray-800 to-gray-950 border-2 border-gray-700 flex items-center justify-center">
                      <div className="w-6 h-6 rounded bg-white"></div>
                    </div>
                    <span className="text-xs font-semibold">Dark</span>
                  </div>
                </button>
                
                <button
                  onClick={() => handleThemeChange('system')}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    settings.theme === 'system'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-white via-gray-400 to-gray-900 border-2 border-gray-500 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-l bg-white border-r"></div>
                      <div className="w-6 h-6 rounded-r bg-gray-800"></div>
                    </div>
                    <span className="text-xs font-semibold">System</span>
                  </div>
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {settings.theme === 'system' 
                  ? 'Automatically matches your device settings'
                  : settings.theme === 'light'
                  ? 'Always use light mode'
                  : 'Always use dark mode'
                }
              </p>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="pos-button-primary px-6 sm:px-8 py-3 rounded-lg font-semibold flex items-center gap-2 w-full justify-center text-sm sm:text-base"
          >
            <Save size={20} />
            Save All Settings
          </button>
        </div>

        {/* Data Management Sidebar */}
        <div className="space-y-4">
          <div className="pos-stat-card">
            <div className="flex items-center gap-2 mb-4">
              <Database className="text-primary" size={20} />
              <h3 className="text-lg font-bold">Data Management</h3>
            </div>
            <div className="space-y-3">
              <button 
                onClick={handleBackup}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-lg hover:bg-primary/90 transition-colors font-semibold text-sm"
              >
                <Download size={18} />
                Backup All Data
              </button>
              
              <label className="w-full flex items-center justify-center gap-2 border-2 border-primary text-primary px-4 py-3 rounded-lg hover:bg-primary/10 transition-colors font-semibold cursor-pointer text-sm">
                <Upload size={18} />
                Restore from Backup
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestore}
                  className="hidden"
                />
              </label>

              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-3">
                  Backup includes all products, transactions, and settings
                </p>
              </div>
            </div>
          </div>

          <div className="pos-stat-card border-l-4 border-destructive">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="text-destructive" size={20} />
              <h3 className="text-lg font-bold text-destructive">Danger Zone</h3>
            </div>
            <div className="space-y-3">
              {!showDeleteConfirm ? (
                <button 
                  onClick={handleClearData}
                  className="w-full flex items-center justify-center gap-2 bg-destructive text-destructive-foreground px-4 py-3 rounded-lg hover:bg-destructive/90 transition-colors font-semibold text-sm"
                >
                  <Trash2 size={18} />
                  Clear All Data
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-destructive">Are you sure? This cannot be undone!</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={handleClearData}
                      className="px-3 py-2 bg-destructive text-destructive-foreground rounded font-semibold text-sm"
                    >
                      Yes, Delete
                    </button>
                    <button 
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-2 border border-border rounded font-semibold text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                This will permanently delete all products, transactions, and settings
              </p>
            </div>
          </div>

          <div className="pos-stat-card bg-muted/30">
            <h3 className="text-sm font-bold mb-2">System Info</h3>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Version: 1.0.0</p>
              <p>Database: SQLite</p>
              <p>Last Backup: Never</p>
            </div>
          </div>
        </div>

        {/* Database Sync */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Database size={24} />
            Database Sync
          </h2>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sync your local shop data with the central admin database. This uploads transactions, products, and inventory changes.
            </p>

            {lastSync && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <strong>Last Sync:</strong> {lastSync}
              </div>
            )}

            {syncMessage && (
              <div className={`p-3 rounded-lg text-sm ${
                syncMessage.includes('✅') 
                  ? 'bg-green-500/10 text-green-600 border border-green-500/20' 
                  : 'bg-red-500/10 text-red-600 border border-red-500/20'
              }`}>
                {syncMessage}
              </div>
            )}

            <button
              onClick={handleSyncDatabase}
              disabled={syncing}
              className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Database Now'}
            </button>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>ℹ️ Auto-sync occurs every 30 minutes when online</p>
              <p>ℹ️ Manual sync recommended at end of day</p>
              <p>⚠️ Requires internet connection</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
