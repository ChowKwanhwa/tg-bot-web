'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // 如果用户访问根路径，自动跳转到 auto-chat 页面
    router.push('/auto-chat')
  }, [router])

  return null
}
