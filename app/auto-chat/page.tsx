'use client'

import { useState, useEffect, useRef } from 'react'
import { SessionTest } from '../../types/session'

interface UploadResult {
  name: string
  success: boolean
  error?: string
}

interface MessageSource {
  name: string
  path: string
}

export default function AutoChat() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<SessionTest[]>([])
  const [error, setError] = useState<string | null>(null)
  
  // 消息源上传相关状态
  const [newSourceName, setNewSourceName] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [uploadingSource, setUploadingSource] = useState(false)
  const [uploadSourceError, setUploadSourceError] = useState<string | null>(null)
  const [uploadSourceSuccess, setUploadSourceSuccess] = useState<string | null>(null)
  
  // Auto Chat 相关状态
  const [targetGroup, setTargetGroup] = useState('')
  const [isTopic, setIsTopic] = useState(false)
  const [topicId, setTopicId] = useState('')
  const [autoChatting, setAutoChatting] = useState(false)
  const [autoChatStatus, setAutoChatStatus] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [status, setStatus] = useState<string[]>([])
  const [messageInterval, setMessageInterval] = useState('2-10')
  const [messageSources, setMessageSources] = useState<MessageSource[]>([])
  const [selectedSource, setSelectedSource] = useState<string>('')
  const [messageSourcesError, setMessageSourcesError] = useState<string | null>(null)
  const statusRef = useRef<HTMLDivElement>(null)

  // 获取消息源列表
  const fetchMessageSources = async () => {
    try {
      setMessageSourcesError(null);
      const response = await fetch('/api/auto-chat/get-message-sources');
      const data = await response.json();
      if (data.success) {
        setMessageSources(data.sources);
      } else {
        setMessageSourcesError(data.error || 'Failed to fetch message sources');
      }
    } catch (error: any) {
      setMessageSourcesError(error.message || 'Error fetching message sources');
    }
  };

  useEffect(() => {
    // Fetch available message sources
    fetchMessageSources();
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
      // Clear selected files after successful upload
      setSelectedFiles([])
      // Automatically test sessions after upload
      handleTest()
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

  const handleStartAutoChat = async () => {
    setIsRunning(true);
    setStatus([]);

    try {
      const response = await fetch('/api/auto-chat/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetGroup,
          isTopic,
          topicId: isTopic ? parseInt(topicId) : undefined,
          messageInterval,
          messageSource: selectedSource
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              try {
                const jsonStr = line.trim().replace('data: ', '');
                const data = JSON.parse(jsonStr);
                
                if (data.type === 'status') {
                  setStatus(prev => [...prev, data.message]);
                  if (statusRef.current) {
                    statusRef.current.scrollTop = statusRef.current.scrollHeight;
                  }
                }
              } catch (e) {
                // Removed console.error
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      // Removed console.error
      setStatus(prev => [...prev, `Error: ${error}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleStopAutoChat = async () => {
    try {
      const response = await fetch('/api/auto-chat/stop', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setStatus(prev => [...prev, 'Stopping auto chat...']);
    } catch (error) {
      // Removed console.error
      setStatus(prev => [...prev, `Error stopping auto chat: ${error}`]);
    }
  };

  // 处理消息源文件选择
  const handleCsvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCsvFile(e.target.files[0])
    }
  }

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setMediaFiles(Array.from(e.target.files))
    }
  }

  const handleRemoveMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index))
  }

  // 上传消息源
  const handleUploadMessageSource = async () => {
    if (!csvFile || !newSourceName) {
      setUploadSourceError('Please select a CSV file and provide a source name')
      return
    }

    setUploadingSource(true)
    setUploadSourceError(null)
    setUploadSourceSuccess(null)

    try {
      const formData = new FormData()
      formData.append('csv', csvFile)
      formData.append('sourceName', newSourceName)
      mediaFiles.forEach(file => {
        formData.append('media', file)
      })

      const response = await fetch('/api/auto-chat/upload-message-source', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error)
      }

      // 显示成功消息
      setUploadSourceSuccess('Message source uploaded successfully!')

      // 清除表单
      setNewSourceName('')
      setCsvFile(null)
      setMediaFiles([])
      
      // 刷新消息源列表
      fetchMessageSources()
    } catch (e: any) {
      setUploadSourceError(e.message || 'Failed to upload message source')
    } finally {
      setUploadingSource(false)
    }
  }

  return (
    <div suppressHydrationWarning className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Session Files Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold mb-4">上传用于水群的session文件（点击测试sessions查看现有的）</h3>
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

        {/* Message Source Upload Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold mb-4">上传消息源</h3>
          <div className="space-y-4">
            {/* Source Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                自定义消息源名称
              </label>
              <input
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                placeholder="e.g., MyGroup"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* CSV File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                消息列表（csv格式）
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {csvFile && (
                <p className="mt-1 text-sm text-gray-500">
                  Selected file: {csvFile.name}
                </p>
              )}
            </div>

            {/* Media Files Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                媒体文件（可以是视频，图片，gif或者贴纸）
              </label>
              <input
                type="file"
                multiple
                onChange={handleMediaSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {mediaFiles.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-gray-700 mb-1">Selected files:</p>
                  <ul className="space-y-1">
                    {mediaFiles.map((file, index) => (
                      <li key={index} className="flex justify-between items-center text-sm text-gray-600">
                        <span>{file.name}</span>
                        <button
                          onClick={() => handleRemoveMedia(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Upload Button */}
            <div>
              <button
                onClick={handleUploadMessageSource}
                disabled={uploadingSource || !csvFile || !newSourceName}
                className={`px-4 py-2 rounded-md text-white ${
                  uploadingSource || !csvFile || !newSourceName
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {uploadingSource ? 'Uploading...' : 'Upload Message Source'}
              </button>
            </div>

            {/* Error Message */}
            {uploadSourceError && (
              <div className="mt-2 text-sm text-red-600">
                {uploadSourceError}
              </div>
            )}

            {/* Success Message */}
            {uploadSourceSuccess && (
              <div className="mt-2 text-sm text-green-600">
                {uploadSourceSuccess}
              </div>
            )}
          </div>
        </div>

        {/* Auto Chat Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold mb-4">自动水群</h3>
          <div className="space-y-4">
            {/* Target Group Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                目标群组
              </label>
              <input
                type="text"
                value={targetGroup}
                onChange={(e) => setTargetGroup(e.target.value)}
                placeholder="例如: https://t.me/groupname"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Topic Settings */}
            <div className="space-y-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isTopic"
                  checked={isTopic}
                  onChange={(e) => setIsTopic(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isTopic" className="ml-2 block text-sm text-gray-900">
                  是否为 Topic 群组
                </label>
              </div>

              {isTopic && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Topic ID
                  </label>
                  <input
                    type="number"
                    value={topicId}
                    onChange={(e) => setTopicId(e.target.value)}
                    placeholder="例如: 3"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Message Source Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                消息源
              </label>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">选择一个消息源（如果没有，先去自动扒取或者自己上传一个）</option>
                {messageSources.map((source) => (
                  <option key={source.name} value={source.name}>
                    {source.name}
                  </option>
                ))}
              </select>
              {messageSourcesError && (
                <p className="mt-1 text-sm text-red-600">{messageSourcesError}</p>
              )}
            </div>

            {/* Message Interval */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                消息间隔（秒）
              </label>
              <input
                type="text"
                value={messageInterval}
                onChange={(e) => setMessageInterval(e.target.value)}
                placeholder="例如: 2-10"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                格式：min-max（例如：2-10 表示随机间隔 2-10 秒）
              </p>
            </div>

            {/* Start Button */}
            <div className="flex gap-4 mb-4">
              <button
                onClick={handleStartAutoChat}
                disabled={isRunning || !targetGroup || (isTopic && !topicId)}
                className={`px-4 py-2 rounded-md text-white ${
                  isRunning || !targetGroup || (isTopic && !topicId)
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {isRunning ? '运行中...' : '开始自动聊天'}
              </button>

              <button
                onClick={handleStopAutoChat}
                disabled={!isRunning}
                className={`px-4 py-2 rounded-md text-white ${
                  !isRunning
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                停止自动聊天
              </button>
            </div>

            {/* Status Display */}
            <div 
              ref={statusRef}
              className="flex-1 min-h-[24rem] rounded-lg overflow-y-auto px-8 py-6"
            >
              {status.length === 0 && (
                <div className="max-w-3xl mx-auto space-y-8">
                  <div>
                    <h3 className="text-xl font-semibold mb-4">功能介绍</h3>
                    <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                      自动水群 是一个自动化消息发送工具，可以按照预设的时间间隔自动发送消息到指定的 Telegram 群组或频道。 
                      支持发送文本、图片、视频、贴纸等多种类型的消息；此外，有20%的几率随机回复别的消息，20%的几率对别的消息进行表情反应，让水群更真实。
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-4">使用步骤</h3>
                    <ul className="space-y-4">
                      <li>
                        <strong>目标群组：</strong>
                        <span className="text-gray-600 dark:text-gray-400">
                          输入目标 Telegram 群组或频道的链接（例如：https://t.me/example）；
                        </span>
                      </li>
                      <li>
                        <strong>Topic 设置：</strong>
                        <span className="text-gray-600 dark:text-gray-400">
                          如果目标群组是否是一个 Topics 群组，如果是，请勾选"是否为 Topic 群组"并输入 Topic ID； 
                          比如https://t.me/linqingfeng221，General 的topic id是1，韩国区的topic id是3，这个你点击邀请链接的时候可以看到；
                        </span>
                      </li>
                      <li>
                        <strong>消息源选择：</strong>
                        <span className="text-gray-600 dark:text-gray-400">
                          从下拉菜单中选择要使用的消息源。如果没有合适的消息源，可以去"扒取群聊天"自动扒取指定群的聊天消息，也可以使用上方的"Upload Message Source"功能上传；
                        </span>
                      </li>
                      <li>
                        <strong>发送间隔：</strong>
                        <span className="text-gray-600 dark:text-gray-400">
                          设置消息发送的时间间隔（格式：min-max，例如：2-10 表示随机 2-10 秒）；
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-4">注意事项</h3>
                    <ul className="list-disc pl-5 space-y-2 text-gray-600 dark:text-gray-400">
                      <li>建议设置2-10秒的消息间隔，你也可以看情况自行调整；</li>
                      <li>消息源文件必须包含正确的格式和必要的媒体文件；</li>
                      <li>可以随时点击"停止自动聊天"按钮终止消息发送；</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-4">常见问题</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="font-medium">Q: 为什么消息没有发送成功？</h4>
                        <p className="text-gray-600 dark:text-gray-400 pl-4">
                          A: 请检查：1) 机器人是否在群组中 2) 是否有发送权限 3) 消息源格式是否正确
                        </p>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-medium">Q: 如何准备消息源文件？</h4>
                        <p className="text-gray-600 dark:text-gray-400 pl-4">
                          A: 使用 Message Scraper 功能从其他群组抓取消息，或按照要求的格式准备 CSV 文件
                        </p>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-medium">Q: 支持哪些类型的消息？</h4>
                        <p className="text-gray-600 dark:text-gray-400 pl-4">
                          A: 支持文本、图片、视频、动图、贴纸等多种类型的消息
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {status.map((msg, i) => (
                <div key={i} className="text-gray-600 dark:text-gray-400 mb-2">
                  {msg}
                </div>
              ))}
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
