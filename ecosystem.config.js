module.exports = {
  apps: [
    {
      name: 'next-app',
      script: 'npm',
      args: 'start',
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