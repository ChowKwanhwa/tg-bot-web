'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

const SessionGenForm = dynamic(() => import('../components/SessionGenForm'), {
  ssr: false
})

export default function SessionGen() {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [showVerification, setShowVerification] = useState(false)
  const [show2FA, setShow2FA] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [password2FA, setPassword2FA] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sessionFile, setSessionFile] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    setSessionFile(null)

    try {
      const response = await fetch('/api/session/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber }),
      })

      const data = await response.json()
      if (data.success) {
        if (data.waitingForCode) {
          setShowVerification(true)
          setSuccess('验证码已发送到您的 Telegram 账号')
        }
      } else {
        setError(data.message || '生成会话失败')
      }
    } catch (err: any) {
      setError(err.message || '发生错误')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    setSessionFile(null)

    try {
      const response = await fetch('/api/session/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          phoneNumber, 
          verificationCode,
          password2FA: show2FA ? password2FA : undefined 
        }),
      })

      const data = await response.json()
      if (data.success) {
        if (data.waitingForCode) {
          setShowVerification(true)
          setSuccess('验证码已发送到您的 Telegram 账号')
        } else if (data.needs2FA) {
          setShow2FA(true)
          setSuccess('请输入您的两步验证密码')
        } else {
          setSuccess('Session 文件生成成功！')
          setShowVerification(false)
          setShow2FA(false)
          setSessionFile(data.sessionFile)
        }
      } else {
        setError(data.message || '验证失败')
      }
    } catch (err: any) {
      setError(err.message || '发生错误')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!sessionFile) return

    // Convert base64 to binary
    const binaryString = window.atob(sessionFile)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    
    // Create blob from binary data
    const blob = new Blob([bytes], { type: 'application/octet-stream' })
    const url = window.URL.createObjectURL(blob)
    
    // Create a temporary link and click it
    const a = document.createElement('a')
    a.href = url
    a.download = `${phoneNumber}.session` // Use phone number as filename
    document.body.appendChild(a)
    a.click()
    
    // Clean up
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleReset = () => {
    setPhoneNumber('')
    setShowVerification(false)
    setShow2FA(false)
    setVerificationCode('')
    setPassword2FA('')
    setSessionFile(null)
    setError('')
    setSuccess('')
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            生成 Telegram Session
          </h2>
          <p className="text-gray-600">
            自己生成session文件可能会报错，建议直接找{' '}
            <a 
              href="https://t.me/kowliep" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-600 hover:text-blue-800 underline"
            >
              管理员
            </a>
            {' '}购买带session文件的电报号，18元一个
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6">
            <p className="text-green-700">{success}</p>
          </div>
        )}

        {sessionFile ? (
          <div className="space-y-4">
            <p className="text-gray-600">
              您的 Session 文件已经生成成功。您可以下载它或生成一个新的。
            </p>
            <div className="flex gap-4">
              <button
                onClick={handleDownload}
                className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                下载 Session 文件
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                生成新的
              </button>
            </div>
          </div>
        ) : !showVerification ? (
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-2">
                电话号码
              </label>
              <input
                type="text"
                id="phoneNumber"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="mt-2 text-sm text-gray-500">
                请输入完整的电话号码，包括国际区号（例如：+1234567890）
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? '处理中...' : '发送验证码'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <div className="mb-6">
              <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700 mb-2">
                验证码
              </label>
              <input
                type="text"
                id="verificationCode"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="输入验证码"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="mt-2 text-sm text-gray-500">
                请输入发送到您 Telegram 账号的验证码
              </p>
            </div>

            {show2FA && (
              <div className="mb-6">
                <label htmlFor="password2FA" className="block text-sm font-medium text-gray-700 mb-2">
                  两步验证密码
                </label>
                <input
                  type="password"
                  id="password2FA"
                  value={password2FA}
                  onChange={(e) => setPassword2FA(e.target.value)}
                  placeholder="输入两步验证密码"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="mt-2 text-sm text-gray-500">
                  请输入您的两步验证密码
                </p>
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowVerification(false)
                  setShow2FA(false)
                }}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                返回
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                  loading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? '验证中...' : '验证'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
