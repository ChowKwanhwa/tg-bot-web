'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

const navItems = [
  { name: '生成Session文件', href: '/session-gen' },
  { name: '扒取群聊天', href: '/chat-scraper' },
  { name: '自动水群', href: '/auto-chat' },
  { name: '修改账号信息', href: '/session-info' },
  { name: '官方群', href: 'https://t.me/TGBdianbao', external: true },
]

export default function ClientSideNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  
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
    <div className="flex items-center h-full">
      {/* Desktop navigation */}
      <div className="hidden md:flex items-center space-x-6">
        {navItems.map((item) => {
          const isActive = !item.external && pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              className={`inline-flex items-center h-16 px-1 border-b-2 text-sm font-medium ${
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
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          登出
        </button>
      </div>

      {/* Mobile menu button */}
      <div className="relative flex md:hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500"
        >
          <span className="sr-only">打开菜单</span>
          {/* Hamburger icon */}
          <svg
            className={`${isOpen ? 'hidden' : 'block'} h-6 w-6`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
          {/* Close icon */}
          <svg
            className={`${isOpen ? 'block' : 'hidden'} h-6 w-6`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Mobile menu dropdown */}
        <div 
          className={`${
            isOpen ? 'block' : 'hidden'
          } absolute right-0 top-16 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 z-50`}
        >
          {navItems.map((item) => {
            const isActive = !item.external && pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                onClick={() => setIsOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  isActive
                    ? 'text-green-600 bg-gray-100'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.name}
              </Link>
            )
          })}
          <hr className="my-1" />
          <button
            onClick={() => {
              setIsOpen(false)
              handleLogout()
            }}
            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
          >
            登出
          </button>
        </div>
      </div>
    </div>
  )
}
