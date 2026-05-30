'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Maximize2 } from 'lucide-react'
import { BrowserMultiFormatReader } from '@zxing/browser'

export default function BarcodeScanner({ onDetect, onClose }) {
  const videoRef = useRef(null)
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState(null)
  const [detectedCode, setDetectedCode] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const hasDetectedRef = useRef(false)
  const codeReaderRef = useRef(null)

  useEffect(() => {
    const startScanning = async () => {
      try {
        console.log('🔍 Starting barcode scanner...')
        
        // Initialize ZXing barcode reader
        const codeReader = new BrowserMultiFormatReader()
        codeReaderRef.current = codeReader
        
        console.log('📹 Requesting camera access...')
        
        // Get video devices
        const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices()
        
        console.log('📷 Found cameras:', videoInputDevices.length)
        
        if (videoInputDevices.length === 0) {
          setError('No camera found. Please connect a camera or use manual search.')
          setScanning(false)
          return
        }

        // Use back camera if available (for mobile), otherwise use first available
        const selectedDevice = videoInputDevices.find(device => 
          device.label.toLowerCase().includes('back') || 
          device.label.toLowerCase().includes('rear') ||
          device.label.toLowerCase().includes('environment')
        ) || videoInputDevices[0]

        console.log('✅ Using camera:', selectedDevice.label)

        // Start continuous decode from video device
        const controls = await codeReader.decodeFromVideoDevice(
          selectedDevice.deviceId,
          videoRef.current,
          (result, err) => {
            if (result && !hasDetectedRef.current) {
              const barcode = result.getText()
              console.log('🎯 BARCODE DETECTED:', barcode)
              hasDetectedRef.current = true
              setDetectedCode(barcode)
              setScanning(false)
              onDetect(barcode)
              
              // Stop scanning after detection
              setTimeout(() => {
                if (controls) {
                  controls.stop()
                }
              }, 1000)
            }
            
            if (err && !(err.name === 'NotFoundException')) {
              // NotFoundException is normal when no barcode is in view
              console.error('Barcode scanning error:', err)
            }
          }
        )
        
        console.log('🎥 Scanner started, waiting for barcode...')
        
        // Store controls for cleanup
        codeReaderRef.current = controls
        
      } catch (err) {
        console.error('❌ Scanner initialization error:', err)
        setError(err.message || 'Camera access denied. Check permissions and try again.')
        setScanning(false)
      }
    }

    if (scanning && !hasDetectedRef.current) {
      startScanning()
    }

    return () => {
      console.log('🛑 Cleaning up scanner...')
      if (codeReaderRef.current && codeReaderRef.current.stop) {
        codeReaderRef.current.stop()
      }
    }
  }, [scanning, onDetect])

  return (
    <div className={`fixed inset-0 bg-black/80 flex items-center justify-center z-50 ${fullscreen ? 'p-0' : 'p-4'}`}>
      <div className="bg-background rounded-lg shadow-2xl overflow-hidden w-full max-w-2xl">
        {/* Header */}
        <div className="bg-primary text-primary-foreground p-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold">Barcode Scanner</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setFullscreen(!fullscreen)}
              className="p-2 hover:bg-primary-foreground/20 rounded transition-colors"
            >
              <Maximize2 size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-primary-foreground/20 rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Video Feed */}
        <div className="relative bg-black aspect-video overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
          />

          {/* Scanning Reticle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="border-4 border-green-500 w-48 h-32 rounded-lg animate-pulse" />
          </div>

          {/* Detected Code Display */}
          {detectedCode && (
            <div className="absolute bottom-4 left-4 right-4 bg-green-500 text-white p-3 rounded text-center font-semibold">
              ✓ Detected: {detectedCode}
            </div>
          )}
        </div>

        {/* Error/Instructions */}
        <div className="p-4 bg-muted text-center">
          {error ? (
            <p className="text-destructive font-semibold">{error}</p>
          ) : (
            <div className="space-y-2">
              <p className="font-semibold">Align barcode within the box</p>
              <p className="text-sm text-muted-foreground">Move camera closer • Improve lighting • Ensure barcode is clearly visible</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
