'use client'

import { useState } from 'react'
import axios from 'axios'

export default function SessionGenForm() {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [showVerification, setShowVerification] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionFile, setSessionFile] = useState('')

  const handleGenerateSession = async () => {
    try {
      setLoading(true)
      setError('')
      
      const response = await axios.post('/api/session/generate', {
        phoneNumber
      })
      
      if (response.data.success) {
        setShowVerification(true)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '生成session失败')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    try {
      setLoading(true)
      setError('')
      
      const response = await axios.post('/api/session/verify', {
        phoneNumber,
        verificationCode
      })
      
      if (response.data.success) {
        setSessionFile(response.data.sessionFile)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '验证码验证失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    // 创建一个blob并下载session文件
    const blob = new Blob([sessionFile], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${phoneNumber.replace('+', '')}.session`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="divide-y divide-gray-200">
      <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
        <h2 className="text-2xl font-bold mb-8">生成 Session 文件</h2>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            电话号码
          </label>
          <input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+66 6 3736 4083"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            disabled={showVerification}
          />
        </div>

        {!showVerification ? (
          <button
            onClick={handleGenerateSession}
            disabled={loading || !phoneNumber}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
          >
            {loading ? '生成中...' : '生成 Session 文件'}
          </button>
        ) : null}

        {showVerification && (
          <>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                验证码
              </label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="输入验证码"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>
            <button
              onClick={handleVerifyCode}
              disabled={loading || !verificationCode}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
            >
              {loading ? '验证中...' : '验证'}
            </button>
          </>
        )}

        {sessionFile && (
          <button
            onClick={handleDownload}
            className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full mt-4"
          >
            下载 Session 文件
          </button>
        )}
      </div>
    </div>
  )
}
