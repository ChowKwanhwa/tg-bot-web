'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { name: '生成Session文件', href: '/session-gen' },
  { name: '扒取群聊天', href: '/chat-scraper' },
  { name: '自动水群', href: '/auto-chat' },
]

export default function ClientSideNav() {
  const pathname = usePathname()
  
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
    </>
  )
}
