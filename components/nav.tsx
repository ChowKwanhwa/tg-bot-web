'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  { name: '生成Session文件', href: '/session-gen' },
  { name: '扒取群聊天', href: '/chat-scraper' },
  { name: '自动水群', href: '/auto-chat' },
]

export default function ClientSideNav() {
  const pathname = usePathname()
  const router = useRouter()
  
  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error('登出失败')
      }

      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <>
      {navItems.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
              isActive
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {item.name}
          </Link>
        )
      })}
      <button
        onClick={handleLogout}
        className="ml-8 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
      >
        登出
      </button>
    </>
  )
}
