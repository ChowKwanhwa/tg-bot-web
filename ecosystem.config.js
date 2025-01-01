module.exports = {
  apps: [
    {
      name: 'next-app',
      script: 'npm',
      args: 'run dev',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000
    },
    {
      name: 'ngrok',
      script: 'ngrok',
      args: 'http 3000',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000
    }
  ]
}
