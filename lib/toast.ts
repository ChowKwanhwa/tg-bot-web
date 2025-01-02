import toast from 'react-hot-toast'

export default {
  success: (message: string) => {
    toast.success(message, {
      duration: 3000,
      position: 'top-right',
    })
  },
  error: (message: string) => {
    toast.error(message, {
      duration: 4000,
      position: 'top-right',
    })
  },
  loading: (message: string) => {
    return toast.loading(message, {
      position: 'top-right',
    })
  },
  dismiss: (toastId: string) => {
    toast.dismiss(toastId)
  }
}
