'use client'

import { useState, useEffect } from 'react'
import { SessionTest } from '@/types/session'
import toast from '@/lib/toast'

interface Progress {
  current: number;
  total: number;
  percentage: number;
  message?: string;
}

interface ScrapeResult {
  group: string;
  totalMessages: number;
  mediaFiles: number;
  csvFile: string;
  folderPath: string;
}

interface UploadResult {
  name: string;
  success: boolean;
  error?: string;
}

export default function ChatScraper() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<SessionTest[]>([])
  const [group, setGroup] = useState('')
  const [messageLimit, setMessageLimit] = useState(1000)
  const [scraping, setScraping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [session, setSession] = useState<SessionTest | null>(null)

  useEffect(() => {
    // 获取会话信息
    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/check-session')
        const data = await response.json()
        console.log('Session check response:', data)
        if (data.success && data.user) {
          setSession(data.user)
        } else {
          console.error('Session check failed:', data)
        }
      } catch (error) {
        console.error('Failed to check session:', error)
      }
    }

    checkSession()
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
        method: 'POST',
      })

      const data = await response.json()
      console.log('Test response:', { status: response.status, data });

      if (!response.ok || !data.success) {
        setError(data.message || '测试会话文件失败')
        return
      }

      setResults(data.results || [])
    } catch (error: any) {
      console.error('Error testing sessions:', error)
      setError(error.message || '测试会话文件失败')
    } finally {
      setTesting(false)
    }
  }

  const handleScrape = async () => {
    setScraping(true)
    setError(null)
    setScrapeResult(null)
    setProgress(null)
    setIsComplete(false)

    try {
      const response = await fetch('/api/chat-scraper/scrape-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          group,
          messageLimit
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start scraping')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response stream available')
      }

      let tempResult: ScrapeResult | null = null;

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break;

        const text = new TextDecoder().decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim()
              if (!jsonStr) continue
              
              const data = JSON.parse(jsonStr)
              
              if (data.type === 'progress') {
                setProgress(data)
              } else if (data.type === 'result') {
                tempResult = data.data
              } else if (data.type === 'complete') {
                setIsComplete(true)
                if (tempResult) {
                  setScrapeResult(tempResult)
                }
              } else if (data.type === 'error') {
                setError(data.message)
                break
              } else if (data.type === 'heartbeat') {
                console.debug('Received heartbeat:', new Date(data.timestamp))
              }
            }
          } catch (e) {
            console.error('Error parsing line:', e, 'Line:', line)
          }
        }
      }
    } catch (e) {
      console.error('Scraping error:', e)
      setError(e instanceof Error ? e.message : '扒取过程中发生错误，请重试')
    } finally {
      setScraping(false)
    }
  }

  const handleDownload = async (type: 'csv' | 'all') => {
    console.log('handleDownload called with type:', type)
    console.log('scrapeResult:', scrapeResult)
    console.log('session:', session)

    if (!scrapeResult?.group) {
      console.error('No group in scrapeResult')
      toast.error('群组名称不存在');
      return;
    }

    if (!session?.id) {
      console.error('No session ID')
      toast.error('用户未登录');
      return;
    }

    try {
      // 移除群组名称中的 @ 符号，并转换为小写
      const cleanGroupName = scrapeResult.group.replace(/^@/, '').toLowerCase();
      const filePath = type === 'csv' 
        ? `scraped_data/${session.id}/${cleanGroupName}/${cleanGroupName}_messages.csv`
        : `scraped_data/${session.id}/${cleanGroupName}`;

      console.log('Sending download request with path:', filePath)
      
      const response = await fetch(`/api/chat-scraper/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath,
          type
        })
      });

      console.log('Download response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Download error response:', errorText)
        throw new Error(errorText || '下载失败');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'csv' ? `${cleanGroupName}_messages.csv` : `${cleanGroupName}_all.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('下载开始');
    } catch (error) {
      console.error('Download error:', error);
      toast.error(error instanceof Error ? error.message : '下载失败，请重试');
    }
  };

  const handleDelete = async (sessionFile: string) => {
    if (!confirm(`确定要删除会话文件 ${sessionFile} 吗？`)) {
      return
    }

    try {
      const requestData = { 
        sessionFile: sessionFile.endsWith('.session') ? sessionFile : sessionFile + '.session'
      };
      console.log('Deleting session file, request data:', requestData);

      const response = await fetch('/api/chat-scraper/delete-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      const data = await response.json()
      console.log('Delete response:', { 
        status: response.status, 
        statusText: response.statusText,
        data 
      });

      if (!response.ok || !data.success) {
        setError(data.message || '删除会话文件失败')
        return
      }

      // 删除成功后刷新会话列表
      await handleTest()
      setError(null)
    } catch (error: any) {
      console.error('Error deleting session:', error)
      setError(error.message || '删除会话文件失败')
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
              <p className="mt-2 text-sm text-gray-600">
                点击此按钮测试已上传的会话文件。如果还没有上传会话文件，请先上传。
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-400 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="text-red-700">{error}</p>
                </div>
                {error.includes('没有找到') && (
                  <div className="mt-2 pl-7">
                    <p className="text-sm text-gray-600">
                      看起来您还没有上传任何会话文件。请按照以下步骤操作：
                    </p>
                    <ol className="mt-2 text-sm text-gray-600 list-decimal pl-5 space-y-1">
                      <li>使用上方的文件上传功能</li>
                      <li>选择您的 Telegram 会话文件（.session）</li>
                      <li>点击上传按钮</li>
                      <li>等待上传完成后再次尝试测试</li>
                    </ol>
                  </div>
                )}
              </div>
            )}
            {/* Test Results */}
            {results.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">测试结果:</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2">SESSION FILE</th>
                        <th className="px-4 py-2">STATUS</th>
                        <th className="px-4 py-2">USERNAME</th>
                        <th className="px-4 py-2">PHONE</th>
                        <th className="px-4 py-2">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result) => (
                        <tr key={result.id} className="border-t">
                          <td className="px-4 py-2">{result.session}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-1 rounded ${
                              result.status === 'valid' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {result.status}
                            </span>
                          </td>
                          <td className="px-4 py-2">{result.username}</td>
                          <td className="px-4 py-2">{result.phone}</td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => handleDelete(result.session)}
                              className="text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded"
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
              <p className="mt-2 text-sm text-gray-600">
                扒取过程花费时间较长，1000条消息可能高达20分钟，请耐心等待。扒取完成后会自动显示下载选项。
              </p>
            </div>

            {/* Progress Bar */}
            {progress && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>进度：{progress.current} / {progress.total}</span>
                  <span>{Math.round(progress.percentage)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress.percentage}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Scrape Results */}
            {scrapeResult && isComplete && (
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
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  >
                    下载 CSV
                  </button>
                  <button
                    onClick={() => handleDownload('all')}
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  >
                    下载所有文件 (ZIP)
                  </button>
                </div>
              </div>
            )}

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
      </div>
    </div>
  )
}
