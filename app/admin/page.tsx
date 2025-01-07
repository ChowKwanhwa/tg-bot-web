'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [expireTime, setExpireTime] = useState('7') // 默认1周
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      // 计算过期时间
      const expiresAt = new Date()
      const days = parseInt(expireTime)
      if (days > 0) {
        expiresAt.setDate(expiresAt.getDate() + days)
      } else {
        // 如果days为0，则设置为null表示永不过期
        expiresAt.setFullYear(9999)
      }
      console.log('Sending expiresAt:', expiresAt.toISOString()) // 添加日志

      const res = await fetch('/api/admin/add-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          expiresAt: expiresAt.toISOString() // 确保发送 ISO 格式的字符串
        })
      })

      const data = await res.json()
      console.log('Response:', data) // 添加日志

      if (!res.ok) {
        throw new Error(data.message || '添加用户失败')
      }

      setSuccess('用户添加成功！')
      setEmail('')
      setPassword('')
      
    } catch (error) {
      setError(error instanceof Error ? error.message : '添加用户失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            添加新用户
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                邮箱
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="expireTime" className="sr-only">
                过期时间
              </label>
              <select
                id="expireTime"
                name="expireTime"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                value={expireTime}
                onChange={(e) => setExpireTime(e.target.value)}
              >
                <option value="1">1天</option>
                <option value="3">3天</option>
                <option value="7">1周</option>
                <option value="14">2周</option>
                <option value="30">1个月</option>
                <option value="60">2个月</option>
                <option value="90">3个月</option>
                <option value="0">xxxx</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          {success && (
            <div className="text-green-500 text-sm text-center">
              {success}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? '添加中...' : '添加用户'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
