module.exports = {
  apps: [
    {
      name: 'recruitment-automation',
      script: 'main.js',
      interpreter: 'node',
      interpreter_args: '--experimental-sqlite',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      min_uptime: '30s',
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
    },
  ],
};
