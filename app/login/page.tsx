'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function LoginForm() {
  const [loginType, setLoginType] = useState<'admin' | 'user'>('user')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginType === 'admin' ? username : email,
          password,
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || 'Login failed')
      }

      // 登录成功，重定向到之前的页面或默认页面
      const from = searchParams.get('from')
      if (from) {
        window.location.replace(from)
      } else {
        window.location.replace(loginType === 'admin' ? '/admin' : '/')
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-50 pt-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-3 text-sm text-gray-600 mb-6">
        <h3 className="font-medium text-lg text-gray-900">TGB电报脚本功能：</h3>
        <ul className="list-decimal pl-5 space-y-1.5">
          <li>扒取指定群聊天消息，包括文本消息、图片、表情、视频等，节约写聊天脚本的时间；</li>
          <li>多账号自动水群，有20%概率是回复别人20%概率是对别的消息的表情反应，模拟真实群聊；</li>
          <li>使用以.session结尾的协议文件登录账号，可以在脚本中用电话号码生成协议文件，也可以直接找管理员购买协议文件 <a href="https://t.me/kowliep" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500">https://t.me/kowliep</a>；</li>
        </ul>
      </div>
      
      <div className="max-w-md w-full space-y-6 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            登录
          </h2>
          <div className="mt-4 flex justify-center space-x-4">
            <button
              type="button"
              onClick={() => {
                setLoginType('user')
                setError('')
                setEmail('')
                setUsername('')
                setPassword('')
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                loginType === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } transition-colors duration-200`}
            >
              用户登录
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginType('admin')
                setError('')
                setEmail('')
                setUsername('')
                setPassword('')
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                loginType === 'admin'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } transition-colors duration-200`}
            >
              管理员登录
            </button>
          </div>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            {loginType === 'admin' ? (
              <div>
                <label htmlFor="username" className="sr-only">
                  用户名
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            ) : (
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
            )}
            <div>
              <label htmlFor="password" className="sr-only">
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
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
              {loading ? '登录中...' : '登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}
