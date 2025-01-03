'use client'

import { useState } from 'react'

interface SessionInfo {
  phone: string
  first_name: string
  last_name: string
  username: string
  id: number
}

interface EditForm {
  first_name: string
  last_name: string
  username: string
  photo: File | null
}

export default function SessionInfo() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingSession, setEditingSession] = useState<SessionInfo | null>(null)
  const [updateLoading, setUpdateLoading] = useState(false)
  const [form, setForm] = useState<EditForm>({
    first_name: '',
    last_name: '',
    username: '',
    photo: null
  })
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({})
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null)

  const handleFetchInfo = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/session/info')
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || '获取会话信息失败')
      }

      setSessions(data.sessions)
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (session: SessionInfo) => {
    setEditingSession(session)
    setForm({
      first_name: session.first_name || '',
      last_name: session.last_name || '',
      username: session.username?.replace(/^@/, '') || '',
      photo: null
    })
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    const file = files[0]
    setSelectedFile(file)
    setSelectedFileUrl(URL.createObjectURL(file))
    setForm(prev => ({
      ...prev,
      photo: file
    }))
  }

  const validateUsername = (username: string) => {
    if (!username) return true; // 允许为空
    // 移除@符号（如果有）
    username = username.replace('@', '');
    // Telegram用户名规则：
    // 1. 以字母开头
    // 2. 以字母或数字结尾
    // 3. 中间可以包含字母、数字、下划线
    // 4. 长度在5-32之间
    const usernameRegex = /^[a-zA-Z][\w\d]{3,30}[a-zA-Z\d]$/;
    return usernameRegex.test(username);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSession) return

    // 重置错误状态
    setFormErrors({})

    try {
      setUpdateLoading(true)
      const formData = new FormData()
      formData.append('session_name', editingSession.phone) // 添加session标识

      // 只添加已修改的字段
      if (form.username !== editingSession.username) formData.append('username', form.username)
      if (form.first_name !== editingSession.first_name) formData.append('first_name', form.first_name)
      if (form.last_name !== editingSession.last_name) formData.append('last_name', form.last_name)
      if (selectedFile) formData.append('photo', selectedFile)

      const response = await fetch('/api/session/update', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: AbortSignal.timeout(300000)
      })

      const result = await response.json()

      if (!result.success) {
        // 根据错误消息类型设置对应字段的错误
        if (result.error.toLowerCase().includes('username')) {
          setFormErrors(prev => ({ ...prev, username: result.error }))
        } else if (result.error.toLowerCase().includes('first name')) {
          setFormErrors(prev => ({ ...prev, first_name: result.error }))
        } else if (result.error.toLowerCase().includes('last name')) {
          setFormErrors(prev => ({ ...prev, last_name: result.error }))
        } else if (result.error.toLowerCase().includes('photo')) {
          setFormErrors(prev => ({ ...prev, photo: result.error }))
        } else {
          // 如果无法确定具体字段，显示为通用错误
          setFormErrors(prev => ({ ...prev, general: result.error }))
        }
        return
      }

      // 只有在成功时才重置和刷新
      setEditingSession(null)
      setForm({
        first_name: '',
        last_name: '',
        username: '',
        photo: null
      })
      setSelectedFile(null)
      setSelectedFileUrl(null)
    } catch (err) {
      setFormErrors(prev => ({ ...prev, general: 'Failed to update profile' }))
    } finally {
      setUpdateLoading(false)
    }
  }

  if (error) {
    return (
      <div className="container">
        <div className="error-message">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="title text-2xl font-bold">Telegram 账号信息</h1>
        <button
          onClick={handleFetchInfo}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? '获取中...' : '查看账号信息'}
        </button>
      </div>
      
      {/* 编辑表单 */}
      {editingSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">修改账号信息</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              {/* 通用错误提示 */}
              {formErrors.general && (
                <div className="text-red-500 text-sm p-2 bg-red-50 rounded">{formErrors.general}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  名字
                </label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={e => setForm(prev => ({ ...prev, first_name: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                {formErrors.first_name && (
                  <div className="text-red-500 text-sm mt-1">{formErrors.first_name}</div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  姓氏
                </label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={e => setForm(prev => ({ ...prev, last_name: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                {formErrors.last_name && (
                  <div className="text-red-500 text-sm mt-1">{formErrors.last_name}</div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  用户名
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
                    @
                  </span>
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => setForm(prev => ({ ...prev, username: e.target.value.replace(/^@/, '') }))}
                    className="pl-7 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="username"
                  />
                  {formErrors.username && (
                    <div className="text-red-500 text-sm mt-1">{formErrors.username}</div>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">不需要输入@符号</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  头像
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {formErrors.photo && (
                  <div className="text-red-500 text-sm mt-1">{formErrors.photo}</div>
                )}
                {selectedFileUrl && (
                  <img src={selectedFileUrl} alt="Preview" className="mt-2 h-20 w-20 object-cover rounded-full" />
                )}
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={updateLoading}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {updateLoading ? '更新中...' : '更新'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-container bg-white rounded-lg shadow overflow-hidden">
        <div className="table-wrapper overflow-x-auto">
          <table className="table min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  手机号
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  名字
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  姓氏
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  用户名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4">
                    <div className="loading-placeholder animate-pulse space-y-2">
                      <div className="loading-line h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="loading-line h-4 bg-gray-200 rounded w-1/2"></div>
                      <div className="loading-line h-4 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500 empty-message">
                    没有找到任何会话信息
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.phone} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {session.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {session.first_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {session.last_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 username">
                      {session.username ? `@${session.username}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {session.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <button
                        onClick={() => handleEdit(session)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
