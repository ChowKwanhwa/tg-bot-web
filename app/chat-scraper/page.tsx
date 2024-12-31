'use client'

import { useState, useEffect } from 'react'
import { SessionTest } from '@/types/session'

interface ScrapeResult {
  group: string
  totalMessages: number
  mediaFiles: number
  csvFile: string
  folderPath: string
}

interface UploadResult {
  name: string
  success: boolean
  error?: string
}

export default function ChatScraper() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<SessionTest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState('')
  const [messageLimit, setMessageLimit] = useState(1000)
  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  useEffect(() => {
    // This empty useEffect ensures the component is mounted
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setSelectedFiles(prev => {
        const uniqueFiles = newFiles.filter(newFile => 
          !prev.some(existingFile => existingFile.name === newFile.name)
        )
        return [...prev, ...uniqueFiles]
      })
    }
  }

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return

    setUploading(true)
    setError(null)
    setUploadResults([])

    try {
      const formData = new FormData()
      selectedFiles.forEach(file => {
        formData.append('files', file)
      })

      const response = await fetch('/api/chat-scraper/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.message)
      }

      setUploadResults(data.results)
    } catch (e: any) {
      setError(e.message || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setError(null)
    setResults([])

    try {
      const response = await fetch('/api/chat-scraper/test-sessions', {
        method: 'POST'
      })

      const data = await response.json()
      if (!data.success) {
        setError(data.message || 'Failed to test sessions')
        return
      }

      setResults(data.results)
    } catch (err: any) {
      setError(err.message || 'Failed to test sessions')
    } finally {
      setTesting(false)
    }
  }

  const handleScrape = async () => {
    if (!group) return

    setScraping(true)
    setError(null)
    setScrapeResult(null)
    setProgress(null)

    try {
      const response = await fetch('/api/chat-scraper/scrape-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          group,
          messageLimit,
        }),
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Failed to get response reader')

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(Boolean)

        for (const line of lines) {
          try {
            // Remove 'data: ' prefix if present
            const jsonStr = line.startsWith('data: ') ? line.slice(6) : line
            const data = JSON.parse(jsonStr)
            
            switch (data.type) {
              case 'progress':
                setProgress(data.data)
                break
              case 'result':
                setScrapeResult(data.data)
                break
              case 'error':
                if (!data.message.includes('Successfully connected')) {
                  throw new Error(data.message)
                }
                break
              case 'info':
                console.log('Info:', data.message)
                break
              default:
                console.log('Unknown message type:', data)
            }
          } catch (e) {
            // Only log parse errors if it's not an empty line
            if (line.trim()) {
              console.debug('Failed to parse line:', line)
            }
          }
        }
      }
    } catch (e: any) {
      setError(e.message || '抓取失败')
    } finally {
      setScraping(false)
    }
  }

  const handleDownload = async (type: 'csv' | 'all') => {
    if (!scrapeResult) return
    
    try {
      const response = await fetch('/api/chat-scraper/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          path: type === 'csv' ? scrapeResult.csvFile : scrapeResult.folderPath
        }),
      })

      if (!response.ok) {
        throw new Error('下载失败')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = type === 'csv' 
        ? `${scrapeResult.group}_messages.csv`
        : `${scrapeResult.group}_all.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e.message || '下载失败')
    }
  }

  const handleDeleteSession = async (filename: string) => {
    if (!confirm(`确定要删除 session 文件 ${filename} 吗？`)) {
      return
    }

    try {
      const response = await fetch('/api/chat-scraper/delete-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || '删除失败')
      }

      // 重新测试剩余的 sessions
      handleTest()
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div suppressHydrationWarning className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Session Files Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold mb-4">选择 Session 文件，如果没有，先去生成</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                选择文件
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept=".session"
                  multiple
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <button
                  onClick={handleUpload}
                  disabled={selectedFiles.length === 0 || uploading}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {uploading ? '上传中...' : '上传'}
                </button>
              </div>
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">已选择的文件:</h4>
                <ul className="divide-y divide-gray-200">
                  {selectedFiles.map((file, index) => (
                    <li key={index} className="py-2 flex justify-between items-center">
                      <span className="text-sm text-gray-900">{file.name}</span>
                      <button
                        onClick={() => handleRemoveFile(index)}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Upload Results */}
            {uploadResults.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">上传结果:</h4>
                <ul className="divide-y divide-gray-200">
                  {uploadResults.map((result, index) => (
                    <li key={index} className="py-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-900">{result.name}</span>
                        <span className={`text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                          {result.success ? '成功' : result.error || '失败'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Test Button */}
            <div>
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {testing ? '测试中...' : '测试 Sessions'}
              </button>
            </div>

            {/* Test Results */}
            {results.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">测试结果:</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Session File</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.map((result, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{result.session}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              result.status === 'valid'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {result.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.username || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.phone || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => handleDeleteSession(result.session)}
                              className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Group Scraper Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold mb-4">扒取指定群消息</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                群组名称
              </label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="例如: LSMM8 (不需要 @ 符号)"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                消息数量限制
              </label>
              <input
                type="number"
                value={messageLimit}
                onChange={(e) => setMessageLimit(parseInt(e.target.value) || 1000)}
                min="1"
                max="5000"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <button
                onClick={handleScrape}
                disabled={scraping || !group}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {scraping ? '抓取中...' : '开始抓取'}
              </button>
            </div>

            {/* Progress Bar */}
            {progress && (
              <div className="mt-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-blue-700">
                    进度: {progress.current}/{progress.total}
                  </span>
                  <span className="text-sm font-medium text-blue-700">
                    {Math.round((progress.current / progress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Scrape Results */}
            {scrapeResult && (
              <div className="mt-4 bg-green-50 rounded-lg p-4">
                <h4 className="text-lg font-medium text-green-800 mb-3">抓取结果</h4>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-sm font-medium text-green-600">群组</dt>
                    <dd className="mt-1 text-sm text-green-900">@{scrapeResult.group}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-green-600">总消息数</dt>
                    <dd className="mt-1 text-sm text-green-900">{scrapeResult.totalMessages}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-green-600">媒体文件数</dt>
                    <dd className="mt-1 text-sm text-green-900">{scrapeResult.mediaFiles}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex gap-4">
                  <button
                    onClick={() => handleDownload('csv')}
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
                  >
                    下载 CSV
                  </button>
                  <button
                    onClick={() => handleDownload('all')}
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
                  >
                    下载所有文件 (ZIP)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
