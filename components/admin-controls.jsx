'use client'

import { useState } from 'react'
import { X, Settings, Users, Database, AlertCircle, Activity, BarChart3 } from 'lucide-react'

export default function AdminControls() {
  const [activeTab, setActiveTab] = useState('system')
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [debugMode, setDebugMode] = useState(false)

  const tabs = [
    { id: 'system', label: 'System', icon: Settings },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'database', label: 'Database', icon: Database },
    { id: 'alerts', label: 'Alerts', icon: AlertCircle },
    { id: 'activity', label: 'Activity', icon: Activity },
  ]

  return (
    <div className="pos-stat-card border-2 border-secondary">
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 size={28} />
          Admin Control Panel
        </h3>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-border pb-4 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-secondary text-secondary-foreground'
                  : 'hover:bg-muted text-foreground'
              }`}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* System Controls */}
      {activeTab === 'system' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-border rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-foreground">Maintenance Mode</span>
                <button
                  onClick={() => setMaintenanceMode(!maintenanceMode)}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    maintenanceMode ? 'bg-destructive' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                      maintenanceMode ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Put system in maintenance mode</p>
            </div>

            <div className="p-4 border border-border rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-foreground">Debug Mode</span>
                <button
                  onClick={() => setDebugMode(!debugMode)}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    debugMode ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                      debugMode ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Enable detailed logging</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button className="px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors">
              Clear Cache
            </button>
            <button className="px-4 py-3 bg-secondary text-secondary-foreground rounded-lg font-semibold hover:bg-secondary/90 transition-colors">
              Restart Services
            </button>
            <button className="px-4 py-3 border border-border rounded-lg font-semibold hover:bg-muted transition-colors">
              Sync Database
            </button>
            <button className="px-4 py-3 border border-border rounded-lg font-semibold hover:bg-muted transition-colors">
              Export Logs
            </button>
          </div>
        </div>
      )}

      {/* User Controls */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Active Users</p>
              <h4 className="text-2xl font-bold text-foreground">8</h4>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Total Users</p>
              <h4 className="text-2xl font-bold text-primary">24</h4>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Failed Logins Today</p>
              <h4 className="text-2xl font-bold text-destructive">2</h4>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-3 text-foreground">User Actions</h4>
            <div className="space-y-2">
              <button className="w-full px-4 py-2 border border-border rounded-lg text-left hover:bg-muted transition-colors font-semibold">
                Unlock All Users
              </button>
              <button className="w-full px-4 py-2 border border-border rounded-lg text-left hover:bg-muted transition-colors font-semibold">
                Reset All Passwords
              </button>
              <button className="w-full px-4 py-2 border border-destructive/50 rounded-lg text-left hover:bg-destructive/10 transition-colors font-semibold text-destructive">
                Force Logout All Users
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database Controls */}
      {activeTab === 'database' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">DB Size</p>
              <h4 className="text-2xl font-bold text-foreground">256 MB</h4>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Records</p>
              <h4 className="text-2xl font-bold text-primary">45,280</h4>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Last Backup</p>
              <h4 className="text-lg font-bold text-foreground">2h 30m ago</h4>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-3 text-foreground">Database Operations</h4>
            <div className="space-y-2">
              <button className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold">
                Full Backup
              </button>
              <button className="w-full px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors font-semibold">
                Optimize Database
              </button>
              <button className="w-full px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors font-semibold">
                Run Integrity Check
              </button>
              <button className="w-full px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors font-semibold">
                View Query Performance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerts Management */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="space-y-3">
            {[
              { level: 'high', message: '5 products running low on stock', time: '15 mins ago' },
              { level: 'medium', message: 'Database size at 80% capacity', time: '1 hour ago' },
              { level: 'low', message: 'Daily backup completed successfully', time: '2 hours ago' },
            ].map((alert, idx) => (
              <div key={idx} className={`p-4 border rounded-lg border-l-4 ${
                alert.level === 'high' ? 'border-destructive bg-destructive/5' :
                alert.level === 'medium' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' :
                'border-green-500 bg-green-50 dark:bg-green-900/20'
              }`}>
                <div className="flex justify-between items-start">
                  <span className="font-semibold text-foreground">{alert.message}</span>
                  <span className="text-xs text-muted-foreground">{alert.time}</span>
                </div>
              </div>
            ))}
          </div>

          <button className="w-full px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors font-semibold">
            Clear All Alerts
          </button>
        </div>
      )}

      {/* Activity Log */}
      {activeTab === 'activity' && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {[
            { user: 'John Admin', action: 'Modified product Laptop', time: '5 mins ago' },
            { user: 'Mike Cashier', action: 'Completed transaction TXN000001', time: '15 mins ago' },
            { user: 'Sarah Manager', action: 'Generated daily report', time: '30 mins ago' },
            { user: 'System', action: 'Database optimization completed', time: '1 hour ago' },
            { user: 'John Admin', action: 'Added new user: Jane Cashier', time: '2 hours ago' },
          ].map((log, idx) => (
            <div key={idx} className="p-3 border border-border rounded-lg">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-foreground">{log.user}</p>
                  <p className="text-sm text-muted-foreground">{log.action}</p>
                </div>
                <span className="text-xs text-muted-foreground">{log.time}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
